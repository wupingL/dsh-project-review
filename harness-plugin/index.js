/**
 * RecSDK 代码检视插件 · Host 半身
 *
 * 职责：
 *  - 以受控的只读方式调用 Python 控制器 CLI（review list / review show / doctor），
 *    不持有模型凭据、不直接访问 GitCode、不写控制器状态；
 *  - 通过同源 HTTP 路由把控制器 JSON 提供给浏览器半身（client.js）；
 *  - 把同样的操作注册为 Agent 工具（一个操作，两个调用方）。
 *
 * 控制器负责业务状态：SQLite 队列、报告目录、审查指纹与"是否当前"的判定。
 * 本插件只做读取、缓存与转发。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const name = 'recsdk-review';
export const inject = ['tools'];

const ROUTE_PREFIX = '/recsdk-review/api';
// 插件目录（harness-plugin/）的上一级就是控制器工程目录；本地目录安装/仓库克隆后
// 无需再手工填写 projectRoot，只有把控制器放在别处时才需要在 bundle 配置里覆盖。
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(PLUGIN_DIR, '..');
const MAX_STDOUT = 8 * 1024 * 1024;
const MAX_STDERR = 200 * 1024;

function resolveOptions(config) {
  const value = config && typeof config === 'object' ? config : {};
  const root = typeof value.projectRoot === 'string' && value.projectRoot
    ? value.projectRoot
    : DEFAULT_PROJECT_ROOT;
  const python = typeof value.python === 'string' && value.python
    ? value.python
    : path.join(root, '.venv', 'Scripts', 'python.exe');
  const configFile = typeof value.configFile === 'string' && value.configFile
    ? value.configFile
    : path.join(root, 'config', 'recsdk.json');
  const timeout = Number(value.cliTimeoutMs);
  const syncTimeout = Number(value.syncTimeoutMs);
  const reviewTimeout = Number(value.reviewTimeoutMs);
  const bridgePort = Number(value.bridgePort);
  const autoPoll = Number(value.autoReviewPollMs);
  return {
    root,
    python,
    configFile,
    cliTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 120000,
    syncTimeoutMs: Number.isFinite(syncTimeout) && syncTimeout > 0 ? syncTimeout : 1800000,
    reviewTimeoutMs: Number.isFinite(reviewTimeout) && reviewTimeout > 0 ? reviewTimeout : 3600000,
    bridgePort: Number.isInteger(bridgePort) && bridgePort > 0 && bridgePort < 65536 ? bridgePort : 55114,
    // PR head 变化后自动重新审查（只针对已经审查过一次的 PR，不批量审查未审查列表）。
    autoReviewUpdates: value.autoReviewUpdates !== false,
    autoReviewPollMs: Number.isFinite(autoPoll) && autoPoll >= 1000 ? autoPoll : 120000,
    powershell: typeof value.powershell === 'string' && value.powershell ? value.powershell : null,
  };
}

/** 执行控制器 CLI；返回 {ok, data} 或 {ok:false, error}。永不抛出。 */
function runCli(options, args, timeoutMs = options.cliTimeoutMs, input = null) {
  return new Promise((resolve) => {
    const executable = existsSync(options.python) ? options.python : 'python';
    let child;
    try {
      child = spawn(executable, ['-m', 'project_assistant.cli', '--config', options.configFile, ...args], {
        cwd: options.root,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
    } catch (error) {
      resolve({ ok: false, error: `无法启动控制器解释器：${error && error.message ? error.message : String(error)}` });
      return;
    }
    try {
      if (typeof input === 'string' && input.length) child.stdin.write(input);
      child.stdin.end();
    } catch {
      /* 忽略 stdin 写入失败：控制器会按缺失输入处理 */
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      finish({ ok: false, error: `控制器命令超时（${Math.round(timeoutMs / 1000)} 秒）：${args.join(' ')}` });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_STDOUT) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      finish({ ok: false, error: `无法启动控制器：${error && error.message ? error.message : String(error)}` });
    });
    child.on('close', (code) => {
      let data;
      try {
        data = JSON.parse(stdout);
      } catch {
        data = undefined;
      }
      if (data !== undefined && data !== null) {
        // 控制器约定：成功 JSON 走 stdout；doctor 未就绪时 stdout 也可能是完整健康对象。
        if (code === 0 || (data && typeof data === 'object' && !data.error)) {
          finish({ ok: true, data, code });
          return;
        }
        if (data && data.error) {
          finish({ ok: false, error: String(data.error), data, code });
          return;
        }
        finish({ ok: false, error: `控制器命令失败（退出码 ${code}）`, data, code });
        return;
      }
      const detail = (stderr || stdout || '').trim().slice(0, 2000);
      finish({ ok: false, error: detail || `控制器命令失败（退出码 ${code}）：${args.join(' ')}` });
    });
  });
}

