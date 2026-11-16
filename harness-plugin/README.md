# RecSDK 代码检视（DSH 插件 bundle）

把 `project-assistant` 接入 DeepSeek Harness Web UI：侧栏「代码检视」整页。页面是一个项目控制台：

- **项目总览**：列出已加载项目；支持导入未加载项目（HTTPS 仓库地址 + 可选本地 clone + 分支多选）。
- **工作区**：切换分支；知识库卡片显示 未构建 / 有更新 / 已最新（远端 tip vs 快照提交、落后提交数），
  可「检查更新」「更新结构索引」「语义同步」，同步过程展示流式进度（完成后日志窗自动收起，也可手动「×」关闭，
  需要时点「查看同步日志」重新展开）。
- **模型配置**：从 DeepSeek Harness 已配置的模型中选择控制器路由，保存后即时显示就绪检查。
- **PR 检视**：当前项目的 GitCode PR 列表；选中后显示 AI 审查意见（严重度、触发条件、系统影响、
  证据 `path:line`、验证方法、覆盖缺口）与"审查是否基于最新提交"。
- **点击执行审查**：未审查 / 已过期 / 失败的 PR 详情里有「开始审查」（或「重新审查」「重试审查」）按钮。
  点击后宿主以**后台任务**执行控制器 `review run --pr N`，页面每 2 秒轮询进度（获取提交 → 同步 base/head
  知识 → 调用模型 → 校验证据 → 写报告），完成后自动刷新列表与详情。首次审查会为 base/head 提交构建知识快照，
  可能需要几分钟；模型未就绪时按钮禁用并提示去「模型配置」。

## 组成

| 部分 | 文件 | 说明 |
| --- | --- | --- |
| Bundle 清单 | `package.json` | `dsh.bundle.patch` + `dsh.client`，客户端半身绑定在本行（裸包名） |
| 装载补丁 | `cordis.patch.yml` | 插入一行 `@local/recsdk-review`，配置控制器路径 |
| Host 半身 | `index.js` | 调用控制器 CLI（只读）、缓存、同源 HTTP 路由、3 个 Agent 工具 |
| Client 半身 | `client.js` | `main` 整页 + `sidebar.panellist` 导航行，主题 token 样式 |
| 显示资源 | `locale/*.json`、`icon.svg` | 插件管理器的标题/描述与图标 |

## 数据流

```
浏览器页面 (client.js)
  └─ GET /recsdk-review/api/pulls            ─┐
  └─ GET /recsdk-review/api/pulls/<number>    ├─ Host 半身 (index.js)
  └─ GET /recsdk-review/api/health           ─┘        │ spawn（只读 CLI）
                                                      ▼
                                         project_assistant.cli
                                           review list / review show / doctor
                                                      │
                                    SQLite（只读连接）+ reports/ 目录 + GitCode 只读 API
```

- 页面数据永远来自控制器；插件不复制业务判定逻辑，也不写控制器状态。
- 语义审查结果的有效性以报告目录里的 `status.json` / `latest.json` / `STALE.txt` 为准；
  页面只展示并提示"审查基于旧提交"，不自行重新判定当前性。
- 插件不持有模型凭据、不直接发评论/审批/合并、不在页面上执行 PR 代码。

## 安装

在 DSH 会话里安装本目录（workspace 绝对路径）：

```
plugin_manager install_bundle target = "D:\\GRVLLM\\ReviewWork\\project-assistant\\harness-plugin"
```

安装会写入当前 profile 的 `package.json` 与 bundle 选择，并对所有会话生效；本地目录安装是链接
（link）方式，修改 `client.js` 等文件后刷新页面即可生效，替换已安装包则需要重启。

## 配置

`cordis.patch.yml` 的行配置（安装后可改本文件）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `projectRoot` | `D:\GRVLLM\ReviewWork\project-assistant` | 控制器工程目录 |
| `python` | `<projectRoot>\.venv\Scripts\python.exe` | 控制器解释器（缺失时回退 PATH 的 `python`） |
| `configFile` | `<projectRoot>\config\recsdk.json` | 默认项目配置（`--project` 优先） |
| `cliTimeoutMs` | `120000` | 普通命令上限（列表/详情/状态） |
| `syncTimeoutMs` | `1800000` | 知识库构建任务上限（首次构建可能较久） |
| `reviewTimeoutMs` | `3600000` | 单个 PR 审查任务上限（含基线/快照同步） |

