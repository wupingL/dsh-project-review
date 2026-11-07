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
  return {
    root,
    python,
    configFile,
    cliTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 120000,
  };
}

/** 执行控制器 CLI；返回 {ok, data} 或 {ok:false, error}。永不抛出。 */
function runCli(options, args, timeoutMs = options.cliTimeoutMs) {
  return new Promise((resolve) => {
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
      resolve({ ok: false, error: `无法启动控制器解释器：${error && error.message ? error.message : String(error)}` });
      return;
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
function createMemo() {
  const values = new Map();
  const inflight = new Map();
  return async function memo(key, ttlMs, loader) {
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
  };
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

function createService(options) {
  const memo = createMemo();

  async function listPulls({ offline = false, refresh = false } = {}) {
    const key = offline ? 'list:offline' : 'list:live';
    const ttl = refresh ? 0 : (offline ? 5000 : 20000);
    const result = await memo(key, ttl, async () => {
      const args = ['review', 'list'];
      if (offline) args.push('--offline');
      const run = await runCli(options, args);
      if (!run.ok) return emptyListResult(run.error);
      return run.data;
    });
    return result;
  }

  async function showPull(number, { offline = false, refresh = false } = {}) {
    const numeric = Number(number);
    if (!Number.isInteger(numeric) || numeric <= 0) return emptyDetailResult(number, '非法的 PR 编号');
    const key = `show:${numeric}:${offline ? 'offline' : 'live'}`;
    const ttl = refresh ? 0 : (offline ? 5000 : 20000);
    const result = await memo(key, ttl, async () => {
      const args = ['review', 'show', '--pr', String(numeric)];
      if (offline) args.push('--offline');
      const run = await runCli(options, args);
      if (!run.ok) return emptyDetailResult(numeric, run.error);
      return run.data;
    });
    return result;
  }

  async function health({ refresh = false } = {}) {
    const result = await memo('health', refresh ? 0 : 60000, async () => {
      const run = await runCli(options, ['doctor'], Math.min(options.cliTimeoutMs, 60000));
      if (!run.ok) return healthResult(null, run.error);
      return healthResult(run.data, null);
    });
    return result;
  }

  return { listPulls, showPull, health };
}

function createRouteHandler(options, service) {
  return async function handleRoute(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(res, 405, { error: '只支持 GET' });
        return;
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname;
      const refresh = url.searchParams.get('refresh') === '1';
      const offline = url.searchParams.get('offline') === '1';
      if (pathname === `${ROUTE_PREFIX}/pulls`) {
        const body = await service.listPulls({ offline, refresh });
        if (body && body.source === 'error') {
          json(res, 502, { ...body, error: body.source_error || '控制器不可用' });
          return;
        }
        json(res, 200, body);
        return;
      }
      const match = /^\/recsdk-review\/api\/pulls\/(\d+)$/.exec(pathname);
      if (match) {
        const body = await service.showPull(Number(match[1]), { offline, refresh });
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
  const service = createService(options);

  // 工具注册（Agent 与页面共用同一服务方法：一个操作，两个调用方）。
  ctx.effect(() => {
    const definitions = [
      toolDefinition({
        name: 'recsdk_pr_list',
        description: 'List the current GitCode pull requests of the RecSDK repository with their AI review status. Read-only; never posts comments or changes anything.',
        parameters: {
          type: 'object',
          properties: {
            offline: { type: 'boolean', description: 'Read the cached controller state instead of the GitCode API.' },
          },
          additionalProperties: false,
        },
        async execute(args) {
          const data = await service.listPulls({ offline: args.offline === true, refresh: true });
          if (data && data.source === 'error') throw new Error(data.source_error || '控制器不可用');
          return data;
        },
      }),
      toolDefinition({
        name: 'recsdk_pr_review',
        description: 'Show one RecSDK pull request and its AI review findings (severity, trigger, system impact, evidence path:line, verification), plus currentness and coverage gaps. Read-only.',
        parameters: {
          type: 'object',
          properties: {
            number: { type: 'integer', minimum: 1, description: 'Pull request number, e.g. 432.' },
            offline: { type: 'boolean', description: 'Read the cached controller state instead of the GitCode API.' },
          },
          required: ['number'],
          additionalProperties: false,
        },
        async execute(args) {
          const number = Number(args.number);
          if (!Number.isInteger(number) || number <= 0) throw new Error('number 必须是正整数');
          const data = await service.showPull(number, { offline: args.offline === true, refresh: true });
          if (data && data.source === 'error') throw new Error(data.source_error || '控制器不可用');
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
