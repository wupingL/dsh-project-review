# Project Assistant

Three reusable project workflow skills share one Python controller and the pinned MIT Understand core. The controller owns isolated Git workspaces, immutable snapshots, a SQLite PR queue and local Chinese reports. It never changes the supplied working clone.

这是**DeepSeek Harness（DSH）代码检视插件**及其依赖的 Python 控制器：在 DSH Web UI 中提供「代码检视」整页视图（PR 列表、AI 审查报告、与上一版对比、多选意见提交评论），并以 Agent 工具（`recsdk_pr_list`、`recsdk_pr_review`、`recsdk_projects`、`recsdk_knowledge_status`、`recsdk_harness_models`、`recsdk_use_harness_model`、`recsdk_review_health`）暴露只读能力。控制器负责 GitCode 读取、知识快照、审查队列与报告；插件只做展示与转发。插件细节见 [harness-plugin/README.md](harness-plugin/README.md)。

## 在 DeepSeek Harness 中安装使用

### 1. 环境要求

| 依赖 | 要求 |
| --- | --- |
| Windows | 10/11（脚本按 Windows 路径编写） |
| Git | 2.40+ |
| Node.js | 22+（理解图谱构建与插件运行） |
| pnpm | 9+（安装 pinned 的 Understand 依赖） |
| Python | 3.11+（控制器只用标准库；`setup.ps1` 会创建 `.venv`） |
| DeepSeek Harness | 0.2.2+（Web GUI；模型桥要求 Harness 处于运行状态） |
| 网络 | 首次初始化会克隆两个 pinned 依赖并构建；审查需访问 GitCode/GitHub |

支持的代码托管平台：**GitCode/AtomGit** 与 **GitHub**。仓库地址填 HTTPS 地址即可，控制器按域名自动选择 API 适配器：

- GitCode/AtomGit：读 PR/评论用 `GITCODE_TOKEN`（`pull_requests` 权限；公开仓库可匿名读）。
- GitHub：优先读 `GITHUB_TOKEN` / `GH_TOKEN` 环境变量（Windows 用户环境变量也认）；都没有时**自动回退本机 git 凭据助手**（`git credential fill`），所以用 git/gh 登录过就能直接读。私有仓库必须能拿到 token。
- GitHub 已知限制：不读取 Actions/Check 状态（覆盖缺口里会标注）；评论的 `resolved` 状态 REST 不提供，去重按「未解决」处理；行内评论用 `line + side=RIGHT`，不在 diff 中时退化为 PR 级评论。

### 2. 获取并初始化控制器

```powershell
git clone https://github.com/wupingL/dsh-project-review.git
cd dsh-project-review
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup.ps1
```

`setup.ps1` 会按 `dependencies.lock.json` 克隆并检出 pinned 的 Understand 与专家技能仓库到 `vendor/`，安装并构建 `@understand-anything/core`，并创建 `.venv`。首次执行需要网络与 pnpm。

### 3. 安装为 DSH 插件

插件以「本地目录 link」方式安装（改代码后刷新页面即生效）。`projectRoot` 默认取 `harness-plugin/` 的上一级，**无需改路径**：

```
plugin_manager install_bundle target = "<克隆目录绝对路径>\\harness-plugin"
```

也可以在 DSH 插件管理界面手动选择 `harness-plugin` 目录安装。安装后 DSH Web UI 出现「代码检视」入口。

> 仓库移动位置后需要重新安装（link 指向旧路径）；控制器放在其他目录时，编辑 `harness-plugin/cordis.patch.yml` 的 `projectRoot` / `python`。

### 4. 首次配置