## HTTP 接口（同源）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/recsdk-review/api/projects` | 项目列表 + 各分支快照指针 |
| GET | `/recsdk-review/api/projects/probe?url=&local=` | 探测远端/本地分支 |
| POST | `/recsdk-review/api/projects/import` | 导入项目 `{url,name,local,branches}` |
| GET | `/recsdk-review/api/projects/<id>/branches?refresh=1` | 分支列表 |
| GET | `/recsdk-review/api/projects/<id>/knowledge?ref=&refresh=1` | 知识库状态 |
| POST | `/recsdk-review/api/projects/<id>/knowledge/sync` | 启动构建 `{ref,mode,fetch}` → `{job_id}` |
| GET | `/recsdk-review/api/jobs/<jobId>` | 构建进度与结果 |
| GET | `/recsdk-review/api/pulls?project=` | PR 列表（`offline=1` / `refresh=1`） |
| GET | `/recsdk-review/api/pulls/<number>?project=` | PR 详情与审查结果 |
| POST | `/recsdk-review/api/pulls/<number>/review` | 启动真实审查 `{project,mode:"auto"\|"deep"}` → `{job_id}`（后台任务） |
| GET | `/recsdk-review/api/jobs/<jobId>` | 后台任务进度（知识同步 / PR 审查共用） |
| GET | `/recsdk-review/api/health` | 控制器健康状态 |
| GET | `/recsdk-review/api/harness-models` | DeepSeek Harness 已配置的提供方/模型（含 base_url、凭据环境变量提示） |
| GET | `/recsdk-review/api/model-config?project=` | 控制器当前模型路由与就绪检查 |
| POST | `/recsdk-review/api/model-config` | 保存模型路由 `{project,provider,model,base_url,endpoint_id,credential_env}`（不保存凭据） |
| POST | `/recsdk-review/api/model-config/apply` | 一步保存路由 + API Key（`{project,provider,model,base_url?,credential_env?,api_key?}`），返回就绪状态与连通性测试 |
| POST | `/recsdk-review/api/model-config/test` | 用已保存配置测试连通性（`GET {base_url}/models`），不返回密钥与正文 |
| POST | `/recsdk-review/api/model-config/credential` | 保存/清除 API Key `{project,api_key}` 或 `{project,clear:true}`，密钥经 stdin 传递 |

## 模型配置页（可直接使用 Harness 当前模型，免配置）

**推荐路径：点「使用 Harness 当前模型」按钮，不需要任何 API Key 或手工地址。**

原理：插件在 `127.0.0.1:55114`（可用 `bridgePort` 配置）起一个**带随机令牌的最小 OpenAI 兼容服务**，
控制器把 `model_backend.base_url` 指向它；插件收到 `/chat/completions` 后转成宿主 `llm.stream(...)` 调用，
复用 Harness 当前启用的模型与凭据。令牌持久化在 `<projectRoot>/.harness-bridge-token`（已加入 .gitignore）。

- 按钮动作：读 `agentDefaultModel.currentSelection()` → 写控制器路由（`provider::model` 标签）→ 写入桥令牌 → 校验就绪 → 跑一次 `/models` 连通性测试。
- 插件加载即开始监听固定端口，因此 Harness 重启后已保存的路由仍然可用；令牌持久化在 `.harness-bridge-token`，端口可用 `bridgePort` 改（默认 55114），被占用时退回临时端口（需重新点一次）。
- 手动路径（可选）：提供方 + 模型 + API Key 直连某个 OpenAI 兼容网关。Harness 提供方 id 会自动映射为控制器后端（`codex` → codex，其它 → `deepseek`），没有 OpenAI 兼容地址的提供方会给出明确提示。
- 输出预算：推理型模型可能把 token 预算先花在思考上，最终内容为空。桥会自动把 `max_tokens` 翻倍重试（上限 65536），控制器仍可保持保守的 `task_profiles`，不必因预算调整而重建知识快照。

切换路由后，控制器的语义身份（policy）会变化，旧知识快照会显示为需要更新——这是预期行为。

## 审查模式（自动快速 / 深度）

审查前会先把**目标分支基线**同步到最新（`knowledge sync --ref <target>`），这样 PR 的 base 快照
只是一次增量，而不是从几周前的分支快照全量重建。

随后自动判断 head 端是否需要语义知识：

| 情况 | 行为 | 耗时 |
| --- | --- | --- |
| 变更文件全部未被源码索引（`.patch`、文档、配置、二进制等，`coverage=inventory-only/absent`） | **快速审查**：head 只用结构快照，跳过语义领域分析，靠 diff + 工作区只读核对 | 分钟级 |
| 任一变更文件被解析器建图（`.py`、`.c/.cpp/.h`、`.ts/.js` 等） | **深度审查**：head 建语义快照（未受影响领域直接复用 base 的语义知识） | 较久 |