/** 短期缓存 + 并发去重：列表/详情查询都会启动一次 Python 进程。 */
/** 长期运行的任务（知识库构建）：边跑边收集 stderr 进度行，stdout 结束时解析 JSON。 */
function runCliJob(options, args, timeoutMs, extraEnv = {}) {
  const job = {
    job_id: `job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    progress: [],
    result: null,
    error: null,
  };
  const executable = existsSync(options.python) ? options.python : 'python';
  let child;
  try {
    child = spawn(executable, ['-m', 'project_assistant.cli', '--config', options.configFile, ...args], {
      cwd: options.root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...extraEnv },
    });
  } catch (error) {
    job.status = 'error';
    job.error = `无法启动控制器：${error && error.message ? error.message : String(error)}`;
    job.finished_at = new Date().toISOString();
    return job;
  }
  let stdout = '';
  let stderr = '';
  let buffered = '';
  const pushProgress = (line) => {
    const text = String(line || '').trim();
    if (!text) return;
    job.progress.push(text);
    if (job.progress.length > 200) job.progress.splice(0, job.progress.length - 200);
  };
  const timer = setTimeout(() => {
    try { child.kill(); } catch { /* ignore */ }
    job.status = 'error';
    job.error = `知识库构建超时（${Math.round(timeoutMs / 1000)} 秒）`;
    job.finished_at = new Date().toISOString();
  }, timeoutMs);
  child.stdout.on('data', (chunk) => {
    if (stdout.length < MAX_STDOUT) stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    if (stderr.length < MAX_STDERR) stderr += text;
    buffered += text;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || '';
    for (const line of lines) pushProgress(line);
  });
  child.on('error', (error) => {
    clearTimeout(timer);
    job.status = 'error';
    job.error = `无法启动控制器：${error && error.message ? error.message : String(error)}`;
    job.finished_at = new Date().toISOString();
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (buffered.trim()) pushProgress(buffered);
    if (job.status === 'error') return;
    try {
      const data = JSON.parse(stdout);
      if (data && typeof data === 'object' && data.error) {
        job.status = 'error';
        job.error = String(data.error);
      } else if (data && typeof data === 'object' && data.ready === false) {
        // 例如 review run 的 doctor 门禁：把具体缺项返回给页面。
        const errors = data.errors && typeof data.errors === 'object' ? Object.values(data.errors) : [];
        job.status = 'error';
        job.error = errors.length ? String(errors[0]) : '控制器未就绪';
      } else if (code === 0) {
        job.status = 'done';
        job.result = data;
      } else {
        job.status = 'error';
        job.error = `控制器退出码 ${code}`;
      }
    } catch {
      job.status = 'error';
      job.error = (stderr || stdout || '').trim().slice(0, 2000) || `控制器退出码 ${code}`;
    }
    job.finished_at = new Date().toISOString();
  });
  return job;
}

/** 读取 POST JSON body（上限 1MB）。 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error(`请求体不是合法 JSON：${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

function createMemo() {
  const values = new Map();
  const inflight = new Map();
  async function memo(key, ttlMs, loader) {
    const hit = values.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    if (inflight.has(key)) return inflight.get(key);
    const promise = (async () => {
      try {
        const value = await loader();
        values.set(key, { at: Date.now(), value });
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }
  memo.clear = () => {
    values.clear();
    inflight.clear();
  };
  return memo;
}

const NULL_REVIEW = {
  status: 'none',
  report_dir: null,
  current: false,
  checked_at: null,
  invalidated_at: null,
  reviewed_at: null,
  reviewed_head_sha: null,
  mode: null,
  knowledge_mode: null,
  fingerprint: null,
  findings: 0,
  severity: { critical: 0, high: 0, medium: 0, low: 0 },
  coverage_gaps: 0,
  job_status: null,
  job_attempts: null,
  job_error: null,
  job_updated: null,
};

/** 控制器失败时给出一条可渲染的空结果，避免整个页面白屏。 */
function emptyListResult(message) {
  return {
    generated_at: new Date().toISOString(),
    repo: { url: '', id: '', state_dir: '' },
    branches: [],
    source: 'error',
    source_error: message || '控制器不可用',
    counts: { total: 0, open: 0, reviewed: 0, stale: 0, pending: 0, failed: 0 },
    prs: [],
  };
}

function emptyDetailResult(number, message) {
  return {
    generated_at: new Date().toISOString(),
    source: 'error',
    source_error: message || '控制器不可用',
    pr: {
      number: Number(number),
      title: `PR #${number}`,
      state: null,
      draft: false,
      target: null,
      source_branch: null,
      head_sha: null,
      base_sha: null,
      author: { login: null, name: null, html_url: null },
      labels: [],
      pipeline_status: null,
      mergeable: null,
      comments: null,
      added_lines: null,
      removed_lines: null,
      html_url: null,
      created_at: null,
      updated_at: null,
      active: true,
      body: null,
      review: { ...NULL_REVIEW },
    },
    files: { changed: [], source: 'none' },
    review: {
      ...NULL_REVIEW,
      metadata: null,
      intent: null,
      summary: null,
      findings: [],
      risks_to_verify: [],
      coverage_gaps: [],
      affected_flows: [],
      verification_plan: [],
      stale_message: null,
    },
    job: { status: null, attempts: null, error: null, updated: null },
  };
}

function healthResult(payload, error) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const model = data.model && typeof data.model === 'object' ? data.model : {};
  const errors = data.errors && typeof data.errors === 'object' ? data.errors : {};
  const firstError = Object.values(errors)[0];
  return {
    ok: data.ready === true,
    checks: data.checks && typeof data.checks === 'object' ? data.checks : {},
    errors,
    model: {
      provider: model.provider ?? null,
      endpoint_id: model.endpoint_id ?? null,
      model: model.model ?? null,
      supports_writable: model.supports_writable === true,
      configured: model.configured === true,
      credential: model.credential && typeof model.credential === 'object' ? model.credential : {},
    },
    message: data.ready === true
      ? '控制器只读就绪；语义审查还需要可用的模型路由。'
      : (error || firstError || '控制器未就绪'),
  };
}

function json(res, status, value) {
  let body;
  try {
    body = Buffer.from(JSON.stringify(value), 'utf8');
  } catch (error) {
    body = Buffer.from(JSON.stringify({ error: `无法序列化响应：${String(error)}` }), 'utf8');
    status = 500;
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

/**
 * 宿主模型桥：在 127.0.0.1 上起一个带随机令牌的最小 OpenAI 兼容服务，
 * 把控制器的 /chat/completions 请求转成宿主 llm.stream 调用。
 * 不经过 DSH Web 端口（那里需要浏览器会话鉴权），因此控制器可直连。
 */
function createModelBridge(hostBridge, options) {
  const tokenFile = path.join(options.root, '.harness-bridge-token');
  let token = null;
  try {
    if (existsSync(tokenFile)) {
      const stored = readFileSync(tokenFile, 'utf8').trim();
      if (stored) token = stored;
    }
  } catch {
    /* 读取失败则重新生成 */
  }
  if (!token) {
    token = randomBytes(24).toString('hex');
    try {
      writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
    } catch {
      /* 无法持久化时仅本次进程有效 */
    }
  }
  let server = null;
  let port = null;
  let starting = null;
  const preferredPort = Number(options.bridgePort) > 0 ? Number(options.bridgePort) : 0;

  function send(res, status, value) {
    const body = Buffer.from(JSON.stringify(value), 'utf8');
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length });
    res.end(body);
  }

  function authorized(req) {
    const header = String(req.headers.authorization || '');
    return header === `Bearer ${token}`;
  }

  function handle(req, res) {
    const url = String(req.url || '/');
    if (!authorized(req)) {
      send(res, 401, { error: { message: 'bridge unauthorized' } });
      return;
    }
    if (req.method === 'GET' && (url === '/v1/models' || url === '/models')) {
      hostBridge.models()
        .then((payload) => send(res, 200, payload))
        .catch((error) => send(res, 500, { error: { message: error && error.message ? error.message : String(error) } }));
      return;
    }
    if (req.method === 'POST' && (url === '/v1/chat/completions' || url === '/chat/completions')) {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) {
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        let payload = {};
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          send(res, 400, { error: { message: 'invalid json' } });
          return;
        }
        hostBridge.chatCompletion(payload)
          .then((value) => send(res, 200, value))
          .catch((error) => send(res, 500, {
            error: { message: error && error.message ? error.message : String(error) },
          }));
      });
      return;
    }
    send(res, 404, { error: { message: 'not found' } });
  }

  function ensure() {
    if (server) return Promise.resolve({ base_url: `http://127.0.0.1:${port}/v1`, token });
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      const instance = http.createServer(handle);
      const start = (listenPort) => {
        instance.once('error', (error) => {
          if (listenPort !== 0) {
            // 首选端口被占用时退回临时端口（地址变化需重新执行“使用 Harness 模型”）。
            try { instance.close(); } catch { /* ignore */ }
            start(0);
            return;
          }
          starting = null;
          reject(error);
        });
        instance.listen(listenPort, '127.0.0.1', () => {
          server = instance;
          port = instance.address().port;
          starting = null;
          resolve({ base_url: `http://127.0.0.1:${port}/v1`, token });
        });
      };
      start(preferredPort);
    });
    return starting;
  }

  function dispose() {
    if (server) {
      try { server.close(); } catch { /* ignore */ }
      server = null;
      port = null;
    }
  }

  return { ensure, dispose, token: () => token };
}

/** 从模型输出中提取 JSON 对象：去掉代码围栏与前后解释。 */
function coerceJsonObject(text) {
  let value = String(text || '').trim();
  const fenced = /^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/.exec(value);
  if (fenced) value = fenced[1].trim();
  if (value.startsWith('{') && value.endsWith('}')) return value;
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start >= 0 && end > start) return value.slice(start, end + 1);
  return value;
}

