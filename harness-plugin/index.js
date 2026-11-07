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
import { existsSync } from 'node:fs';
import path from 'node:path';

export const name = 'recsdk-review';
export const inject = ['tools'];

const ROUTE_PREFIX = '/recsdk-review/api';
const DEFAULT_PROJECT_ROOT = 'D:\\GRVLLM\\ReviewWork\\project-assistant';
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
  return {
    root,
    python,
    configFile,
    cliTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 120000,
    syncTimeoutMs: Number.isFinite(syncTimeout) && syncTimeout > 0 ? syncTimeout : 1800000,
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
function runCliJob(options, args, timeoutMs) {
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
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
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

function createHostBridge(ctx) {
  function service(key) {
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
      note: '模型清单来自 DeepSeek Harness 已配置的 llm 路由；凭据由宿主/环境变量持有，本页只保存路由与模型名。',
    };
  }

  return { harnessModels };
}

function createService(options, hostBridge) {
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
    const args = ['model', 'set', '--id', projectId, '--provider', String(body.provider),
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
    const args = ['model', 'apply', '--id', projectId,
      '--provider', String(body.provider), '--model', String(body.model)];
    if (baseUrl) args.push('--base-url', baseUrl);
    if (credentialEnv) args.push('--credential-env', credentialEnv);
    if (body.endpoint_id) args.push('--endpoint-id', String(body.endpoint_id));
    let input = null;
    if (typeof body.api_key === 'string' && body.api_key.trim()) {
      args.push('--key-stdin');
      input = body.api_key.trim() + '\n';
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
    const args = ['project', 'import', '--url', String(payload.url)];
    if (payload.name) args.push('--name', String(payload.name));
    if (payload.local) args.push('--local', String(payload.local));
    const selected = Array.isArray(payload.branches)
      ? payload.branches.map((item) => String(item)).filter(Boolean)
      : [];
    if (selected.length) args.push('--branches', selected.join(','));
    const data = await runJson(args, Math.max(options.cliTimeoutMs, 180000));
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

  async function health({ refresh = false } = {}) {
    const result = await memo('health', refresh ? 0 : 60000, async () => {
      const run = await runCli(options, ['doctor'], Math.min(options.cliTimeoutMs, 60000));
      if (!run.ok) return healthResult(null, run.error);
      return healthResult(run.data, null);
    });
    return result;
  }

  return {
    projects, branches, knowledge, probe, importProject, startSync, job,
    modelShow, modelSet, modelSetCredential, modelApply, modelTest, harnessModels,
    listPulls, showPull, health,
  };
}

function createRouteHandler(options, service) {
  return async function handleRoute(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname;
      const method = req.method || 'GET';
      if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
        json(res, 405, { error: '只支持 GET/POST' });
        return;
      }
      const refresh = url.searchParams.get('refresh') === '1';
      const offline = url.searchParams.get('offline') === '1';
      const projectId = url.searchParams.get('project');

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
  const service = createService(options, hostBridge);

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