1. **模型**：打开「代码检视」→「模型配置」→ 点「使用 Harness 当前模型（免配置）」。插件会在本机 loopback 起模型桥并把控制器路由指向它，无需 API Key。
2. **项目**：项目页点「导入项目」，填 GitCode/GitLab HTTPS 仓库地址和**本地路径（必填）**——路径不存在时会自动 `git clone` 把源码下载到该目录；已有同仓库 clone 则直接复用。选分支后导入（项目卡片上的「移除」可从列表删除项目，默认不删本地源码）。
3. **凭据**：设置 `GITCODE_TOKEN` 环境变量（读取 PR/评论需要读权限；提交评论需要 `pull_requests` 写权限，可在 <https://gitcode.com/setting/token-classic> 生成）。不要写进配置文件。
4. **知识库**：切换分支后首次会自动构建知识快照（大仓库耗时较长，建议构建完成后再审查）。

> 仓库自带的 `config/recsdk.json`、`config/projects.json` 是示例（Ascend RecSDK 仓库）。导入自己的项目后会在 `config/` 生成新配置，可在项目页切换；不再使用示例仓库时，删除示例配置并调整 `config/projects.json` 的 `default` 即可。

### 5. 日常使用

- 「代码检视」页自动拉取最新 PR。未审查 PR 点「开始审查」（自动判断快速/深度）；需要完整语义时点「深度审查」。
- PR 推送新提交后**自动重审**（默认每 2 分钟检查一次），并与上一版逐条对比：已修复 / 仍存在 / 新增。
- 审查意见可多选 → 选口径（问题 / 建议 / 疑问）→ 预览 → 确认，提交为 PR 对应代码处的评论；不在 diff 新增行的会退化为 PR 级评论并标注目标位置。
- 审查会读取 PR 已有评论：不重复报告已提出的问题，并给出「已处理 / 仍未处理 / 无法确认」；同行重复的意见默认不提交。

### 6. 更新

```powershell
git pull
```

本地 link 安装刷新 Harness 页面即可（`client.js` 立即生效；Host 半身改动建议在插件管理里禁用再启用）。控制器代码更新无需重装。更新后可用 `scripts\verify_all.ps1` 自检。

### 7. 安全说明

- 评论**默认 dry-run**，只有页面「确认提交」或 CLI `--confirm` 才真正写入 PR。
- 自动化测试与开发调试只走假传输层，不对真实仓库写评论。
- `GITCODE_TOKEN` 与模型凭据只从环境/凭据文件读取，不写入配置、日志、报告；评论接口 URL 不回显 token。
- `data/`（镜像、快照、报告、SQLite、凭据文件）、`vendor/`、`.venv/`、`.harness-bridge-token` 均已 gitignore，不会提交到仓库。

## 常见问题

**`Cannot find module ... vendor\understand-anything\...\dist\index.js`（node ERR_MODULE_NOT_FOUND）**

源码安装后还没有初始化依赖。运行 `scripts\setup.ps1`（需要 git、Node 22+、pnpm 与网络），或在「代码检视」页面点「初始化依赖」按钮。
插件的知识库/审查会先做预检并给出这条提示，而不是抛 node 堆栈。

**页面显示「数据源降级：GitCode HTTP 404」**

说明项目是 GitHub 仓库但控制器拿不到 token（私有仓库），或仓库地址/权限有误。设置 `GITHUB_TOKEN`/`GH_TOKEN`，
或确认本机 git 凭据助手已登录 GitHub（控制器会自动回退 `git credential fill`）。

**页面显示「数据源降级：GitHub 网络不可达（…handshake operation timed out）」**

控制器访问 `api.github.com` 超时。常见原因是机器通过本地代理/VPN 访问 GitHub：git 配了 `https.proxy`（如
`127.0.0.1:10808`）但代理客户端没运行、或上游不可达。处理顺序：

1. 确认代理/VPN 客户端在运行，且 `git ls-remote <仓库>` 能通；
2. 控制器会自动读取 git 的 `http(s).proxy` 配置作为 Python 的代理；也可显式设置 `HTTPS_PROXY` 环境变量；
3. 有镜像时可在项目配置里加 `github_api_url` 指向兼容 GitHub 的 API 地址；
4. 网络失败时页面会回退到「最近一次成功拉取的 PR 列表」（`review-list-cache.json`）或本地数据库缓存，不会白屏；
   控制器对 TLS/超时已做 3 次短退避重试。

