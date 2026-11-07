/**
 * 无安装依赖的 Host 半身冒烟测试。
 *
 * 用假的 ctx（工具注册表 + webServer.inject）加载 harness-plugin/index.js，
 * 并用一个临时的假控制器工程（project_assistant/cli.py 打印固定 JSON）代替
 * 真实 Python 控制器，验证：
 *   - Agent 工具注册与执行；
 *   - 项目/分支/知识库/任务/PR 路由；
 *   - 控制器失败时的降级（502 可渲染 JSON）。
 *
 * 运行：node scripts/verify_harness_plugin.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const pluginDir = path.resolve(here, '..', 'harness-plugin');
const failures = [];
let checks = 0;

function check(name, condition, detail) {
  checks += 1;
  if (condition) console.log(`PASS  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

const STUB = `
import json, sys, time
args = sys.argv[1:]
# 去掉全局 --config/--project，让下面的子命令判断能命中
for global_flag in ('--config', '--project'):
    while global_flag in args:
        index = args.index(global_flag)
        del args[index:index + 2]

def emit(value):
    print(json.dumps(value, ensure_ascii=False))

def has(*names):
    return all(name in args for name in names)

if 'doctor' in args:
    emit({"ready": False,
          "checks": {"git": True, "node": True, "model_endpoint": False},
          "errors": {"model_endpoint": "model_backend.base_url is not configured"},
          "model": {"configured": True, "provider": "deepseek", "endpoint_id": "pending-deployment",
                    "model": None, "supports_writable": False,
                    "credential": {"present": False, "required": True}}})
elif args[:1] == ['project'] and 'list' in args:
    emit({"generated_at": "2026-11-07T00:00:00+00:00", "default_project": "recsdk",
          "projects": [{"id": "recsdk", "name": "RecSDK_for_lingqu",
                        "repo_url": "https://gitcode.com/Ascend/RecSDK_for_lingqu",
                        "config_path": "config/recsdk.json", "state_dir": "state",
                        "repo_state": "state/repositories/abc", "branches": ["develop"],
                        "has_mirror": True,
                        "snapshots": {"develop": {"semantic": None,
                                                  "structural": {"snapshot_id": "s1", "commit": "abc1234def",
                                                                 "created_at": "2026-11-06T00:00:00+00:00",
                                                                 "mode": "structural", "refreshed_domains": ["a", "b"],
                                                                 "status": "complete", "stats": {}}}}}]})
elif args[:1] == ['project'] and 'probe' in args:
    emit({"ok": True, "repo_url": "https://gitcode.com/o/r", "canonical": "gitcode.com/o/r",
          "name_suggestion": "r", "default_branch": "main",
          "branches": [{"name": "main", "default": True}, {"name": "dev", "default": False}],
          "source": "remote"})
elif args[:1] == ['project'] and 'import' in args:
    emit({"ok": True, "created": True,
          "project": {"id": "r-1234abcd", "name": "r", "repo_url": "https://gitcode.com/o/r",
                      "branches": ["main"], "snapshots": {}, "has_mirror": False}})
elif args[:1] == ['project'] and 'branches' in args:
    emit({"project_id": "recsdk", "generated_at": "2026-11-07T00:00:00+00:00", "source": "local",
          "default_branch": "develop",
          "branches": [{"name": "develop", "tip": "abc1234def", "configured": True, "default": True},
                       {"name": "master", "tip": "def5678abc", "configured": False, "default": False}],
          "error": None})
elif args[:1] == ['knowledge'] and 'status' in args:
    emit({"project_id": "recsdk", "ref": "develop", "checked_at": "2026-11-07T00:00:00+00:00",
          "config": {"config_path": "config/recsdk.json", "branches": ["develop"],
                     "domains": ["a", "b"]},
          "remote": {"tip": "abc1234def", "source": "local", "error": None},
          "snapshot": {"semantic": None,
                       "structural": {"snapshot_id": "s1", "commit": "abc1234def",
                                      "created_at": "2026-11-06T00:00:00+00:00",
                                      "mode": "structural", "refreshed_domains": ["a"],
                                      "status": "complete", "stats": {}}},
          "freshness": "current", "behind": 0, "ahead": 0,
          "semantic_ready": False, "semantic_reason": "model_backend.base_url is not configured"})
elif args[:1] == ['knowledge'] and 'sync' in args:
    print("starting structural sync", file=sys.stderr, flush=True)
    print("scanning files", file=sys.stderr, flush=True)
    emit({"project_id": "recsdk", "ref": "develop", "mode": "structural", "snapshot_id": "s2",
          "commit": "abc1234def", "status": "complete", "stats": {}, "refreshed_domains": ["a"],
          "manifest_path": "state/snapshots/s2/manifest.json", "duration_seconds": 0.1,
          "published": True})
elif 'list' in args:
    emit({"generated_at": "2026-11-07T00:00:00+00:00",
          "repo": {"url": "https://gitcode.com/Ascend/RecSDK_for_lingqu",
                   "id": "Ascend/RecSDK_for_lingqu", "state_dir": "state"},
          "branches": ["develop"], "source": "cache" if "--offline" in args else "live",
          "source_error": None,
          "counts": {"total": 1, "open": 1, "reviewed": 0, "stale": 0, "pending": 0, "failed": 0},
          "prs": [{"number": 432, "title": "HATA fusion", "state": "open", "draft": False,
                   "target": "develop", "source_branch": "HATA_fusion", "head_sha": "h", "base_sha": "b",
                   "author": {"login": "dragonshang", "name": "dragonshang", "html_url": None},
                   "labels": [], "pipeline_status": None, "mergeable": True, "comments": 10,
                   "added_lines": 12, "removed_lines": 3, "html_url": None,
                   "created_at": None, "updated_at": "2026-11-07T11:27:33+08:00", "active": True,
                   "review": {"status": "none", "report_dir": None, "current": False,
                              "checked_at": None, "invalidated_at": None, "reviewed_at": None,
                              "reviewed_head_sha": None, "mode": None, "fingerprint": None,
                              "findings": 0, "severity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
                              "coverage_gaps": 0, "job_status": None, "job_attempts": None,
                              "job_error": None, "job_updated": None}}]})
elif 'show' in args:
    number = args[args.index('--pr') + 1] if '--pr' in args else '0'
    emit({"generated_at": "2026-11-07T00:00:00+00:00",
          "source": "cache" if "--offline" in args else "live", "source_error": None,
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
                     "mode": "live-pr", "fingerprint": "fp",
                     "findings": [{"title": "日志级别默认值改变", "severity": "high",
                                   "trigger": "未设置 HATA_LOG_LEVEL", "system_function": "日志",
                                   "consequence": "INFO 日志消失", "confidence": "high",
                                   "evidence": [{"path": "fasterrec/core/logging.py", "line": 12,
                                                 "reason": "默认值从 1 变为 2"}],
                                   "verification": "设置 HATA_LOG_LEVEL=1 后观察输出"}],
                     "severity": {"critical": 0, "high": 1, "medium": 0, "low": 0},
                     "coverage_gaps": ["未在本机执行 PR 代码。"], "job_status": "done",
                     "job_attempts": 1, "job_error": None, "job_updated": None,
                     "metadata": {"changed_files": ["fasterrec/core/logging.py"]},
                     "intent": "统一日志", "summary": "发现一处回归",
                     "risks_to_verify": [], "affected_flows": [], "verification_plan": [],
                     "stale_message": None},
          "job": {"status": "done", "attempts": 1, "error": None, "updated": None}})
else:
    print(json.dumps({"error": "unsupported stub command"}), file=sys.stderr)
    sys.exit(1)
`;

function makeFakeProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'recsdk-plugin-smoke-'));
  const pkg = path.join(root, 'project_assistant');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(path.join(pkg, '__init__.py'), '');
  writeFileSync(path.join(pkg, 'cli.py'), STUB);
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

function makeFakeReq(urlPath, method, body) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const listeners = {};
  return {
    method,
    url: urlPath,
    on(event, handler) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
      return this;
    },
    destroy() {},
    _emit() {
      (listeners.data || []).forEach((handler) => handler(payload));
      (listeners.end || []).forEach((handler) => handler());
      (listeners.error || []).forEach(() => {});
    },
  };
}

async function callRoute(routes, urlPath, method = 'GET', body) {
  const route = routes.find((candidate) => urlPath.startsWith(candidate.path));
  if (!route) throw new Error(`no route for ${urlPath}`);
  const res = makeFakeRes();
  const req = makeFakeReq(urlPath, method, body);
  const pending = route.handler(req, res);
  if (method === 'POST') req._emit();
  await pending;
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
    module.apply(ctx, { projectRoot: root, python, cliTimeoutMs: 30000, syncTimeoutMs: 60000 });

    check('注册 5 个 Agent 工具', tools.size === 5, [...tools.keys()].join(','));
    check('注册前缀路由', routes.length === 1 && routes[0].kind === 'prefix');

    const projects = await callRoute(routes, '/recsdk-review/api/projects');
    check('GET /projects 200', projects.status === 200, String(projects.status));
    check('GET /projects 返回预置项目', Boolean(projects.body && projects.body.default_project === 'recsdk'));
    check('GET /projects 含快照指针', Boolean(projects.body
      && projects.body.projects[0].snapshots.develop.structural.snapshot_id === 's1'));

    const probe = await callRoute(routes, '/recsdk-review/api/projects/probe?url=' + encodeURIComponent('https://gitcode.com/o/r'));
    check('GET /projects/probe 返回分支', Boolean(probe.body && probe.body.ok === true
      && probe.body.default_branch === 'main'));

    const imported = await callRoute(routes, '/recsdk-review/api/projects/import', 'POST',
      { url: 'https://gitcode.com/o/r', name: 'r', branches: ['main'] });
    check('POST /projects/import 创建项目', Boolean(imported.body && imported.body.ok && imported.body.created));

    const branches = await callRoute(routes, '/recsdk-review/api/projects/recsdk/branches');
    check('GET /projects/:id/branches 200', Boolean(branches.body
      && Array.isArray(branches.body.branches) && branches.body.branches.length === 2));

    const knowledge = await callRoute(routes, '/recsdk-review/api/projects/recsdk/knowledge?ref=develop');
    check('GET /projects/:id/knowledge 200', Boolean(knowledge.body
      && knowledge.body.freshness === 'current' && knowledge.body.semantic_ready === false));

    const sync = await callRoute(routes, '/recsdk-review/api/projects/recsdk/knowledge/sync', 'POST',
      { ref: 'develop', mode: 'structural', fetch: true });
    check('POST knowledge/sync 202 + job_id', sync.status === 202 && Boolean(sync.body && sync.body.job_id),
      String(sync.status));
    const jobId = sync.body.job_id;
    let job = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const polled = await callRoute(routes, '/recsdk-review/api/jobs/' + jobId);
      job = polled.body;
      if (job && job.status !== 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    check('GET /jobs/:id 完成', Boolean(job && job.status === 'done'), job && job.status);
    check('任务收集到进度行', Boolean(job && Array.isArray(job.progress) && job.progress.length >= 2),
      job && JSON.stringify(job.progress));
    check('任务结果含快照', Boolean(job && job.result && job.result.snapshot_id === 's2'));

    const missingJob = await callRoute(routes, '/recsdk-review/api/jobs/nope');
    check('未知任务 404', missingJob.status === 404, String(missingJob.status));

    const list = await callRoute(routes, '/recsdk-review/api/pulls?project=recsdk');
    check('GET /pulls?project 200', list.status === 200 && list.body && list.body.prs.length === 1);

    const detail = await callRoute(routes, '/recsdk-review/api/pulls/432?project=recsdk');
    check('GET /pulls/432?project 200', detail.status === 200
      && detail.body && Array.isArray(detail.body.review.findings) && detail.body.review.findings.length === 1);
    check('详情含证据行号', detail.body.review.findings[0].evidence[0].line === 12);

    const health = await callRoute(routes, '/recsdk-review/api/health');
    check('GET /health 200 且 ok=false', health.status === 200 && health.body && health.body.ok === false);

    const projectsTool = tools.get('recsdk_projects');
    const toolProjects = await projectsTool.execute({});
    check('工具 recsdk_projects 可执行', Boolean(toolProjects && toolProjects.default_project === 'recsdk'));

    const knowledgeTool = tools.get('recsdk_knowledge_status');
    const toolKnowledge = await knowledgeTool.execute({ ref: 'develop' });
    check('工具 recsdk_knowledge_status 可执行', Boolean(toolKnowledge && toolKnowledge.ref === 'develop'));

    const listTool = tools.get('recsdk_pr_list');
    const toolList = await listTool.execute({ project: 'recsdk' });
    check('工具 recsdk_pr_list 可执行', Boolean(toolList && toolList.prs.length === 1));

    const reviewTool = tools.get('recsdk_pr_review');
    const toolReview = await reviewTool.execute({ number: 432 });
    check('工具 recsdk_pr_review 可执行', Boolean(toolReview && toolReview.review.findings.length === 1));

    let rejected = false;
    try { await reviewTool.execute({ number: 0 }); } catch { rejected = true; }
    check('工具拒绝非法 PR 编号', rejected);

    const badRoot = mkdtempSync(path.join(tmpdir(), 'recsdk-plugin-bad-'));
    try {
      const bad = makeFakeCtx();
      module.apply(bad.ctx, { projectRoot: badRoot, python: path.join(badRoot, 'missing-python.exe'), cliTimeoutMs: 5000 });
      const badList = await callRoute(bad.routes, '/recsdk-review/api/pulls');
      check('控制器失败时返回可渲染的错误（502）', badList.status === 502 && badList.body
        && badList.body.source === 'error' && Array.isArray(badList.body.prs) && typeof badList.body.error === 'string');
      const badProjects = await callRoute(bad.routes, '/recsdk-review/api/projects');
      check('控制器失败时项目接口返回 500 JSON', badProjects.status === 500 && Boolean(badProjects.body && badProjects.body.error));
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
