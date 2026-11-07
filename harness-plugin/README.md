# RecSDK 代码检视（DSH 插件 bundle）

把 `project-assistant` 的只读检视能力接入 DeepSeek Harness Web UI：侧栏新增「代码检视」整页，
列出 GitCode 上 RecSDK 仓库的当前 Pull Request，选中后显示该 PR 的 AI 审查意见（严重度、
触发条件、系统影响、证据 `path:line`、验证方法、覆盖缺口）以及"审查是否基于最新提交"。

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
| `configFile` | `<projectRoot>\config\recsdk.json` | 控制器配置 |
| `cliTimeoutMs` | `120000` | 单次 CLI 调用上限 |

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
