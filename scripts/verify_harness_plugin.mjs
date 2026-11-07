/**
 * 无安装依赖的 Host 半身冒烟测试。
 *
 * 用假的 ctx（工具注册表 + webServer.inject）加载 harness-plugin/index.js，
 * 并用一个临时的假控制器工程（project_assistant/cli.py 打印固定 JSON）代替
 * 真实 Python 控制器，验证：
 *   - 3 个 Agent 工具注册成功且可执行；
 *   - 同源路由 /recsdk-review/api/pulls、/pulls/<n>、/health 返回 200 JSON；
 *   - 未知路由 404；
 *   - 控制器失败时返回可渲染的空结果（source=error）而不是 500。
 *
 * 运行：node scripts/verify_harness_plugin.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const pluginDir = path.resolve(here, '..', 'harness-plugin');
const failures = [];
let checks = 0;

function check(name, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

function makeFakeProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'recsdk-plugin-smoke-'));
  const pkg = path.join(root, 'project_assistant');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(path.join(pkg, '__init__.py'), '');
  writeFileSync(path.join(pkg, 'cli.py'), `
import json, sys
args = sys.argv[1:]
if 'doctor' in args:
    print(json.dumps({
        "ready": False,
        "checks": {"git": True, "node": True, "model_endpoint": False},
        "errors": {"model_endpoint": "model_backend.base_url is not configured"},
        "model": {"configured": True, "provider": "deepseek", "endpoint_id": "pending-deployment",
                  "model": None, "supports_writable": False,
                  "credential": {"present": False, "required": True}},
    }, ensure_ascii=False))
elif 'list' in args:
    print(json.dumps({
        "generated_at": "2026-11-07T00:00:00+00:00",
        "repo": {"url": "https://gitcode.com/Ascend/RecSDK_for_lingqu", "id": "Ascend/RecSDK_for_lingqu",
                 "state_dir": "state"},
        "branches": ["develop", "refactor/develop"],
        "source": "cache" if "--offline" in args else "live",
        "source_error": None,
        "counts": {"total": 1, "open": 1, "reviewed": 1, "stale": 0, "pending": 0, "failed": 0},
        "prs": [{"number": 432, "title": "HATA fusion", "state": "open", "draft": False,
                 "target": "develop", "source_branch": "HATA_fusion",
                 "head_sha": "05d21c26c00e9b97c7979b518f5aaccc359e9fdf",
                 "base_sha": "dd7784fec9e027a4f1ebcfefd81a2de206b22dcb",
                 "author": {"login": "dragonshang", "name": "dragonshang",
                            "html_url": "https://gitcode.com/dragonshang"},
                 "labels": [{"name": "ascend-cla/yes", "color": "#29e047"}],
                 "pipeline_status": None, "mergeable": True, "comments": 10,
                 "added_lines": 12, "removed_lines": 3,
                 "html_url": "https://gitcode.com/Ascend/RecSDK_for_lingqu/merge_requests/432",
                 "created_at": "2026-11-06T17:07:51+08:00",
                 "updated_at": "2026-11-07T11:27:33+08:00", "active": True,
                 "review": {"status": "none", "report_dir": None, "current": False, "checked_at": None,
                            "invalidated_at": None, "reviewed_at": None, "reviewed_head_sha": None,
                            "mode": None, "fingerprint": None, "findings": 0,
                            "severity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
                            "coverage_gaps": 0, "job_status": None, "job_attempts": None,
                            "job_error": None, "job_updated": None}}],
    }, ensure_ascii=False))
elif 'show' in args:
    number = args[args.index('--pr') + 1] if '--pr' in args else '0'
    print(json.dumps({
        "generated_at": "2026-11-07T00:00:00+00:00",
        "source": "cache" if "--offline" in args else "live",
        "source_error": None,
        "pr": {"number": int(number), "title": "HATA fusion", "state": "open", "draft": False,
               "target": "develop", "source_branch": "HATA_fusion", "head_sha": "h", "base_sha": "b",
               "author": {"login": "dragonshang", "name": "dragonshang", "html_url": None},
               "labels": [], "pipeline_status": None, "mergeable": True, "comments": 10,
               "added_lines": 1, "removed_lines": 1, "html_url": None,
               "created_at": None, "updated_at": None, "active": True, "body": "PR body"},
        "files": {"changed": ["fasterrec/core/logging.py"], "source": "review"},
        "review": {"status": "current", "report_dir": "r", "current": True,
                   "checked_at": "2026-11-07T00:00:00+00:00", "invalidated_at": None,
                   "reviewed_at": "2026-11-06T00:00:00+00:00", "reviewed_head_sha": "h",
                   "mode": "live-pr", "fingerprint": "fp", "findings": 1,
                   "severity": {"critical": 0, "high": 1, "medium": 0, "low": 0},
                   "coverage_gaps": ["未在本机执行 PR 代码。"], "job_status": "done",
                   "job_attempts": 1, "job_error": None, "job_updated": None,
                   "metadata": {"changed_files": ["fasterrec/core/logging.py"]},
                   "intent": "统一日志", "summary": "发现一处回归",
                   "findings": [{"title": "日志级别默认值改变", "severity": "high",
                                 "trigger": "未设置 HATA_LOG_LEVEL", "system_function": "日志",
                                 "consequence": "INFO 日志消失", "confidence": "high",
                                 "evidence": [{"path": "fasterrec/core/logging.py", "line": 12,
                                               "reason": "默认值从 1 变为 2"}],
                                 "verification": "设置 HATA_LOG_LEVEL=1 后观察输出"}],
                   "risks_to_verify": [], "affected_flows": [], "verification_plan": [],
                   "stale_message": None},
        "job": {"status": "done", "attempts": 1, "error": None, "updated": None},
    }, ensure_ascii=False))
else:
    print(json.dumps({"error": "unsupported stub command"}), file=sys.stderr)
    sys.exit(1)
`);
  return root;
}

function makeFakeCtx() {
  const tools = new Map();
  const routes = [];
  const disposers = [];
  const fake = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
        return () => tools.delete(definition.name);
      },
    },
    effect(fn) {
      const disposer = fn();
      if (typeof disposer === 'function') disposers.push(disposer);
      return () => {};
    },
    on() { return () => {}; },
    get() { return undefined; },
    inject(deps, callback) {
      if (deps.includes('webServer')) {
        callback({
          ...fake,
          webServer: {
            register(route) {
              routes.push(route);
              return () => {};
            },
          },
        });
      }
    },
  };
  return { ctx: fake, tools, routes };
}

function makeFakeRes() {
  return {
    status: 0,
    headers: null,
    body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(buffer) {
      try { this.body = JSON.parse(Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer)); }
      catch { this.body = null; }
    },
  };
}

async function callRoute(routes, urlPath, method = 'GET') {
  const route = routes.find((candidate) => urlPath.startsWith(candidate.path));
  if (!route) throw new Error(`no route for ${urlPath}`);
  const res = makeFakeRes();
  await route.handler({ method, url: urlPath }, res);
  return res;
}

async function main() {
  const root = makeFakeProject();
  const python = process.env.RECSDK_PYTHON
    || 'D:\\GRVLLM\\ReviewWork\\project-assistant\\.venv\\Scripts\\python.exe';
  try {
    const module = await import(pathToFileURL(path.join(pluginDir, 'index.js')).href);
    check('index.js 导出 apply', typeof module.apply === 'function');
    check('index.js 声明 tools 注入', Array.isArray(module.inject) && module.inject.includes('tools'));

    const { ctx, tools, routes } = makeFakeCtx();
    module.apply(ctx, { projectRoot: root, python, cliTimeoutMs: 30000 });

    check('注册 3 个 Agent 工具', tools.size === 3, [...tools.keys()].join(','));
    check('注册前缀路由', routes.length === 1 && routes[0].kind === 'prefix', JSON.stringify(routes.map((r) => r.kind)));

    const list = await callRoute(routes, '/recsdk-review/api/pulls');
    check('GET /pulls 200', list.status === 200, String(list.status));
    check('GET /pulls 返回 live 列表', list.body && list.body.source === 'live' && Array.isArray(list.body.prs) && list.body.prs.length === 1);

    const detail = await callRoute(routes, '/recsdk-review/api/pulls/432');
    check('GET /pulls/432 200', detail.status === 200, String(detail.status));
    check('GET /pulls/432 含审查意见', detail.body && Array.isArray(detail.body.review.findings) && detail.body.review.findings.length === 1);
    check('GET /pulls/432 含证据行号', detail.body && detail.body.review.findings[0].evidence[0].line === 12);

    const offline = await callRoute(routes, '/recsdk-review/api/pulls?offline=1');
    check('GET /pulls?offline=1 透传 --offline', offline.body && offline.body.source === 'cache');

    const health = await callRoute(routes, '/recsdk-review/api/health');
    check('GET /health 200 且 ok=false', health.status === 200 && health.body && health.body.ok === false);
    check('GET /health 带模型诊断', health.body && health.body.model && health.body.model.provider === 'deepseek');

    const missing = await callRoute(routes, '/recsdk-review/api/nope');
    check('未知路由 404', missing.status === 404, String(missing.status));

    const listTool = tools.get('recsdk_pr_list');
    const toolList = await listTool.execute({});
    check('工具 recsdk_pr_list 可执行', toolList && toolList.source === 'live' && toolList.prs.length === 1);

    const reviewTool = tools.get('recsdk_pr_review');
    const toolReview = await reviewTool.execute({ number: 432 });
    check('工具 recsdk_pr_review 可执行', toolReview && toolReview.review.findings.length === 1);

    const healthTool = tools.get('recsdk_review_health');
    const toolHealth = await healthTool.execute({});
    check('工具 recsdk_review_health 可执行', toolHealth && toolHealth.ok === false);

    let rejected = false;
    try { await reviewTool.execute({ number: 0 }); } catch { rejected = true; }
    check('工具拒绝非法 PR 编号', rejected);

    const badRoot = mkdtempSync(path.join(tmpdir(), 'recsdk-plugin-bad-'));
    try {
      const bad = makeFakeCtx();
      module.apply(bad.ctx, { projectRoot: badRoot, python: path.join(badRoot, 'missing-python.exe'), cliTimeoutMs: 5000 });
      const badList = await callRoute(bad.routes, '/recsdk-review/api/pulls');
      check('控制器失败时返回可渲染的错误（502）', badList.status === 502 && badList.body && badList.body.source === 'error' && Array.isArray(badList.body.prs) && typeof badList.body.error === 'string');
    } finally {
      rmSync(badRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`\n${checks - failures.length}/${checks} checks passed`);
  if (failures.length) {
    console.log('failures: ' + failures.join(' | '));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
