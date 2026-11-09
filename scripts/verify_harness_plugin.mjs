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
                        "repo_state": "state/repositories/abc",
                        "mirror_path": "state/repositories/abc/mirror.git",
                        "snapshots_path": "state/repositories/abc/snapshots",
                        "worktrees_path": "worktrees/abc",
                        "reports_path": "state/repositories/abc/reports",
                        "refs_path": "state/repositories/abc/refs.json",
                        "local_repo": "D:/clone",
                        "branches": ["develop"],
                        "has_mirror": True,
                        "snapshots": {"develop": {"semantic": None,
                                                  "structural": {"snapshot_id": "s1", "commit": "abc1234def",
                                                                 "created_at": "2026-11-06T00:00:00+00:00",
                                                                 "mode": "structural", "refreshed_domains": ["a", "b"],
                                                                 "dir": "state/repositories/abc/snapshots/s1",
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
          "paths": {"config": "config/recsdk.json", "state_dir": "state",
                    "repo_state": "state/repositories/abc",
                    "mirror": "state/repositories/abc/mirror.git",
                    "snapshots": "state/repositories/abc/snapshots",
                    "snapshot": "state/repositories/abc/snapshots/s1",
                    "worktrees": "worktrees/abc",
                    "reports": "state/repositories/abc/reports"},
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
elif args[:1] == ['model'] and 'apply' in args:
    provider = args[args.index('--provider') + 1] if '--provider' in args else ''
    if provider not in ('deepseek', 'codex'):
        print(json.dumps({"error": "argument --provider: invalid choice: '%s'" % provider}), file=sys.stderr)
        sys.exit(2)
    model = args[args.index('--model') + 1]
    base = args[args.index('--base-url') + 1] if '--base-url' in args else ''
    line = sys.stdin.readline().strip() if '--key-stdin' in args else ''
    emit({"project_id": "recsdk", "cleared": False,
          "credential": {"present": bool(line), "required": True, "source": "credential-file",
                         "env": "GATEWAY_API_KEY"},
          "credential_file": "state/credentials.json", "ready": True,
          "checks": {"model_provider": True, "model_endpoint": True, "model_name": True,
                     "model_credential": bool(line)},
          "errors": {}, "model_backend": {"provider": "deepseek", "base_url": base, "model": model},
          "test": {"ok": True, "skipped": False, "status": 200, "model_count": 3, "duration_ms": 42},
          "secrets_policy": "no secrets"})
elif args[:1] == ['model'] and 'test' in args:
    emit({"ok": True, "skipped": False, "status": 200, "model_count": 3, "duration_ms": 40, "models": ["a", "b"]})
elif args[:1] == ['model'] and 'credential' in args:
    if '--clear' in args:
        emit({"project_id": "recsdk", "cleared": True,
              "credential": {"present": False, "required": True, "source": "missing",
                             "env": "DEEPSEEK_API_KEY"},
              "ready": False, "checks": {"model_credential": False},
              "errors": {"model_credential": "credential is missing"}, "secrets_policy": "no secrets"})
    else:
        line = sys.stdin.readline().strip() if '--key-stdin' in args else ''
        emit({"project_id": "recsdk", "cleared": False,
              "credential": {"present": bool(line), "required": True, "source": "credential-file",
                             "env": "DEEPSEEK_API_KEY"},
              "ready": True,
              "checks": {"model_provider": True, "model_endpoint": True, "model_name": True,
                         "model_credential": bool(line)},
              "errors": {}, "secrets_policy": "no secrets",
              "echo_guard": line[:0]})
elif args[:1] == ['model'] and 'show' in args:
    emit({"project_id": "recsdk", "config_path": "config/recsdk.json",
          "model_backend": {"provider": "deepseek", "protocol": "chat_completions",
                            "endpoint_id": "pending-deployment", "base_url": "", "model": "",
                            "credential_env": "DEEPSEEK_API_KEY"},
          "destination": {"provider": "deepseek", "model": None,
                          "credential": {"present": False, "required": True, "env": "DEEPSEEK_API_KEY"}},
          "ready": False,
          "checks": {"model_provider": True, "model_endpoint": False, "model_name": False,
                     "model_credential": False},
          "errors": {"model_endpoint": "model_backend.base_url is not configured"},
          "secrets_policy": "no secrets"})
elif args[:1] == ['model'] and 'set' in args:
    model = args[args.index('--model') + 1]
    base = args[args.index('--base-url') + 1] if '--base-url' in args else ''
    emit({"project_id": "recsdk", "config_path": "config/recsdk.json",
          "model_backend": {"provider": "deepseek", "protocol": "chat_completions",
                            "endpoint_id": "api.deepseek.com", "base_url": base, "model": model,
                            "credential_env": "DEEPSEEK_API_KEY"},
          "destination": {"provider": "deepseek", "model": model,
                          "credential": {"present": False, "required": True, "env": "DEEPSEEK_API_KEY"}},
          "ready": False,
          "checks": {"model_provider": True, "model_endpoint": True, "model_name": True,
                     "model_credential": False},
          "errors": {"model_credential": "credential is missing"},
          "secrets_policy": "no secrets"})
elif args[:1] == ['review'] and 'run' in args:
    number = args[args.index('--pr') + 1] if '--pr' in args else '0'
    print("pr #%s：获取 PR 提交" % number, file=sys.stderr, flush=True)
    time.sleep(0.05)
    print("pr #%s：调用模型执行系统级审查" % number, file=sys.stderr, flush=True)
    emit({"job": "fp123", "report": "state/reports/%s/fp123" % number, "current": True})
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
    module.apply(ctx, { projectRoot: root, python, cliTimeoutMs: 30000, syncTimeoutMs: 60000, bridgePort: 55999 });

    check('注册 7 个 Agent 工具', tools.size === 7, [...tools.keys()].join(','));
    check('注册前缀路由', routes.length === 1 && routes[0].kind === 'prefix');

    const projects = await callRoute(routes, '/recsdk-review/api/projects');
    check('GET /projects 200', projects.status === 200, String(projects.status));
    check('GET /projects 返回预置项目', Boolean(projects.body && projects.body.default_project === 'recsdk'));
    check('GET /projects 含快照指针', Boolean(projects.body
      && projects.body.projects[0].snapshots.develop.structural.snapshot_id === 's1'));
    check('GET /projects 暴露本地路径', Boolean(projects.body
      && projects.body.projects[0].mirror_path && projects.body.projects[0].snapshots_path
      && projects.body.projects[0].worktrees_path));
    check('快照摘要包含快照目录', Boolean(projects.body
      && projects.body.projects[0].snapshots.develop.structural.dir));

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
    check('知识库状态包含本地路径', Boolean(knowledge.body && knowledge.body.paths
      && knowledge.body.paths.snapshot && knowledge.body.paths.mirror && knowledge.body.paths.python === undefined));

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

    const harnessModels = await callRoute(routes, '/recsdk-review/api/harness-models');
    check('GET /harness-models 200', harnessModels.status === 200 && Boolean(harnessModels.body));
    check('无 llm 服务时明确降级', harnessModels.body.available === false && typeof harnessModels.body.reason === 'string');

    const modelConfig = await callRoute(routes, '/recsdk-review/api/model-config?project=recsdk');
    check('GET /model-config 200', Boolean(modelConfig.body && modelConfig.body.model_backend));
    check('模型配置返回就绪检查', Boolean(modelConfig.body && modelConfig.body.checks && modelConfig.body.ready === false));

    const modelSaved = await callRoute(routes, '/recsdk-review/api/model-config', 'POST',
      { project: 'recsdk', provider: 'deepseek', model: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1' });
    check('POST /model-config 保存路由', Boolean(modelSaved.body && modelSaved.body.model_backend
      && modelSaved.body.model_backend.model === 'deepseek-chat'));
    check('保存结果不含凭据值', Boolean(modelSaved.body && !JSON.stringify(modelSaved.body).includes('sk-')));

    const secret = 'sk-test-SECRET-must-not-echo';
    const keySaved = await callRoute(routes, '/recsdk-review/api/model-config/credential', 'POST',
      { project: 'recsdk', api_key: secret });
    check('POST /model-config/credential 保存 API Key', Boolean(keySaved.body
      && keySaved.body.credential && keySaved.body.credential.present === true));
    check('凭据经 stdin 传入且响应不回显', !JSON.stringify(keySaved.body).includes(secret));
    check('保存后可报就绪', Boolean(keySaved.body && keySaved.body.ready === true));

    const keyCleared = await callRoute(routes, '/recsdk-review/api/model-config/credential', 'POST',
      { project: 'recsdk', clear: true });
    check('POST /model-config/credential 可清除', Boolean(keyCleared.body
      && keyCleared.body.credential && keyCleared.body.credential.present === false));

    const applied = await callRoute(routes, '/recsdk-review/api/model-config/apply', 'POST',
      { project: 'recsdk', provider: 'deepseek', model: 'deepseek-v4.1-flash',
        base_url: 'https://gw.example/v1', credential_env: 'GATEWAY_API_KEY', api_key: secret });
    check('POST /model-config/apply 一步保存路由+密钥', Boolean(applied.body
      && applied.body.ready === true && applied.body.credential.present === true));
    check('apply 返回连通性测试结果', Boolean(applied.body && applied.body.test && applied.body.test.ok === true));
    check('apply 响应不回显密钥', !JSON.stringify(applied.body).includes(secret));

    // Harness 提供方 id（gateway）必须映射成控制器后端 deepseek，不能原样传给 CLI
    const appliedHarnessProvider = await callRoute(routes, '/recsdk-review/api/model-config/apply', 'POST',
      { project: 'recsdk', provider: 'gateway', model: 'deepseek-v4.1-flash',
        base_url: 'https://gw.example/v1', credential_env: 'GATEWAY_API_KEY', api_key: secret });
    check('apply 接受 Harness 提供方 id（自动映射为 deepseek）', Boolean(appliedHarnessProvider.body
      && appliedHarnessProvider.body.ready === true),
      JSON.stringify(appliedHarnessProvider.body && appliedHarnessProvider.body.error));

    const tested = await callRoute(routes, '/recsdk-review/api/model-config/test', 'POST',
      { project: 'recsdk' });
    check('POST /model-config/test 返回连通性', Boolean(tested.body && tested.body.ok === true
      && tested.body.model_count === 3));

    // 宿主模型桥：假 ctx 没有 llm 服务，必须明确报错而不是崩溃
    const bridgeModels = await callRoute(routes, '/recsdk-review/api/llm/v1/models');
    check('桥接 /models 在无 llm 时安全降级', (bridgeModels.status === 200
      && Array.isArray(bridgeModels.body && bridgeModels.body.data) && bridgeModels.body.data.length === 0)
      || (bridgeModels.status === 500 && typeof (bridgeModels.body && bridgeModels.body.error) === 'string'),
      `${bridgeModels.status}`);
    const bridgeChat = await callRoute(routes, '/recsdk-review/api/llm/v1/chat/completions', 'POST',
      { model: 'harness', messages: [{ role: 'user', content: 'hi' }] });
    check('桥接 chat/completions 无 llm 时返回 500 错误', bridgeChat.status === 500
      && typeof (bridgeChat.body && bridgeChat.body.error) === 'string');
    const useHarness = await callRoute(routes, '/recsdk-review/api/model-config/use-harness', 'POST',
      { project: 'recsdk' });
    check('use-harness 无宿主模型时返回可读错误', Boolean(useHarness.body && useHarness.body.ok === false
      && typeof useHarness.body.error === 'string'
      && !/is not defined/.test(useHarness.body.error)),
      useHarness.body && useHarness.body.error);

    const list = await callRoute(routes, '/recsdk-review/api/pulls?project=recsdk');
    check('GET /pulls?project 200', list.status === 200 && list.body && list.body.prs.length === 1);

    const detail = await callRoute(routes, '/recsdk-review/api/pulls/432?project=recsdk');
    check('GET /pulls/432?project 200', detail.status === 200
      && detail.body && Array.isArray(detail.body.review.findings) && detail.body.review.findings.length === 1);
    check('详情含证据行号', detail.body.review.findings[0].evidence[0].line === 12);

    // 点击未审查 PR 触发审查：启动后台任务并收集进度
    const startedReview = await callRoute(routes, '/recsdk-review/api/pulls/432/review', 'POST',
      { project: 'recsdk' });
    check('POST /pulls/432/review 返回 job_id', startedReview.status === 202 && Boolean(startedReview.body && startedReview.body.job_id));
    let reviewJob = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const polled = await callRoute(routes, '/recsdk-review/api/jobs/' + startedReview.body.job_id);
      reviewJob = polled.body;
      if (reviewJob && reviewJob.status !== 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    check('审查任务完成并返回报告', Boolean(reviewJob && reviewJob.status === 'done'
      && reviewJob.result && reviewJob.result.current === true));
    check('审查任务收集到进度行', Boolean(reviewJob && Array.isArray(reviewJob.progress)
      && reviewJob.progress.some((line) => line.indexOf('审查') >= 0)), reviewJob && JSON.stringify(reviewJob.progress));

    const badReview = await callRoute(routes, '/recsdk-review/api/pulls/0/review', 'POST', { project: 'recsdk' });
    check('拒绝非法编号的审查请求', Boolean(badReview.body && badReview.body.ok === false
      && typeof badReview.body.error === 'string'));

    const health = await callRoute(routes, '/recsdk-review/api/health');
    check('GET /health 200 且 ok=false', health.status === 200 && health.body && health.body.ok === false);

    const projectsTool = tools.get('recsdk_projects');
    const toolProjects = await projectsTool.execute({});
    check('工具 recsdk_projects 可执行', Boolean(toolProjects && toolProjects.default_project === 'recsdk'));

    const harnessTool = tools.get('recsdk_harness_models');
    const toolHarness = await harnessTool.execute({});
    check('工具 recsdk_harness_models 可执行', Boolean(toolHarness && toolHarness.available === false));

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
  // 插件在加载时会启动宿主模型桥的监听，显式退出避免事件循环挂住。
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