页面上主按钮是「开始审查」（自动选择），旁边「深度审查」强制走完整语义链路；报告页会显示
「快速审查 / 深度审查」标记，并在覆盖缺口里写明快速模式跳过了什么。

```powershell
# 等价 CLI
.\.venv\Scripts\python.exe -m project_assistant.cli review run --pr 413            # auto
.\.venv\Scripts\python.exe -m project_assistant.cli review run --pr 413 --mode deep
```

同一提交重复审查直接命中已建快照；只有新提交才需要补建。

## PR 推送新提交后：自动重审 + 与上一版对比

- **自动重审**：插件每 `autoReviewPollMs`（默认 120000 毫秒，可用 `autoReviewUpdates: false` 关闭）检查一次项目列表。
  只要某个 PR **已经审查过**且 `head_sha` 与 `reviewed_head_sha` 不一致（或报告已过期），就以 `auto` 模式自动
  启动对**更新后版本**的审查；从未审查过的 PR 不会自动排队（避免一进页面就把积压 PR 全部跑一遍）。
  每个项目同时只跑一个，同一 PR 10 分钟内不会重复触发。
- **与上一版对比**：重新审查时控制器会读取同一 PR 上一份报告，把上一版结论编号为 `P1…Pn` 交给模型逐条复核，
  新报告里给出 `comparison.json`：
  - `fixed`：已修复（附新证据/说明）
  - `open`：仍存在或部分修复
  - `uncertain`：无法确认（模型漏答时也落到这里）
  - `new`：本轮新发现（同时写入报告的「确认的问题」）
  报告 `review.md` 增加「与上一版审查的对比」，页面详情也有对应区块；`review.json.metadata` 记录
  `previous_head_sha` / `previous_report` 以便追溯。
- 临时手工触发：`review run --pr <n> --mode deep`（强制完整语义）。

## 把审查意见提交到 PR（多选评论）

详情页的每条审查意见前有复选框：勾选若干条 → 选评论口径（问题 / 建议 / 疑问）→「提交评论到 PR」。
第一次点击只做 **预览**（dry-run），确认后才真正提交到 PR。

- **常用检视口径**：评论正文按「【问题·严重度】标题 → 触发场景 → 影响 → 建议 → 依据 `path:line`」组织；
  建议口径只给修改建议，疑问口径改成向作者提问。
- **行内定位**：用 `commit_id + path + position` 提交行内评论。`position` 用文件行号，且必须落在本次 diff
  的新增/修改行上；不在 diff 内的意见（或平台返回 400）自动退化为 PR 级评论，并在正文用 `> 目标位置：path:line` 标注。
- **防重复刷屏**：已提交的评论记录在报告目录 `comments.json`，页面显示「已评论」，默认跳过；`--force` 才允许重复提交。
- **安全门槛**：报告必须 `current` 且报告 head 与 PR 当前 head 一致，否则拒绝（避免按旧行号评论）；
  需要带 `pull_requests` 写权限的 `GITCODE_TOKEN`（与只读查询同一个变量）。
- 接口与命令：

```powershell
# 先预览（不会对 PR 产生任何写入）
.\.venv\Scripts\python.exe -m project_assistant.cli --project recsdk review comment --pr 413 --finding 1 --finding 2

# 确认提交（需要 GITCODE_TOKEN）
.\.venv\Scripts\python.exe -m project_assistant.cli --project recsdk review comment --pr 413 --finding 1 --finding 2 --confirm
```

```
POST /recsdk-review/api/pulls/<number>/comments
{"project": "recsdk", "findings": ["F1", "F2"], "mode": "issue", "confirm": false}
```

> 自动化测试与开发调试都只走 dry-run / 假传输层；不会对 RecSDK 等真实仓库提交评论。

### 与 PR 已有评论的去重 / 处理判断

PR 上常已有人工或其他工具的评论，审查与评论都会考虑：

- **审查阶段**：读取 `GET /pulls/:number/comments`，在提示中要求模型（1）不要重复报告已有评论指出的问题，
  （2）对每条已有评论给出处理状态 `addressed` / `still_open` / `unclear`。报告写入
  `existing_comment_checks` 并生成「已有评论的处理情况」章节，页面同样展示。
  模型漏答时按平台 `resolved` 标记降级（`resolved=true` → 已处理，否则 无法确认）。