**审查一直「进行中」**

Harness 重启会杀掉正在跑的 CLI 子进程；插件启动时会把遗留任务标记为失败并给出「重试审查」，也可以点「重试审查」或
`python -m project_assistant.cli review recover --fail-running`。

## 仓库维护：发布 / 同步更新

本仓库同时是插件源码仓库（<https://github.com/wupingL/dsh-project-review>）。发布新版本：

```powershell
# 1) 自检（编译、Host 冒烟、控制器只读命令、模型连通性、已安装 bundle）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify_all.ps1

# 2) 提交并推送
git add -A
git commit -m "描述本次改动"
git push origin main
```

或运行 `scripts\publish.ps1 -Message "描述本次改动"`（自动提交并推送）。

Model routing is explicit. `model_backend.provider` must be `codex` or `deepseek`; an absent or unknown provider is a configuration error and never silently falls back to OpenAI. Provider, endpoint identity, model and task parameters are stored in project configuration; credentials are read only from the process/user environment or a configured credential file and are never written into snapshots, reports or logs.

## Setup on Windows

```powershell
.\scripts\setup.ps1 -InstallSkills
.\scripts\pa.ps1 doctor --network
```

Python 3.11+, Node 22+, pnpm and Git are required. An authenticated Codex CLI is required only when `model_backend.provider` is `codex`. The DeepSeek adapter uses an HTTPS OpenAI-compatible chat-completions endpoint and a JSON-mode response. Setup installs dependencies only from the pinned, trusted tool checkout. The Python controller uses the standard library. It runs from its project directory, so no global Python package installation is required.

Configuration: `config/recsdk.json`. For another repository copy the JSON and set the URL, local clone, branch names, state directory, domain rules and test/evidence entrypoints. Pass `--config <file>` before a command. The external state directory must be retained to reuse knowledge after recloning. Source clones can be moved by changing `local_repo`; repository identity is derived from the HTTPS origin, not the directory name.

The `model_backend` block currently selects the DeepSeek provider and deliberately leaves `endpoint_id`, `base_url`, `model` and credentials pending deployment confirmation. In this state `doctor` is not ready and live knowledge/review calls stop before sending source. `max_retries` and `timeout` control transport retries; `task_profiles` separate low-cost knowledge generation from higher-investment review/design. These parameters are recorded as the semantic identity of a snapshot, while credential locations and retry settings are not.

Set `GITCODE_TOKEN` through a process environment or credential launcher if anonymous API access is unavailable. Never put tokens into config, URLs or source. Codex uses the user's existing model settings/authentication. A failed auth/home-directory diagnostic stops automated review; starting it from the normal user shell may be required in restricted nested environments.

On Windows, the client also reads the persistent user `GITCODE_TOKEN` environment value when it is absent from the current process. This supports a token configured after Codex was started without logging its value. The RecSDK profile retains the legacy `knowledge_reasoning_effort=medium` and `review_reasoning_effort=xhigh` values for the Codex backend; DeepSeek uses the corresponding `task_profiles` entries. A Codex backend still uses an OpenAI HTTPS alias with the same saved OpenAI authentication and default endpoint selection; this avoids repeated WebSocket timeout fallback and does not change the model or send data to a third-party provider.

## Knowledge

```powershell
.\scripts\pa.ps1 context sync --ref develop --fetch
.\scripts\pa.ps1 context sync --ref refactor/develop --fetch
.\scripts\pa.ps1 context query --ref develop --query '动态embedding checkpoint'
```