function createHostBridge(ctx) {  function service(key) {
    try {
      return typeof ctx.get === 'function' ? ctx.get(key) : undefined;
    } catch {
      return undefined;
    }
  }

  function pickPath(value, pathParts) {
    let current = value;
    for (const part of Array.isArray(pathParts) ? pathParts : []) {
      if (current === null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  /** 枚举 DeepSeek Harness 已配置的模型路由，供控制器模型配置页做默认选项。 */
  async function harnessModels() {
    const llm = service('llm');
    if (!llm || typeof llm.listProviders !== 'function') {
      return { available: false, providers: [], reason: '宿主未提供 llm 服务' };
    }
    let providers = [];
    try {
      providers = await llm.listProviders();
    } catch (error) {
      return { available: false, providers: [], reason: error && error.message ? error.message : String(error) };
    }
    let configurable = [];
    try {
      configurable = typeof llm.listConfigurableProviders === 'function'
        ? await llm.listConfigurableProviders()
        : [];
    } catch {
      configurable = [];
    }
    const settings = service('settings');
    let descriptors = [];
    try {
      descriptors = settings && typeof settings.describe === 'function'
        ? settings.describe({ redactSecrets: true })
        : [];
    } catch {
      descriptors = [];
    }
    const byNamespace = new Map();
    for (const descriptor of Array.isArray(descriptors) ? descriptors : []) {
      byNamespace.set(String(descriptor.ns), descriptor);
    }
    const configByProvider = new Map();
    for (const entry of Array.isArray(configurable) ? configurable : []) {
      configByProvider.set(entry.provider, entry);
    }
    const items = [];
    for (const provider of Array.isArray(providers) ? providers : []) {
      let models = [];
      try {
        models = await llm.listModels(provider.id);
      } catch {
        models = [];
      }
      const config = configByProvider.get(provider.id) || null;
      let baseUrl = config && config.defaultBaseURL ? config.defaultBaseURL : null;
      let credentialEnv = null;
      if (config && config.nativeAuth && Array.isArray(config.nativeAuth.env) && config.nativeAuth.env.length) {
        credentialEnv = config.nativeAuth.env[0];
      }
      let settingsValue = null;
      let api = null;
      if (config && config.settingsNs && byNamespace.has(String(config.settingsNs))) {
        const descriptor = byNamespace.get(String(config.settingsNs));
        settingsValue = descriptor.value ?? null;
        const configuredBase = pickPath(descriptor.value, config.settingsPath);
        if (typeof configuredBase === 'string' && configuredBase) baseUrl = configuredBase;
        // llm-pi-ai 一类提供方把具体路由放在 providers.<id> 下。
        if (settingsValue && typeof settingsValue === 'object') {
          const table = settingsValue.providers && typeof settingsValue.providers === 'object'
            ? settingsValue.providers
            : null;
          const entry = table
            ? (table[provider.id] || Object.values(table)[0] || null)
            : null;
          if (entry && typeof entry === 'object') {
            if (typeof entry.baseURL === 'string' && entry.baseURL) baseUrl = entry.baseURL;
            if (typeof entry.apiKeyEnv === 'string' && entry.apiKeyEnv) credentialEnv = entry.apiKeyEnv;
            if (typeof entry.api === 'string' && entry.api) api = entry.api;
          }
          if (!credentialEnv && typeof settingsValue.apiKeyEnv === 'string') credentialEnv = settingsValue.apiKeyEnv;
          if (!api && typeof settingsValue.api === 'string') api = settingsValue.api;
        }
      }
      const openAICompatible = provider.id === 'deepseek-official' || provider.id === 'deepseek-account'
        ? false
        : Boolean(baseUrl);
      items.push({
        id: provider.id,
        name: provider.name,
        models: (Array.isArray(models) ? models : []).map((model) => ({
          id: model.id,
          name: model.name || model.id,
          context_window: model.context && model.context.contextWindow ? model.context.contextWindow : null,
        })),
        base_url: baseUrl,
        api: api,
        open_ai_compatible: openAICompatible,
        credential_env: credentialEnv,
        base_url_env: config && Array.isArray(config.baseURLEnv) ? config.baseURLEnv : null,
        settings_ns: config ? config.settingsNs : null,
        native_auth: config && config.nativeAuth ? config.nativeAuth : null,
        settings_value: null,
      });
    }
    return {
      available: true,
      providers: items,
      current: currentSelection(),
      note: '模型清单来自 DeepSeek Harness 已配置的 llm 路由；凭据由宿主/环境变量持有，本页只保存路由与模型名。',
    };
  }

  function currentSelection() {
    const service = (key) => {
      try {
        return typeof ctx.get === 'function' ? ctx.get(key) : undefined;
      } catch {
        return undefined;
      }
    };
    const owner = service('agentDefaultModel');
    try {
      if (owner && typeof owner.currentSelection === 'function') {
        const selection = owner.currentSelection();
        if (selection && selection.provider && selection.model) {
          return { provider: String(selection.provider), model: String(selection.model) };
        }
      }
    } catch {
      /* 选择读取失败时退回首个可用提供方 */
    }
    return null;
  }

  /** 把控制器的 chat/completions 请求转成宿主的 llm.stream 调用（复用 Harness 凭据）。 */
  async function chatCompletion(body) {
    const llm = service('llm');
    if (!llm || typeof llm.stream !== 'function') throw new Error('宿主未提供 llm 服务');
    const request = body && typeof body === 'object' ? body : {};
    const requested = typeof request.model === 'string' ? request.model : '';
    let provider = null;
    let model = null;
    if (requested.includes('::')) {
      const [left, right] = requested.split('::');
      provider = left.trim();
      model = right.trim();
    } else {
      const selection = currentSelection();
      provider = selection ? selection.provider : null;
      model = requested && !requested.startsWith('harness') ? requested : (selection ? selection.model : null);
      if (!provider && model) {
        // 未记录提供方时在可选目录里找第一个拥有该模型的提供方
        const catalog = await harnessModels();
        for (const entry of Array.isArray(catalog.providers) ? catalog.providers : []) {
          if (Array.isArray(entry.models) && entry.models.some((item) => item.id === model)) {
            provider = entry.id;
            break;
          }
        }
      }
    }
    if (!provider || !model) throw new Error('无法确定 Harness 当前启用的模型');
    const incoming = Array.isArray(request.messages) ? request.messages : [];
    const systems = [];
    const messages = [];
    for (const message of incoming) {
      if (!message || typeof message !== 'object') continue;
      const text = typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
          ? message.content.map((part) => (part && part.text) || '').join('')
          : '';
      if (!text) continue;
      if (message.role === 'system') systems.push(text);
      else messages.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: [{ type: 'text', text }] });
    }
    if (!messages.length) throw new Error('请求没有可发送的消息');
    const options = { provider, model, messages };
    if (systems.length) options.system = systems.join('\n\n');
    // 控制器按 task_profile 请求的输出上限偏保守（知识域/审查 JSON 容易超限）；
    // 推理型模型会把预算先花在思考上，输出上限过低时最终内容为空，见下面的翻倍重试。
    const requestedLimit = Number.isFinite(request.max_tokens)
      ? request.max_tokens
      : (Number.isFinite(request.max_completion_tokens) ? request.max_completion_tokens : 0);
    let maxTokens = requestedLimit > 0 ? Math.min(65536, Math.max(requestedLimit, 16384)) : 0;
    if (maxTokens) options.maxTokens = maxTokens;
    if (Number.isFinite(request.temperature)) options.temperature = request.temperature;
    // 输出预算不足（推理烧光预算）时模型会返回空内容；此时把上限翻倍重试一次。
    const streamOnce = async (limit) => {
      let text = '';
      let finish = 'stop';
      let usage = null;
      const attemptOptions = limit ? { ...options, maxTokens: limit } : options;
      for await (const chunk of llm.stream(attemptOptions)) {
        if (!chunk || typeof chunk !== 'object') continue;
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
        else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage;
        else if (chunk.type === 'finish' && chunk.reason) {
          finish = chunk.reason.kind === 'max-tokens' ? 'length'
            : chunk.reason.kind === 'stop' ? 'stop'
              : chunk.reason.kind === 'tool-calls' ? 'tool_calls' : chunk.reason.kind;
          if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
            const failure = chunk.reason.failure && chunk.reason.failure.message
              ? chunk.reason.failure.message
              : chunk.reason.kind;
            throw new Error(`Harness 模型调用失败：${failure}`);
          }
        }
      }
      return { text, finish, usage };
    };
    let result = await streamOnce(maxTokens);
    // 空内容或触顶（finish=length）都说明输出预算不足：翻倍重试，直到 65536。
    while ((!result.text.trim() || result.finish === 'length') && maxTokens && maxTokens < 65536) {
      maxTokens = Math.min(65536, maxTokens * 2);
      result = await streamOnce(maxTokens);
    }
    const text = result.text;
    const finish = result.finish;
    const usage = result.usage;
    if (!text.trim()) throw new Error('Harness 模型返回了空内容');
    // 控制器要求纯 JSON 对象；模型偶尔会加代码围栏或前后解释，这里做一次清洗。
    const wantsJson = request.response_format
      && typeof request.response_format === 'object'
      && String(request.response_format.type || '').indexOf('json') >= 0;
    const content = wantsJson ? coerceJsonObject(text) : text;
    const payload = {
      id: `harness-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: `${provider}::${model}`,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finish }],
    };
    if (usage) {
      payload.usage = {
        prompt_tokens: usage.inputTokens,
        completion_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens ?? (usage.inputTokens || 0) + (usage.outputTokens || 0),
      };
    }
    return payload;
  }

  async function models() {
    const catalog = await harnessModels();
    const data = [];
    for (const entry of Array.isArray(catalog.providers) ? catalog.providers : []) {
      for (const model of Array.isArray(entry.models) ? entry.models : []) {
        data.push({ id: `${entry.id}::${model.id}`, object: 'model', owned_by: entry.id });
      }
    }
    return { object: 'list', data };
  }

  return { harnessModels, currentSelection, chatCompletion, models };
}

function createService(options, hostBridge, modelBridge) {
  const memo = createMemo();
  const jobs = new Map();

  async function runJson(args, timeoutMs, input = null) {
    const run = await runCli(options, args, timeoutMs, input);
    if (!run.ok) throw new Error(run.error || '控制器不可用');
    return run.data;
  }

  async function modelShow(projectId) {
    const args = [];
    if (projectId) args.push('--project', String(projectId));
    args.push('model', 'show', '--id', String(projectId || ''));
    return runJson(args, options.cliTimeoutMs);
  }

  async function modelSet(payload) {
    const body = payload && typeof payload === 'object' ? payload : {};
    const projectId = String(body.project || '');
    if (!projectId) throw new Error('缺少项目 id');
    if (!body.provider) throw new Error('缺少 provider');
    if (!body.model) throw new Error('缺少 model');
    const controllerProvider = String(body.provider) === 'codex' ? 'codex' : 'deepseek';
    const args = ['model', 'set', '--id', projectId, '--provider', controllerProvider,
      '--model', String(body.model)];
    if (body.base_url) args.push('--base-url', String(body.base_url));
    if (body.endpoint_id) args.push('--endpoint-id', String(body.endpoint_id));
    if (body.protocol) args.push('--protocol', String(body.protocol));
    if (body.credential_env) args.push('--credential-env', String(body.credential_env));
    const data = await runJson(args, options.cliTimeoutMs);
    memo.clear();
    return data;
  }

  async function modelSetCredential(payload) {
    const body = payload && typeof payload === 'object' ? payload : {};
    const projectId = String(body.project || '');
    if (!projectId) throw new Error('缺少项目 id');
    const args = ['model', 'credential', '--id', projectId];
    let input = null;
    if (body.clear === true) {
      args.push('--clear');
    } else {
      const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
      if (!apiKey) throw new Error('缺少 API Key');
      // 走 stdin：避免凭据出现在进程参数或日志里。
      args.push('--key-stdin');
      input = apiKey + '\n';
    }
    const data = await runJson(args, options.cliTimeoutMs, input);
    memo.clear();
    return data;
  }

  async function modelApply(payload) {
    const body = payload && typeof payload === 'object' ? payload : {};
    const projectId = String(body.project || '');
    if (!projectId) throw new Error('缺少项目 id');
    if (!body.provider) throw new Error('缺少 provider');
    if (!body.model) throw new Error('缺少 model');
    let baseUrl = body.base_url ? String(body.base_url) : '';
    let credentialEnv = body.credential_env ? String(body.credential_env) : '';
    if (!baseUrl || !credentialEnv) {
      // 缺省时按 Harness 已配置的同一提供方补全，用户无需手填地址。
      try {
        const catalog = await service_catalog(projectId);
        const entry = (catalog && Array.isArray(catalog.providers) ? catalog.providers : [])
          .filter((item) => item && item.id === body.provider)[0];
        if (entry) {
          if (!baseUrl && entry.base_url) baseUrl = String(entry.base_url);
          if (!credentialEnv && entry.credential_env) credentialEnv = String(entry.credential_env);
        }
      } catch {
        /* 目录不可用时仍按用户输入/已有配置继续 */
      }
    }
    const requestedProvider = String(body.provider || '');
    // 控制器只有 deepseek（OpenAI 兼容）与 codex 两种后端；Harness 的提供方 id
    // （gateway / our-free-model / deepseek-official …）必须先映射成控制器后端。
    const controllerProvider = requestedProvider === 'codex' ? 'codex' : 'deepseek';
    const args = ['model', 'apply', '--id', projectId,
      '--provider', controllerProvider, '--model', String(body.model)];
    if (baseUrl) args.push('--base-url', baseUrl);
    if (credentialEnv) args.push('--credential-env', credentialEnv);
    if (body.endpoint_id) args.push('--endpoint-id', String(body.endpoint_id));
    let input = null;
    if (typeof body.api_key === 'string' && body.api_key.trim()) {
      args.push('--key-stdin');
      input = body.api_key.trim() + '\n';
    }
    if (!baseUrl) {
      throw new Error('该提供方没有可直接使用的 OpenAI 兼容地址；请点「使用 Harness 当前模型」，或换一个带地址的提供方');
    }
    const data = await runJson(args, Math.max(options.cliTimeoutMs, 120000), input);
    memo.clear();
    return data;
  }

  async function service_catalog() {
    if (!hostBridge) return { available: false, providers: [] };
    return hostBridge.harnessModels();
  }

  async function modelTest(payload) {
    const body = payload && typeof payload === 'object' ? payload : {};
    const projectId = String(body.project || '');
    if (!projectId) throw new Error('缺少项目 id');
    return runJson(['model', 'test', '--id', projectId], Math.max(options.cliTimeoutMs, 60000));
  }

  /** 把控制器路由切到本插件的宿主模型桥：无需 API Key，直接使用 Harness 当前启用的模型。 */
  async function useHarness(projectId) {
    const id = String(projectId || '');
    if (!id) throw new Error('缺少项目 id');
    if (!modelBridge) throw new Error('宿主模型桥不可用');
    const bridge = modelBridge;
    let selection = hostBridge.currentSelection();
    if (!selection) {
      const catalog = await hostBridge.harnessModels();
      const usable = (Array.isArray(catalog.providers) ? catalog.providers : [])
        .filter((item) => item && Array.isArray(item.models) && item.models.length);
      if (usable.length) {
        selection = { provider: usable[0].id, model: usable[0].models[0].id };
      }
    }
    if (!selection) throw new Error('Harness 没有可用的模型选择');
    let baseUrl;
    let token;
    try {
      const started = await bridge.ensure();
      baseUrl = started.base_url;
      token = started.token;
    } catch (error) {
      throw new Error(`宿主模型桥启动失败：${error && error.message ? error.message : String(error)}`);
    }
    const args = ['model', 'apply', '--id', id,
      '--provider', 'deepseek',
      '--model', `${selection.provider}::${selection.model}`,
      '--base-url', baseUrl,
      '--credential-env', 'HARNESS_BRIDGE',
      '--key-stdin'];
    const controller = await runJson(args, Math.max(options.cliTimeoutMs, 180000), `${token}\n`);
    memo.clear();
    return { ok: true, selection, base_url: baseUrl, controller };
  }

  async function bridgeChat(body) {
    if (!hostBridge) throw new Error('宿主桥不可用');
    return hostBridge.chatCompletion(body);
  }

  async function bridgeModels() {
    if (!hostBridge) throw new Error('宿主桥不可用');
    return hostBridge.models();
  }

  /** 为一个 PR 启动真实审查（后台任务，stderr 进度行会被收集）。 */
  function startReview(projectId, number, mode) {
    const numeric = Number(number);
    if (!Number.isInteger(numeric) || numeric <= 0) throw new Error('非法的 PR 编号');
    const args = [];
    if (projectId) args.push('--project', String(projectId));
    args.push('review', 'run', '--pr', String(numeric));
    // auto：变更文件未被源码索引时跳过 head 语义分析；deep：强制完整语义知识。
    args.push('--mode', mode === 'deep' ? 'deep' : 'auto');
    const job = runCliJob(options, args, Math.max(options.reviewTimeoutMs, 60000), { RECSDK_PROGRESS: '1' });
    job.kind = 'review';
    job.number = numeric;
    job.project = projectId || null;
    jobs.set(job.job_id, job);
    if (jobs.size > 30) {
      const oldest = [...jobs.keys()].slice(0, jobs.size - 30);
      for (const key of oldest) jobs.delete(key);
    }
    return job;
  }

  // ---- PR 更新后自动重新审查 ------------------------------------------------
  // 只针对「已经审查过一次、head 又变了」的 PR；从未审查过的 PR 仍需人工点击，
  // 避免首次进入页面就把积压的 PR 全部排队。每个项目同时只跑一个审查。
  const autoReviews = new Map(); // `${projectId}:${number}` -> job
  const autoAttempts = new Map(); // `${projectId}:${number}` -> last start timestamp
  const AUTO_RETRY_MS = 10 * 60 * 1000;

  function needsReviewAfterUpdate(pr) {
    if (!pr || pr.active === false) return false;
    const review = pr.review && typeof pr.review === 'object' ? pr.review : null;
    if (!review) return false;
    const reviewed = typeof review.reviewed_head_sha === 'string' ? review.reviewed_head_sha : '';
    const head = typeof pr.head_sha === 'string' ? pr.head_sha : '';
    if (!reviewed) return false;
    if (review.job_status === 'running' || review.job_status === 'pending') return false;
    return (head !== '' && reviewed !== head) || review.current === false;
  }

  async function autoReviewTick() {
    if (!options.autoReviewUpdates) return { skipped: 'disabled', started: [] };
    for (const [key, job] of [...autoReviews.entries()]) {
      if (!job || job.status !== 'running') autoReviews.delete(key);
    }
    if (autoReviews.size >= 2) return { skipped: 'busy', started: [] };
    let list = [];
    try {
      const listed = await projects();
      list = Array.isArray(listed && listed.projects) ? listed.projects : [];
    } catch {
      list = [];
    }
    const started = [];
    for (const project of list) {
      const id = project && project.id ? String(project.id) : null;
      if (!id) continue;
      if ([...autoReviews.keys()].some((key) => key.indexOf(id + ':') === 0)) continue;
      if (autoReviews.size >= 2) break;
      let pulls = null;
      try {
        pulls = await listPulls({ offline: false, refresh: true, projectId: id });
      } catch {
        continue;
      }
      for (const pr of (pulls && Array.isArray(pulls.prs) ? pulls.prs : [])) {
        if (!needsReviewAfterUpdate(pr)) continue;
        const key = id + ':' + pr.number;
        if (autoReviews.has(key)) continue;
        const last = autoAttempts.get(key) || 0;
        if (Date.now() - last < AUTO_RETRY_MS) continue;
        const job = startReview(id, pr.number, 'auto');
        job.auto = true;
        autoReviews.set(key, job);
        autoAttempts.set(key, Date.now());
        started.push({ project: id, number: pr.number, job_id: job.job_id });
        break; // 每个项目同时只跑一个
      }
    }
    if (started.length) memo.clear();
    return { started };
  }

  /** 初始化控制器依赖（克隆 pinned 依赖并构建 Understand core），后台任务。 */
  function startSetup() {
    const script = path.join(options.root, 'scripts', 'setup.ps1');
    if (!existsSync(script)) {
      throw new Error('控制器目录缺少 scripts\\setup.ps1：请把 bundle 的 projectRoot 指向仓库根目录');
    }
    const executable = options.powershell
      || (process.platform === 'win32' ? 'powershell.exe' : 'pwsh');
    const job = {
      job_id: `job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      status: 'running', started_at: new Date().toISOString(), finished_at: null,
      progress: [], result: null, error: null, kind: 'setup',
    };
    let child;
    try {
      child = spawn(executable, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
        cwd: options.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
    } catch (error) {
      job.status = 'error';
      job.error = `无法启动初始化脚本：${error && error.message ? error.message : String(error)}`;
      job.finished_at = new Date().toISOString();
      return job;
    }
    const push = (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        const text = line.trim();
        if (!text) continue;
        job.progress.push(text);
        if (job.progress.length > 200) job.progress.splice(0, job.progress.length - 200);
      }
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', (error) => {
      job.status = 'error';
      job.error = `无法启动初始化脚本：${error && error.message ? error.message : String(error)}`;
      job.finished_at = new Date().toISOString();
    });
    child.on('close', (code) => {
      job.finished_at = new Date().toISOString();
      if (job.status === 'error') return;
      if (code === 0) {
        job.status = 'done';
        job.result = { ok: true };
        memo.clear();
      } else {
        job.status = 'error';
        const tail = job.progress.slice(-3).join(' | ');
        job.error = `初始化依赖失败（退出码 ${code}）${tail ? '：' + tail : '；请检查 pnpm/git 输出'}`;
      }
    });
    jobs.set(job.job_id, job);
    if (jobs.size > 30) {
      const oldest = [...jobs.keys()].slice(0, jobs.size - 30);
      for (const key of oldest) jobs.delete(key);
    }
    return job;
  }

  async function harnessModels(providerFilter) {
    if (!hostBridge) return { available: false, providers: [], reason: '宿主桥不可用' };
    const data = await hostBridge.harnessModels();
    if (!providerFilter || !Array.isArray(data.providers)) return data;
    return { ...data, providers: data.providers.filter((item) => item.id === providerFilter) };
  }

  async function projects({ refresh = false } = {}) {
    return memo('projects', refresh ? 0 : 10000, () => runJson(['project', 'list']));
  }

  async function branches(projectId, { refresh = false } = {}) {
    return memo(`branches:${projectId}`, refresh ? 0 : 15000, () => runJson(
      ['project', 'branches', '--id', String(projectId), ...(refresh ? ['--refresh'] : [])],
    ));
  }

  async function knowledge(projectId, ref, { refresh = false } = {}) {
    if (!ref) throw new Error('缺少分支名');
    return memo(`knowledge:${projectId}:${ref}`, refresh ? 0 : 15000, () => runJson(
      ['knowledge', 'status', '--id', String(projectId), '--ref', String(ref), ...(refresh ? ['--refresh'] : [])],
    ));
  }

  async function probe(url, local) {
    if (!url) throw new Error('缺少仓库地址');
    const args = ['project', 'probe', '--url', String(url)];
    if (local) args.push('--local', String(local));
    return runJson(args, Math.max(options.cliTimeoutMs, 120000));
  }

  async function importProject(body) {
    const payload = body && typeof body === 'object' ? body : {};
    if (!payload.url) throw new Error('缺少仓库地址');
    if (!payload.local || !String(payload.local).trim()) {
      throw new Error('请填写本地路径：仓库源码会下载（git clone）到该目录');
    }
    const args = ['project', 'import', '--url', String(payload.url)];
    if (payload.name) args.push('--name', String(payload.name));
    args.push('--local', String(payload.local).trim());
    const selected = Array.isArray(payload.branches)
      ? payload.branches.map((item) => String(item)).filter(Boolean)
      : [];
    if (selected.length) args.push('--branches', selected.join(','));
    const data = await runJson(args, Math.max(options.cliTimeoutMs, 1800000));
    memo.clear();
    return data;
  }

  async function removeProject(projectId, purge) {
    if (!projectId) throw new Error('缺少项目 id');
    const args = ['project', 'remove', '--id', String(projectId)];
    if (purge === true) args.push('--purge');
    const data = await runJson(args, Math.max(options.cliTimeoutMs, 120000));
    memo.clear();
    return data;
  }

  function startSync(projectId, ref, mode, fetch) {
    if (!projectId || !ref) throw new Error('缺少项目或分支');
    const flavor = mode === 'semantic' ? 'semantic' : 'structural';
    const job = runCliJob(options, [
      'knowledge', 'sync', '--id', String(projectId), '--ref', String(ref),
      ...(flavor === 'structural' ? ['--structural'] : []),
      ...(fetch === false ? [] : ['--fetch']),
    ], Math.max(options.syncTimeoutMs, 60000));
    jobs.set(job.job_id, job);
    // 只保留最近 30 个任务，避免无限增长。
    if (jobs.size > 30) {
      const oldest = [...jobs.keys()].slice(0, jobs.size - 30);
      for (const key of oldest) jobs.delete(key);
    }
    return job;
  }

  function job(jobId) {
    return jobs.get(jobId) || null;
  }

  async function listPulls({ offline = false, refresh = false, projectId = null } = {}) {
    const key = `list:${projectId || 'default'}:${offline ? 'offline' : 'live'}`;
    const ttl = refresh ? 0 : (offline ? 5000 : 20000);
    return memo(key, ttl, async () => {
      const args = [];
      if (projectId) args.push('--project', String(projectId));
      args.push('review', 'list');
      if (offline) args.push('--offline');
      const run = await runCli(options, args);
      if (!run.ok) return emptyListResult(run.error);
      return run.data;
    });
  }

  async function showPull(number, { offline = false, refresh = false, projectId = null } = {}) {
    const numeric = Number(number);
    if (!Number.isInteger(numeric) || numeric <= 0) return emptyDetailResult(number, '非法的 PR 编号');
    const key = `show:${projectId || 'default'}:${numeric}:${offline ? 'offline' : 'live'}`;
    const ttl = refresh ? 0 : (offline ? 5000 : 20000);
    return memo(key, ttl, async () => {
      const args = [];
      if (projectId) args.push('--project', String(projectId));
      args.push('review', 'show', '--pr', String(numeric));
      if (offline) args.push('--offline');
      const run = await runCli(options, args);
      if (!run.ok) return emptyDetailResult(numeric, run.error);
      return run.data;
    });
  }

  async function postComments(projectId, number, payload) {
    const numeric = Number(number);
    if (!Number.isInteger(numeric) || numeric <= 0) throw new Error('非法的 PR 编号');
    const body = payload && typeof payload === 'object' ? payload : {};
    const findings = Array.isArray(body.findings)
      ? body.findings.map((item) => String(item)).filter((item) => /^F?\d+$/i.test(item)).slice(0, 10)
      : [];
    if (!findings.length) throw new Error('请选择要评论的审查意见');
    const mode = ['issue', 'suggestion', 'question'].includes(body.mode) ? body.mode : 'issue';
    const lang = body.lang === 'en' ? 'en' : 'zh';
    const args = [];
    if (projectId) args.push('--project', String(projectId));
    args.push('review', 'comment', '--pr', String(numeric), '--mode', mode, '--lang', lang);
    for (const id of findings) args.push('--finding', id);
    // 默认 dry-run；只有页面明确 confirm 才真正提交到 PR。
    if (body.confirm === true) args.push('--confirm');
    if (body.force === true) args.push('--force');
    // 预览里手动编辑过的正文：确认时按编辑后的内容提交。
    const edits = {};
    if (body.confirm === true && body.edits && typeof body.edits === 'object') {
      for (const [key, value] of Object.entries(body.edits)) {
        if (/^F?\d+$/i.test(key) && typeof value === 'string' && value.trim()) edits[key] = value;
      }
    }
    if (Object.keys(edits).length) args.push('--edits-stdin');
    const data = await runJson(args, Math.max(options.cliTimeoutMs, 180000),
      Object.keys(edits).length ? JSON.stringify(edits) : null);
    if (body.confirm === true) memo.clear();
    return data;
  }

  async function health({ refresh = false } = {}) {
    const result = await memo('health', refresh ? 0 : 60000, async () => {
      const run = await runCli(options, ['doctor'], Math.min(options.cliTimeoutMs, 60000));
      if (!run.ok) return healthResult(null, run.error);
      return healthResult(run.data, null);
    });
    return result;
  }

  /** 把上次进程被中断（Harness/控制器重启）遗留的 running 任务标记为失败，页面可重试。 */
  async function recoverReviews(projectId) {
    const args = [];
    if (projectId) args.push('--project', String(projectId));
    args.push('review', 'recover', '--fail-running');
    const data = await runJson(args, Math.max(options.cliTimeoutMs, 60000));
    memo.clear();
    return data;
  }

  return {
    projects, branches, knowledge, probe, importProject, removeProject, startSync, startReview, job,
    modelShow, modelSet, modelSetCredential, modelApply, modelTest, harnessModels,
    useHarness, bridgeChat, bridgeModels,
    listPulls, showPull, health, recoverReviews, autoReviewTick, postComments, startSetup,
  };
}