- **重复标注**：与「未解决」已有评论重复（同文件同行 ±3，或标题与评论正文关键词高度重合）的意见，
  会在卡片上标注「已有相同评论」，默认不参与勾选提交。
- **提交阶段**：真正提交前再查一次已有评论；重复的默认跳过并在结果里给出说明（`--force` 可强制重复提交）。

## 本地路径（代码镜像 / 知识库）

页面直接显示本地路径，点击路径文字即复制：

- **项目卡片**：显示项目状态根 `<data>/repositories/<repo_key>`（含 `mirror.git`、`snapshots/`、`refs.json`、`reports/`、`state.sqlite`）。
- **知识库卡片**：显示当前分支的「知识库」快照目录（`snapshots/<snapshot_id>/`）与「代码镜像」（`mirror.git`）。

对应 CLI（输出里含 `paths` 字段）：

```powershell
python -m project_assistant.cli project list                          # mirror_path / snapshots_path / worktrees_path / refs_path ...
python -m project_assistant.cli knowledge status --id <项目> --ref <分支>   # paths.snapshot 即当前知识库快照目录
```

目录约定（默认 `<projectRoot>/data` 为状态根）：

| 内容 | 路径 |
| --- | --- |
| 项目配置 | `config/<project>.json` |
| 仓库镜像（离线 git） | `data/repositories/<key>/mirror.git` |
| 知识快照 | `data/repositories/<key>/snapshots/<snapshot_id>/`（`manifest.json`、`files.json`、`knowledge.json`、`.ua/`） |
| 快照指针 | `data/repositories/<key>/refs.json` |
| 分析 worktree | `worktrees/<key8>/<sha12>/` |
| 审查报告 | `data/repositories/<key>/reports/<pr>/<fingerprint>/` |
| 队列与去重 | `data/repositories/<key>/state.sqlite` |

## 交互约定

- 进入工作区即自动拉取最新 PR 列表（请求带 `refresh=1`），不再提供手动「刷新」按钮。
- 知识库的「检查更新」只保留卡片内一处；同步日志可收起，任务结束后自动收起。
- 插件启动时会把上次进程被中断（Harness 或控制器重启）后遗留的「进行中」任务标记为失败
  （`review recover --fail-running`），页面随即显示失败原因和「重试审查」；若另一个控制器进程
  正持有审查队列锁则跳过，不会打断真实审查。

## Agent 工具

`recsdk_projects`、`recsdk_knowledge_status`、`recsdk_harness_models`、`recsdk_pr_list`、`recsdk_pr_review`、`recsdk_review_health`。

## 卸载

```
plugin_manager remove_bundle target = "@local/recsdk-review"
```

卸载只移除本 bundle；控制器的 `data/`、SQLite 队列、报告目录和原始 clone 不受影响。

## 验证

```powershell
# 1) Host 半身冒烟测试（不需要安装、不需要真实控制器）：假 ctx + 假控制器，63 项检查
node scripts\verify_harness_plugin.mjs

# 2) 控制器只读命令
.\.venv\Scripts\python.exe -m project_assistant.cli review list
.\.venv\Scripts\python.exe -m project_assistant.cli review show --pr 432

# 3) 安装后核验（需要带浏览器会话鉴权的 URL；无鉴权时脚本会提示 401）
node scripts\verify_bundle_installed.mjs

# 4) 控制器回归
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

安装后的注册状态可用 Harness 的 Slot 检查确认：`main` 占位者 `key=recsdk-review`、
`sidebar.panellist` 占位者 `id=recsdk-review` 均为 active。工程内已安装一次
（`@local/recsdk-review`，`link:` 方式，`application: applied`，无 warning）。

> 本地目录安装是链接：修改 `client.js` 后刷新 Harness 页面即可看到新代码；若浏览器仍加载旧模块，
> 重启 Harness 桌面应用以刷新 Web 模块代。

## 限制（与控制器一致）

- 页面可以发起审查（按钮触发控制器 `review run`），但**不能**在页面上评论、审批或合并 PR。
- 快速审查不执行 head 语义领域分析：对 patch/文档类变更够用，对需要领域契约推理的变更请用「深度审查」。
- PR 列表优先在线读取 GitCode；网络/凭据失败时回退本地缓存并在页面标注数据来源与时间。
- 真实审查需要 Linux/CANN/NPU 的硬件验证不在本插件范围内；UI 会原样呈现覆盖缺口。
