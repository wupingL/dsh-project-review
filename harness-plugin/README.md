# RecSDK 代码检视（DSH 插件 bundle）

把 `project-assistant` 接入 DeepSeek Harness Web UI：侧栏「代码检视」整页。页面是一个项目控制台：

- **项目总览**：列出已加载项目；支持导入未加载项目（HTTPS 仓库地址 + 可选本地 clone + 分支多选）。
- **工作区**：切换分支；知识库卡片显示 未构建 / 有更新 / 已最新（远端 tip vs 快照提交、落后提交数），
  可「检查更新」「更新结构索引」「语义同步」，同步过程展示流式进度（完成后日志窗自动收起，也可手动「×」关闭，
  需要时点「查看同步日志」重新展开）。
- **模型配置**：从 DeepSeek Harness 已配置的模型中选择控制器路由，保存后即时显示就绪检查。
- **PR 检视**：当前项目的 GitCode PR 列表；选中后显示 AI 审查意见（严重度、触发条件、系统影响、
  证据 `path:line`、验证方法、覆盖缺口）与"审查是否基于最新提交"。

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
| GET | `/recsdk-review/api/health` | 控制器健康状态 |
| GET | `/recsdk-review/api/harness-models` | DeepSeek Harness 已配置的提供方/模型（含 base_url、凭据环境变量提示） |
| GET | `/recsdk-review/api/model-config?project=` | 控制器当前模型路由与就绪检查 |
| POST | `/recsdk-review/api/model-config` | 保存模型路由 `{project,provider,model,base_url,endpoint_id,credential_env}`（不保存凭据） |
| POST | `/recsdk-review/api/model-config/credential` | 保存/清除 API Key `{project,api_key}` 或 `{project,clear:true}`，密钥经 stdin 传递 |

## 模型配置页

工作区头部「模型配置」打开控制器模型路由页：

- 提供方与模型下拉来自 **DeepSeek Harness 已配置的 llm 路由**（`llm.listProviders()` / `llm.listModels()`）；
  `base_url`、`endpoint_id` 与凭据变量名按宿主设置自动填充（例如 `gateway` 会带出 OpenAI 兼容地址与 `GATEWAY_API_KEY`）。
- **只需补一个 API Key**：密钥通过 `POST /recsdk-review/api/model-config/credential` 经 stdin 交给控制器，
  写入项目状态目录的 `credentials.json`（仅本机、0600），项目配置只记录 `credential_file` / `credential_key`；
  接口响应、日志与配置里都不出现密钥值。
- 保存后立即显示就绪检查（provider/protocol/endpoint/model/credential）与缺失原因；可清除已保存的 Key。
- 未暴露 OpenAI 兼容地址的提供方（如官方 DeepSeek 平台路由）提示手动填写 base_url。

## 交互约定

- 进入工作区即自动拉取最新 PR 列表（请求带 `refresh=1`），不再提供手动「刷新」按钮。
- 知识库的「检查更新」只保留卡片内一处；同步日志可收起，任务结束后自动收起。

## Agent 工具

`recsdk_projects`、`recsdk_knowledge_status`、`recsdk_harness_models`、`recsdk_pr_list`、`recsdk_pr_review`、`recsdk_review_health`。

## 卸载

```
plugin_manager remove_bundle target = "@local/recsdk-review"
```

卸载只移除本 bundle；控制器的 `data/`、SQLite 队列、报告目录和原始 clone 不受影响。

## 验证

```powershell
# 1) Host 半身冒烟测试（不需要安装、不需要真实控制器）：假 ctx + 假控制器，18 项检查
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

- 页面是只读浏览：可以刷新 PR 列表、查看已有审查结果；**不能**在页面上发起新审查、
  评论、审批或合并（发起审查仍由控制器 `review run` / 后续模型桥负责）。
- 控制器当前直连 DeepSeek 的模型配置未就绪（`doctor` 不 ready）；在模型桥接通前，
  新 PR 会显示"未审查"，这是真实状态而不是页面缺陷。
- PR 列表优先在线读取 GitCode；网络/凭据失败时回退本地缓存并在页面标注数据来源与时间。
- 真实审查需要 Linux/CANN/NPU 的硬件验证不在本插件范围内；UI 会原样呈现覆盖缺口。