`--structural-only` provides an explicitly marked index without LLM calls; it is useful for smoke testing, not a substitute for semantic knowledge. The Understand core deterministically extracts structure, and the selected model backend applies the pinned spec-miner/architecture-designer references to sampled and targeted source. This adapter does not invoke upstream's multi-agent pipeline or its interactive confirmations. Semantic coverage is targeted, not a claim of per-line full verification. Graphs retain the Understand viewer schema and are stored in each snapshot's `.ua/` directory. Each semantic snapshot records the backend identity and each generated domain keeps its provenance.

File parsing is reused by raw SHA-256, so changes inside function bodies, scripts, patches or config are never ignored as cosmetic. Current inventory removes deleted/renamed paths and rebuilds graph relationships. Domain dependencies invalidate associated summaries; unsupported parsers and ambiguous cross-language relationships are explicit gaps. A successful staged snapshot is atomically published; failure leaves the previous pointer intact.

Stakeholder-approved requirements, accepted ADRs and workload-specific performance baselines belong in the project's `curated_knowledge` JSON. Each entry should contain `id`, `statement`, `domains`, `sources` and approval provenance. The shipped RecSDK file starts empty: code behavior and historical tuning examples have not been silently declared approved requirements. Changes to curated knowledge invalidate the policy fingerprint. Model-generated `confirmed` claims are downgraded to inferred.

## PR review

```powershell
.\scripts\pa.ps1 review run --pr 425
.\scripts\pa.ps1 review watch
.\scripts\pa.ps1 review status
.\scripts\pa.ps1 review replay --branch develop --commit 4bb64b0 --structural-only
```

The first complete poll seeds existing PR versions without bulk-reviewing the backlog. New PRs, draft→ready, source/target/intent/CI changes enqueue work thereafter. Use `review run` for an existing PR. The default interval is 300 seconds; the foreground process must remain running. Stop with Ctrl+C. A crash releases the OS lock; restart recovers running jobs and preserves deduplication. GitCode queries are read-only and fully paginated. There is no remote comment/approval/merge API implementation.

Before a review, the target branch baseline is synced (`context sync`) so the PR's base snapshot is an increment of a current snapshot rather than a rebuild from a branch snapshot that stopped updating days ago. `review run --mode auto` (default) skips the head semantic domain analysis when no changed file is source-indexed (patches, docs, config); the report records `metadata.knowledge_mode=fast`, shows 快速审查 in `review.md`, and lists what was skipped under coverage gaps. `--mode deep` forces the full semantic path. The same choice is exposed as the page's 开始审查 (auto) / 深度审查 buttons.

When a PR receives new commits, the next review reads the previous report for that PR and asks the model to re-check every earlier finding (`fixed` / `partially_fixed` / `still_present` / `uncertain`). The report then carries `comparison.json` with the re-checked items, the newly confirmed findings under 确认的问题 (`F1…Fn`), and the still-open ones under `open_findings` (`P1…Pn`) which stay visible and selectable for commenting — only findings confirmed fixed drop off. Their evidence lines are re-anchored with the `previous head → head` diff (`previous_line` / `line_status` recorded; deleted code is marked and degrades to a PR-level comment), and `review.md` gets 与上一版审查的对比 / 上一轮仍未解决的问题 sections; `metadata.previous_head_sha` keeps the audited lineage. Older reports that only have `comparison.json` are shown the same way (previous findings are re-read from the referenced report and re-anchored on read).

Review findings can be pushed back to the PR as comments: `review comment --pr <n> --finding F1 --finding F2 [--mode issue|suggestion|question] [--lang zh|en]` builds common-review-style text (problem, trigger, impact, suggestion, evidence) and defaults to a dry-run preview; `--confirm` posts them. The page offers the same choice plus manual editing: each previewed comment is an editable text box, and confirming submits the edited text verbatim. English mode translates the selected findings' fields with one model call (cached in the report's `comments.i18n.json`, falling back to the original text with a note) and uses English templates/severity/footer.