function createRouteHandler(options, service) {
  return async function handleRoute(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname;
      const method = req.method || 'GET';
      if (method !== 'GET' && method !== 'HEAD' && method !== 'POST' && method !== 'DELETE') {
        json(res, 405, { error: '只支持 GET/POST/DELETE' });
        return;
      }
      const refresh = url.searchParams.get('refresh') === '1';
      const offline = url.searchParams.get('offline') === '1';
      const projectId = url.searchParams.get('project');

      // ---- 宿主模型桥（OpenAI 兼容，供控制器直连；复用 Harness 凭据） ----
      if (pathname === `${ROUTE_PREFIX}/llm/v1/models`) {
        try {
          json(res, 200, await service.bridgeModels());
        } catch (error) {
          json(res, 500, { error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/llm/v1/chat/completions`) {
        if (method !== 'POST') {
          json(res, 405, { error: '只支持 POST' });
          return;
        }
        try {
          const payload = await readJsonBody(req);
          json(res, 200, await service.bridgeChat(payload));
        } catch (error) {
          json(res, 500, { error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/model-config/use-harness` && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          json(res, 200, await service.useHarness(payload.project));
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }

      // ---- 模型配置 ---------------------------------------------------
      if (pathname === `${ROUTE_PREFIX}/harness-models`) {
        json(res, 200, await service.harnessModels());
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/model-config/apply` && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          json(res, 200, await service.modelApply(payload));
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/model-config/test` && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          json(res, 200, await service.modelTest(payload));
        } catch (error) {
          json(res, 200, { ok: false, skipped: true, reason: error && error.message ? error.message : String(error) });
        }
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/model-config/credential` && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          json(res, 200, await service.modelSetCredential(payload));
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/model-config` && method !== 'POST') {
        try {
          json(res, 200, await service.modelShow(projectId));
        } catch (error) {
          json(res, 200, { error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/model-config` && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          json(res, 200, await service.modelSet(payload));
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }

      // ---- 依赖初始化（源码安装后必须先运行 setup.ps1） ------------------
      if (pathname === `${ROUTE_PREFIX}/setup` && method === 'POST') {
        try {
          const job = service.startSetup();
          json(res, 202, { ok: true, job_id: job.job_id });
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }

      // ---- 项目与知识库 -------------------------------------------------
      if (pathname === `${ROUTE_PREFIX}/projects` && method !== 'POST') {
        json(res, 200, await service.projects({ refresh }));
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/projects/probe`) {
        try {
          json(res, 200, await service.probe(url.searchParams.get('url'), url.searchParams.get('local')));
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/projects/import` && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          json(res, 200, await service.importProject(payload));
        } catch (error) {
          json(res, 200, { ok: false, created: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      const removeMatch = /^\/recsdk-review\/api\/projects\/([^/]+)$/.exec(pathname);
      if (removeMatch && method === 'DELETE') {
        try {
          const projectId = decodeURIComponent(removeMatch[1]);
          const purge = url.searchParams.get('purge') === '1' || url.searchParams.get('purge') === 'true';
          json(res, 200, await service.removeProject(projectId, purge));
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      const branchesMatch = /^\/recsdk-review\/api\/projects\/([^/]+)\/branches$/.exec(pathname);
      if (branchesMatch) {
        try {
          json(res, 200, await service.branches(decodeURIComponent(branchesMatch[1]), { refresh }));
        } catch (error) {
          json(res, 200, { project_id: decodeURIComponent(branchesMatch[1]), branches: [],
            error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      const knowledgeMatch = /^\/recsdk-review\/api\/projects\/([^/]+)\/knowledge$/.exec(pathname);
      if (knowledgeMatch && method !== 'POST') {
        try {
          json(res, 200, await service.knowledge(decodeURIComponent(knowledgeMatch[1]),
            url.searchParams.get('ref'), { refresh }));
        } catch (error) {
          json(res, 200, { error: error && error.message ? error.message : String(error), freshness: 'missing' });
        }
        return;
      }
      const syncMatch = /^\/recsdk-review\/api\/projects\/([^/]+)\/knowledge\/sync$/.exec(pathname);
      if (syncMatch && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          const job = service.startSync(decodeURIComponent(syncMatch[1]), payload.ref, payload.mode,
            payload.fetch !== false);
          json(res, 202, { ok: true, job_id: job.job_id });
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      const jobMatch = /^\/recsdk-review\/api\/jobs\/([^/]+)$/.exec(pathname);
      if (jobMatch) {
        const job = service.job(decodeURIComponent(jobMatch[1]));
        if (!job) {
          json(res, 404, { error: '任务不存在或已过期' });
          return;
        }
        json(res, 200, job);
        return;
      }

      // ---- PR 列表与详情 -----------------------------------------------
      const reviewMatch = /^\/recsdk-review\/api\/pulls\/(\d+)\/review$/.exec(pathname);
      if (reviewMatch && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          const job = service.startReview(payload.project || projectId, Number(reviewMatch[1]), payload.mode);
          json(res, 202, { ok: true, job_id: job.job_id });
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      // ---- 审查意见评论 -------------------------------------------------
      const commentMatch = /^\/recsdk-review\/api\/pulls\/(\d+)\/comments$/.exec(pathname);
      if (commentMatch && method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          const result = await service.postComments(payload.project || projectId,
            Number(commentMatch[1]), payload);
          json(res, 200, { ok: true, ...result });
        } catch (error) {
          json(res, 200, { ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/pulls`) {
        const body = await service.listPulls({ offline, refresh, projectId });
        if (body && body.source === 'error') {
          json(res, 502, { ...body, error: body.source_error || '控制器不可用' });
          return;
        }
        json(res, 200, body);
        return;
      }
      const match = /^\/recsdk-review\/api\/pulls\/(\d+)$/.exec(pathname);
      if (match) {
        const body = await service.showPull(Number(match[1]), { offline, refresh, projectId });
        if (body && body.source === 'error') {
          json(res, 502, { ...body, error: body.source_error || '控制器不可用' });
          return;
        }
        json(res, 200, body);
        return;
      }
      if (pathname === `${ROUTE_PREFIX}/health`) {
        json(res, 200, await service.health({ refresh }));
        return;
      }
      json(res, 404, { error: `未知的插件路由：${pathname}` });
    } catch (error) {
      json(res, 500, { error: error && error.message ? error.message : String(error) });
    }
  };
}

function textBlock(text) {
  return [{ type: 'text', text }];
}

function toolDefinition(spec) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: { type: 'object' },
      render: (_args, value) => {
        try {
          return textBlock(JSON.stringify(value));
        } catch {
          return textBlock(String(value));
        }
      },
    },
    async execute(args) {
      return spec.execute(args && typeof args === 'object' ? args : {});
    },
  };
}

export function apply(ctx, config) {
  const options = resolveOptions(config);
  const hostBridge = createHostBridge(ctx);
  const modelBridge = createModelBridge(hostBridge, options);
  const service = createService(options, hostBridge, modelBridge);

  // 工具注册（Agent 与页面共用同一服务方法：一个操作，两个调用方）。
  ctx.effect(() => {
    const definitions = [
      toolDefinition({
        name: 'recsdk_pr_list',
        description: 'List the current GitCode pull requests of a loaded project with their AI review status. Read-only; never posts comments or changes anything.',
        parameters: {
          type: 'object',
          properties: {
            offline: { type: 'boolean', description: 'Read the cached controller state instead of the GitCode API.' },
            project: { type: 'string', description: 'Loaded project id; omitted uses the default (preloaded) project.' },
          },
          additionalProperties: false,
        },
        async execute(args) {
          const data = await service.listPulls({ offline: args.offline === true, refresh: true,
            projectId: args.project ? String(args.project) : null });
          if (data && data.source === 'error') throw new Error(data.source_error || '控制器不可用');
          return data;
        },
      }),
      toolDefinition({
        name: 'recsdk_pr_review',
        description: 'Show one pull request of a loaded project and its AI review findings (severity, trigger, system impact, evidence path:line, verification), plus currentness and coverage gaps. Read-only.',
        parameters: {
          type: 'object',
          properties: {
            number: { type: 'integer', minimum: 1, description: 'Pull request number, e.g. 432.' },
            offline: { type: 'boolean', description: 'Read the cached controller state instead of the GitCode API.' },
            project: { type: 'string', description: 'Loaded project id; omitted uses the default project.' },
          },
          required: ['number'],
          additionalProperties: false,
        },
        async execute(args) {
          const number = Number(args.number);
          if (!Number.isInteger(number) || number <= 0) throw new Error('number 必须是正整数');
          const data = await service.showPull(number, { offline: args.offline === true, refresh: true,
            projectId: args.project ? String(args.project) : null });
          if (data && data.source === 'error') throw new Error(data.source_error || '控制器不可用');
          return data;
        },
      }),
      toolDefinition({
        name: 'recsdk_projects',
        description: 'List the projects loaded in the RecSDK project assistant, each one\'s branches and its knowledge-base snapshot pointers. Read-only.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        async execute() {
          return service.projects({ refresh: true });
        },
      }),
      toolDefinition({
        name: 'recsdk_knowledge_status',
        description: 'Compare one branch\'s remote tip with the project knowledge snapshot: missing / stale / current, commit distance, and whether semantic analysis can run. Read-only.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project id; omitted uses the default project.' },
            ref: { type: 'string', description: 'Branch name, e.g. develop.' },
            refresh: { type: 'boolean', description: 'Query the remote tip instead of the local mirror.' },
          },
          required: ['ref'],
          additionalProperties: false,
        },
        async execute(args) {
          let projectId = args.project ? String(args.project) : null;
          if (!projectId) {
            const listed = await service.projects({ refresh: false });
            projectId = listed && listed.default_project;
          }
          if (!projectId) throw new Error('没有已加载的项目');
          return service.knowledge(projectId, String(args.ref), { refresh: args.refresh === true });
        },
      }),
      toolDefinition({
        name: 'recsdk_harness_models',
        description: 'List the model providers and models already configured in DeepSeek Harness (with base-URL hints and credential env names), so a controller model route can reference them. Read-only; never returns secret values.',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Only return this provider id, e.g. gateway.' },
          },
          additionalProperties: false,
        },
        async execute(args) {
          return service.harnessModels(args.provider ? String(args.provider) : null);
        },
      }),
      toolDefinition({
        name: 'recsdk_use_harness_model',
        description: 'Point a project\'s controller model route at the Harness host-model bridge so semantic work uses the model currently enabled in DeepSeek Harness, with no API key or manual endpoint. Returns the selection and controller readiness.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project id; omitted uses the default project.' },
          },
          additionalProperties: false,
        },
        async execute(args) {
          let projectId = args.project ? String(args.project) : null;
          if (!projectId) {
            const listed = await service.projects({ refresh: false });
            projectId = listed && listed.default_project;
          }
          if (!projectId) throw new Error('没有已加载的项目');
          const data = await service.useHarness(projectId);
          if (data && data.ok === false) throw new Error(data.error || '切换失败');
          return data;
        },
      }),
      toolDefinition({
        name: 'recsdk_review_health',
        description: 'Report whether the RecSDK project assistant controller is ready (git, node, pinned knowledge tools, GitCode read access, model route). Read-only.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        async execute() {
          return service.health({ refresh: true });
        },
      }),
    ];
    const disposers = definitions.map((definition) => ctx.tools.register(definition));
    return () => {
      for (const dispose of disposers.reverse()) {
        try { dispose(); } catch { /* ignore */ }
      }
    };
  }, 'recsdk-review: tools');

  // 宿主模型桥的本地监听随插件卸载回收；启动时立即监听，
  // 这样已保存的控制器路由（base_url）在 Harness 重启后依然可用。
  ctx.effect(() => {
    modelBridge.ensure().catch((error) => {
      try {
        ctx.logger?.('warn', `recsdk-review: 宿主模型桥启动失败：${error && error.message ? error.message : error}`);
      } catch {
        /* ignore */
      }
    });
    return () => modelBridge.dispose();
  }, 'recsdk-review: model bridge');

  // 启动时清理上次进程被中断（Harness/控制器重启）后残留的「进行中」任务：
  // 只在没有别的控制器进程持有队列锁时生效，否则跳过，避免打断真实审查。
  ctx.effect(() => {
    (async () => {
      let ids = [];
      try {
        const listed = await runJson(['project', 'list'], Math.max(options.cliTimeoutMs, 60000));
        ids = (Array.isArray(listed && listed.projects) ? listed.projects : [])
          .map((item) => item && item.id).filter(Boolean);
      } catch {
        /* project list 不可用时退回默认配置 */
      }
      for (const id of (ids.length ? ids : [null]).slice(0, 8)) {
        await service.recoverReviews(id).catch(() => {});
      }
    })().catch(() => {});
    return () => {};
  }, 'recsdk-review: recover interrupted reviews');

  // PR 有新提交时自动重新审查（只针对已审查过的 PR，串行执行，避免长时间占满）。
  ctx.effect(() => {
    const tick = () => {
      service.autoReviewTick().catch(() => {});
    };
    const timer = setInterval(tick, options.autoReviewPollMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
    const warmup = setTimeout(tick, 5000);
    if (warmup && typeof warmup.unref === 'function') warmup.unref();
    return () => {
      clearInterval(timer);
      clearTimeout(warmup);
    };
  }, 'recsdk-review: auto review updates');

  // 同源 HTTP 路由：只在 Web 组合里注册。
  // 用 ctx.inject 而不是 apply 时的 ctx.get：插件先于 webServer 发布加载，
  // 一次性读取会拿到 undefined，导致路由永远不注册。
  ctx.inject(['webServer'], (scoped) => {
    const server = scoped.webServer;
    if (!server || typeof server.register !== 'function') return;
    scoped.effect(() => server.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: createRouteHandler(options, service),
    }), 'recsdk-review: routes');
  });
}