Inline comments use `commit_id + path + position` (file line, must be on an added/modified diff line); anything outside the diff (or rejected by the platform) degrades to a PR-level comment that quotes `> 目标位置：path:line` / `> Target location: path:line`. Posted comments are recorded in the report directory's `comments.json`, shown as 已评论, and skipped on repeat runs unless `--force` is given. Posting requires a `GITCODE_TOKEN` with `pull_requests` write access (GitHub: `GITHUB_TOKEN`/`GH_TOKEN`); automation and tests never post to real repositories.


Existing PR comments are read before every review (`GET /pulls/<n>/comments`): the model is told not to re-report issues already raised, and to judge each existing comment as `addressed` / `still_open` / `unclear` (reported as `existing_comment_checks`, with the platform `resolved` flag as fallback). Findings that overlap an unresolved existing comment are marked `existing_comment`: same file/line (±3) means 已有相同评论, hidden from the page's comment selection and skipped at posting time (unless `--force`); a weaker title/keyword overlap only flags 可能相关评论 and stays selectable for a human decision.

Automated review/knowledge generation never receives an unrestricted shell. The Codex backend runs in its read-only sandbox with shell, unified execution and app tools disabled; the DeepSeek backend has no tools at all and receives only the controller's bounded file excerpts. Source reads from fixed base/head/merge-base workspaces use the same controller protocol (up to four model rounds, 16 ranges per round and 300 lines per range). Candidate tests/build/install commands cannot be invoked through shell tools. Structured results are validated against the full local JSON Schema subset, with at most one bounded repair attempt; truncated or invalid output fails without publishing a partial snapshot or report. Checkout hooks, filesystem monitoring and configured smudge/process filters are disabled in the controller's Git operations. The runner reads the GitCode aggregate pipeline status; inaccessible or uncollected detailed CI/NPU logs remain gaps. It never equates a pipeline status with a particular benchmark passing. Report validity is separate from findings: read `status.json` next to `review.md`; obsolete reports remain as history.

`review replay` accepts a historical commit or merge reachable from the selected branch. With `--structural-only` it produces deterministic impact inputs and an `impact.md`, explicitly **without** model review; omit that flag for model-assisted review when source transmission is authorized. Historical replays are never marked current live-PR reports.

## Feature delivery

```powershell
.\scripts\pa.ps1 feature design --branch develop --request 'Describe the change and acceptance conditions' --fetch
.\scripts\pa.ps1 feature implement --task <returned-id>
.\scripts\pa.ps1 feature verify --task <returned-id>
```

Each feature has an independent worktree. Resolve design questions before implementation. Explicit feature implementation/verification requires a backend with a controlled writable executor; the Codex backend provides that workspace-write path and can run local checks, while the DeepSeek API backend explicitly refuses `feature implement` and `feature verify` before touching the workspace or task phase. It is never triggered by PR polling. Tracked changes are exported to `changes.patch`; new files remain in the worktree and are listed in `untracked.json`. There is no automatic commit, push or mainline promotion. Pending knowledge is incorporated by mainline sync after merge.

Feature knowledge is adopted only when every recorded changed-file content hash (including deletions) is present in the chosen mainline commit. It remains an inferred candidate needing confirmation, never an automatic approval of a business rule. Curated requirements remain independently controlled.

## Validation

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Tests use real temporary Git repositories plus deterministic model/API test doubles, including a local fake DeepSeek HTTP server for JSON mode, source-request rounds, schema repair, truncation, rate limits, unreachable endpoints and provider-aware doctor behavior. Live replay artifacts and limitations, when available, are under `data/validation/`; model-assisted reports are not evidence of executed NPU tests. The selected project needs Linux/CANN/NPU for hardware verification.

## License and upstream versions

The implementation is MIT. See LICENSE, THIRD_PARTY_NOTICES.md and dependencies.lock.json. Understand and Jeffallan's skill repository are pinned to full commits; pnpm uses the upstream lockfile. Model-service terms and transitive dependency licenses remain their own. No upstream auto-update hook is installed; the controller explicitly syncs the required version before consumer workflows.
