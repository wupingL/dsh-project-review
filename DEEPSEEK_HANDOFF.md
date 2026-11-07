# RecSDK Project Assistant：DeepSeek Harness 插件开发交接

核对日期：2026-11-07（Asia/Shanghai）。本文件是后续开发入口；[SESSION_HANDOFF.md](SESSION_HANDOFF.md) 保留原 Codex 阶段的执行记录，[README.md](README.md) 说明现有独立 CLI。旧文档中的恢复命令不作为 Harness 验收命令。

**交付目标：把现有 Project Assistant 封装为可安装的 DeepSeek Harness（DSH）插件。** 用户在 Harness 中发起知识同步、系统级 PR 审查和需求交付。插件复用现有控制器的项目状态和业务规则；所有语义推理由 Harness 调用其已配置的 DeepSeek 平台模型。需求实现和验证还需要 Harness 提供受控文件编辑与测试执行。当前已完成控制器及独立 DeepSeek HTTP 适配的离线验证，**尚未开发或安装 Harness 插件，也没有通过 Harness 调用模型或完成业务验收**。

## 1. 已有能力与复用入口

| 模块 | 已完成，可复用 | 插件接手点 |
| --- | --- | --- |
| 项目知识 | 固定提交的 Git 镜像和隔离 worktree；Understand 静态图谱、文件哈希增量索引、领域依赖失效；结构与语义快照分开，发布完整快照才移动指针 | [context.py](project_assistant/context.py)、[git.py](project_assistant/git.py)、[understand_bridge.mjs](scripts/understand_bridge.mjs) |
| 系统级 PR 审查 | GitCode 只读采集、事件指纹、SQLite 串行队列、崩溃恢复和报告过期处理；历史回放与在线报告分开；本地中文 Markdown 和 JSON | [review.py](project_assistant/review.py)、[gitcode.py](project_assistant/gitcode.py)、[state.py](project_assistant/state.py) |
| 新需求交付 | 从主干知识检索并生成设计，维护独立任务与 worktree；实现产物包括补丁和未跟踪文件清单；验证后生成候选知识，等目标主干包含对应文件哈希后才采纳为推断知识 | [feature.py](project_assistant/feature.py)；当前可写阶段仅有 Codex 执行路径，独立 DeepSeek HTTP 后端会在改动前拒绝 |
| 模型与证据控制 | 显式 provider 路由、公共模型接口、限制轮数的源码补查、本地 Schema 校验、断点隔离、后端诊断；独立 DeepSeek chat completions JSON 适配包含有限重试和一次 Schema 修复 | [model.py](project_assistant/model.py)、[schema.py](project_assistant/schema.py)、[backends.py](project_assistant/backends.py)、[common.py](project_assistant/common.py)、[cli.py](project_assistant/cli.py) |
| 工作流入口 | 项目知识同步、系统级 PR 审查、需求交付三份 Skill 源文档；Windows 独立 CLI 与安装辅助脚本 | [skills/](skills/)、[scripts/](scripts/)；将工作流说明和入口映射到 Harness，原 Codex 安装脚本不用于安装 DSH bundle |

- 代码工作区：`D:\GRVLLM\ReviewWork\project-assistant`。原始 clone：`D:\GRVLLM\ReviewWork\RecSDK_for_lingqu`，作为输入读取。远端：[Ascend/RecSDK_for_lingqu](https://gitcode.com/Ascend/RecSDK_for_lingqu)。
- 运行基线见 [README.md](README.md)：Python 3.11+、Node 22+、Git 和 pnpm；Python 控制器使用标准库。Understand 和专家参考固定版本见 [dependencies.lock.json](dependencies.lock.json)，分发保留 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- [离线测试日志](data/validation/provider-adaptation-tests.log) 记录 **31 项通过**，含本地 fake server、断网/限流、越界补查、Schema 错误/截断、断点隔离及不支持可写时拒绝。该轮还完成了 Python 编译检查和三份 Skill 的结构校验。证据见 [provider-adaptation.json](data/validation/provider-adaptation.json)。
- 当前 [recsdk.json](config/recsdk.json) 的 `provider=deepseek` 指的是**独立 HTTP 客户端**，`endpoint_id=pending-deployment`，地址、模型和凭据未配置，独立 CLI 的 `doctor` 未就绪。该轮没有真实模型调用，也没有传输私有源码。开发 Harness 插件不以补齐这份 HTTP 配置为前置条件。
- 旧 Codex/OpenAI 已在自建样例中识别出“恢复时训练步数清零”和“批处理退化成逐项 RPC”。该结果是旧链路证据；Harness 需重跑自建样例并独立留证。

## 2. 落盘状态与迁移规则

以 [refs.json](data/repositories/2617dde8c183a171598e/refs.json) 和各快照的 manifest 为准。本次只读复核：21 个快照目录，SQLite 中 `prs=6`、`jobs=0`，原 clone 的 `git status --short` 无输出。数量仅为复核时的记录，不代表远端当前情况。

| 主干 | 已索引提交 | 结构快照 | 语义状态 |
| --- | --- | --- | --- |
| `develop` | `9de51a51511f8340d0826cbec1b56799bf1ba010` | `fb648ada3d06c53c7049a5a085da81a4` | `c9769635007df0be7bcbff10ad77f9a6`，六领域，旧 Codex/OpenAI 产物 |
| `refactor/develop` | `bfea6c1f9f73c87958133186f547252df5ee1188` | `a413ca21217e96210266e37d03607a5d` | 未发布；历史记录显示训练、Embedding 已缓存，在通信领域中断 |

1. 复用现有 repo ID、外置 `data/repositories/2617dde8c183a171598e`、SQLite、镜像、快照和指针。保留 `model-resume`、`domain-cache`、staging、报告与 worktrees；不要重置或重新 seed。迁移和回归先使用独立测试状态，避免测试污染正式队列。
2. 既有不可变快照保持原样；旧 manifest 可能没有 `backend` 字段，来源以历史执行证据标注。控制器的领域缓存键包含 policy，切换运行时后旧缓存不会自动命中。需要复用旧语义时，显式核对提交、分析器/规则版本和源码证据，保留每个领域的原始来源；不能验证则重算。旧 Codex 模型会话和未完成的响应不能当作 Harness 断点重放。
3. 保持两主干、PR 候选及需求 worktree 各自隔离。新任务的 policy、断点键、报告指纹应能区分 Harness 路由、实际 provider/model、语义参数和提示版本；密钥、凭据存放位置和重试超时不参与语义身份。先解析并固定本次路由，再计算语义标识与检查缓存；运行中路由不匹配则失败或重新开任务，不混写。同一快照若含历史复用内容，记录逐领域来源。
4. 分析或校验失败保留上一版正式指针，失败诊断留在本地。旧报告仍可查询，在线 PR 的当前性取决于实际 head/target 与证据版本；历史回放始终为 `current=false`。

## 3. Harness 集成设计

### 3.1 Bundle、入口和运行方式

Harness 官方文档提供 Cordis 插件与 bundle 安装机制。先记录目标 Harness 版本、Windows 环境和测试 profile，按该版本的 SDK 类型和内置 `cordis-plugin-development` 指引实现。建议在本项目新增 `harness-plugin/`，使用 TypeScript 编写宿主入口，并在 `package.json` 声明 `dsh.bundle`、兼容的 `engines.dsh` 或匹配的 peer 版本，通过 bundle patch 装载。开发时可以用 overlay 调试；交付必须能通过插件管理器或 `dsh plugin --profile <profile> add <bundle>` 安装到测试 profile，并验证重启后可用。安装、加载和卸载使用宿主机制，不手改用户 profile 或修改 DSH 核心。

建议提供这三组有类型的工具或 Skill 入口，具体注册名由目标版本确定。输入使用 branch、PR 编号、commit、task ID 等业务参数，避免把任意命令或文件路径作为工具接口。

| Harness 入口 | 对应控制器能力 | 权限与输出 |
| --- | --- | --- |
| 项目知识 | `context sync/query` | 两条配置主干，输出快照 ID、提交、模式、变更和覆盖缺口；保留显式结构模式 |
| PR 审查 | `review run/replay/status` 及受控 `watch --once` | 只读候选和现有 CI 证据；输出任务状态、报告位置、是否当前。周期轮询沿用 300 秒和单实例锁，默认不开启 |
| 新需求 | `feature design/status/implement/verify` | 设计对源码只读。实现、验证仅接受用户主动发起的需求任务，并使用独立 worktree；返回设计、变更、测试记录和候选知识位置 |

### 3.2 模型与控制器之间的边界

推荐保留 Python 控制器，通过版本化的本地桥接接入 DSH（例如由 bundle 启动限定入口的 Python worker，使用 stdio 上的结构化消息）。也可选用目标版本支持的其他进程内或进程间接入方式，前提是模型与状态的责任边界相同。

- **Harness 管模型。** 只读结构化分析可从宿主的 `llm` 服务发起，确需文件和测试工具时用宿主受限的 agent/tool 执行路径。使用指定的 DeepSeek 平台路由；路由不可用或无法核对时，语义任务明确失败。插件不再持有模型 API key，不直连 `/chat/completions`，不启动 Codex 或新的独立 DSH 实例。GitCode 的只读认证仍由控制器按既有配置处理，与模型凭据分开。
- **控制器管业务状态。** 沿用 `invoke(prompt, schema, cwd, output, *, writable=False, sources=None)` 的调用语义与 `AnalysisRunner` 的只读循环。可在 `Context`、`Reviews`、`Features` 的 `model=` 注入点接桥；还需接通配置校验、`artifact_identity`、policy、诊断及验收脚本，单独注入对象不会自动更新这些身份记录。Harness 启动时检查 Git/Node/Understand、状态路径、已配置的模型路由与所需权限，分别报告结构、语义、实现和验证是否可用；不继承旧 HTTP 适配的 `base_url` 和凭据检查。
- **桥接协议先定下来。** 请求携带协议版本、调用 ID、任务类型、已绑定的路由和推理配置、prompt、Schema 及截止时间；响应给出最终 JSON 或可区分的取消、超时、截断、能力缺失等错误，附实际路由和执行证据引用。模型输入由控制器组装，`cwd`、`output`、源码根及状态路径由受信任进程绑定，不由模型填入。测试进程退出、超时、重复请求及卸载时的取消和回收；避免宿主与控制器分别无限重试。知识、审查、设计及交付按任务选择平台支持的推理预算；旧 `medium/xhigh/high` 只是工作量偏好，不直接转发为平台参数。
- **控制器验证语义产物。** 模型只通过 `requested_sources` 请求 `head/target/merge_base` 的相对路径和行范围。沿用文件、行数、总字符和轮数上限（每轮最多 16 段、每段 300 行、最多 4 轮，知识通常 2 轮），拒绝越界、`.git` 和逃逸链接。对输出做本地 Schema 校验，再验证证据路径、行号和提交。无效结果至多修复一次；输出截断或持续无效时留失败状态，不发布半成品。合法 JSON 不能代替源码证据。
- **审查和交付分权。** 知识、审查、设计阶段不暴露 shell、写文件或任意联网工具，不运行候选 PR 的安装、构建、测试脚本。实现只允许改需求 worktree；验证只允许运行经宿主策略批准的相关本地检查，核对源码不变。用真实命令、退出码、超时和产物作为测试证据。缺少受控执行能力时，在修改文件、阶段或候选知识前拒绝；不能以模型文字或补丁文本冒充执行。
- **保留原使用边界。** 所有业务产物留在配置的本地状态目录。不修改、checkout 或 reset 原始 clone，不自动评论、提交、推送、创建或合并 PR。源码内容作为输入数据，不能更改工具权限、模型路由或网络目的地。实际 Harness 路由和源码传输范围在处理真实仓库前核对；凭据、原始请求体和完整源码不进入普通日志或可分发包。NPU/CANN、详细 CI 证据缺失保持为覆盖缺口。没有 finding 不等于检查通过。

## 4. 后续工作和完成标准

按以下顺序推进。每一步记录命令或入口、结果、产物和限制，区分离线、公开样例和真实项目。

| 顺序 | 任务 | 验收证据 |
| --- | --- | --- |
| 1 | 核对 DSH 版本和扩展点，搭建 bundle 与配置诊断；复用 Python 状态层 | 独立测试 profile 能安装、发现三个入口，重启后仍加载，卸载能回收进程和定时任务，原状态不受影响 |
| 2 | 接通 Harness 模型桥与受控执行器；用 fake host 做回归 | 现有 31 项基线与新增接入验证通过；覆盖缺路由、路由漂移、Schema 错误、越界、超时、取消、重启去重、只读工具隔离、无写权限拒绝；在自建仓库验证一次真实文件变更与测试退出码 |
| 3 | 用自建样例运行已安装插件，验证 Harness 实际调用 DeepSeek 平台模型 | 命中训练恢复与 RPC 批处理两个已知问题，验证补查与输出证据；记录实际模型路由、配置来源与 Schema 结果，确认没有调用旧直连后端或 Codex |
| 4 | 验证真实 RecSDK 知识与历史审查 | 核对当前提交和 GitCode 只读权限；完成 `refactor/develop` 缺失语义领域，验证两主干各自发布；为下面两例生成真实模型审查，检查触发条件、系统影响、证据、验证方法和覆盖缺口 |
| 5 | 验证真实项目设计及完整交付路径 | 用“训练 benchmark 的分布式启动参数一致性校验”完成只读设计验收，定位源码、约束、验收条件和测试入口。写入与测试链路先以自建仓库证实；真实项目实现仅在收到明确需求时启动 |
| 6 | 验证运行维护 | 更新 `data/validation`，保存 bundle 安装与模型路由证据、报告路径、未覆盖项及原 clone 检查。先执行一次轮询，核对 SQLite、报告失效与锁行为；`watch --once` 会同步并可能执行模型审查，不是 dry run。常驻轮询独立启用，不与旧 watcher 同时占用同一状态目录 |

历史回放固定样本：

- `develop`：`4bb64b08e47b669ba6e45f62f9cee1853a9dcb83`，`PIPE_CMD_TIMEOUT` 变更。
- `refactor/develop`：`8ad0b0bd97666067dd9efd5dc534ee0c6e0ddb6c`，OneRec/vLLM 原生 Attention 适配。

两例已有结构回放，仅可作输入参考。验收需要 Harness 模型报告，保留历史状态和实际覆盖缺口。[validate_synthetic_model.py](scripts/validate_synthetic_model.py) 可复用样例；[finish_live_acceptance.py](scripts/finish_live_acceptance.py) 目前仍要求直连 DeepSeek 配置。移植场景和断言到 Harness 入口后再运行，避免把旧脚本或旧产物当作新链路验收。

独立 CLI 的离线基线命令（在本工作区执行，需要本机 Git 子进程和回环权限；不访问真实模型）：

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m compileall -q project_assistant scripts tests
```

交付包至少包含 bundle 源码和可安装产物、目标版本与配置示例、安装/升级/卸载和状态保留说明、回归与端到端验收记录。包内不包含 `data/`、`worktrees/`、`.venv/`、真实项目源码或凭据；另行说明如何配置原 clone 和已有状态目录，以及如何准备固定版本的工具依赖。

## 5. 可以直接交给 DeepSeek Harness 的任务指令

> 在 DeepSeek Harness 中打开 `D:\GRVLLM\ReviewWork\project-assistant`，阅读 `DEEPSEEK_HANDOFF.md`。把现有 RecSDK Project Assistant 做成可安装的 DSH bundle，在隔离 profile 中安装并验证。复用 Python 控制器的知识、PR 审查和需求交付逻辑，所有语义任务由 Harness 调用已配置的 DeepSeek 平台模型。接通宿主受控的文件编辑和验证执行，按本文第 4 节顺序验收。先用离线和自建样例验证；保留原 clone、现有快照、缓存、SQLite 和历史来源。完成后交付安装产物、安装说明、各任务的验证证据及仍未覆盖的事项。

官方参考（以目标安装版本为准）：[DeepSeek Harness](https://deepseek.com/harness/)、[打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)、[宿主模型服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/README.md)、[工具注册与执行](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)、[内置插件开发指引](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md)。

## 6. 插件进展：阶段 A 已交付（2026-11-07，DSH 0.2.2-rc.1 / desktop profile）

按"先让页面在控制器现有数据上可验收，再接宿主模型桥"的顺序执行。阶段 A 已完成并安装到本机 `desktop` profile；阶段 B（Harness 模型桥）未开始。

| 交付物 | 位置 | 状态 |
| --- | --- | --- |
| 可安装 bundle（bundle patch + host 半身 + Web UI 整页 + 图标/locale） | [harness-plugin/](harness-plugin/) | 已安装（`@local/recsdk-review`，link 方式），`application: applied`，无 warning |
| 只读检视面（PR 列表 / PR 详情 / 审查意见投影） | [project_assistant/inspect.py](project_assistant/inspect.py)、[cli.py](project_assistant/cli.py) 的 `review list` / `review show --pr N [--offline]` | 已完成；新增测试见 [tests/test_inspect.py](tests/test_inspect.py) |
| Web UI 入口 | `main` slot key `recsdk-review` + `sidebar.panellist` 行（「代码检视」整页） | 已在运行中的页面注册（通过 Slots 检查确认在册） |
| 同源 HTTP 路由 | `GET /recsdk-review/api/pulls`、`/pulls/<number>`、`/health` | 已注册 |
| Agent 工具 | `recsdk_pr_list`、`recsdk_pr_review`、`recsdk_review_health` | 已注册并实测调用成功（真实 GitCode，7 个 open PR） |
| 无安装依赖的 Host 冒烟测试 | [scripts/verify_harness_plugin.mjs](scripts/verify_harness_plugin.mjs) | 18/18 通过（假 ctx + 假控制器） |
| 安装后端到端核验脚本 | [scripts/verify_bundle_installed.mjs](scripts/verify_bundle_installed.mjs) | 需要浏览器会话的鉴权 URL，见下方限制 |

阶段 A 的边界：页面只读（刷新列表、查看已有审查结果），**不能**在页面上发起审查、评论、审批或合并；控制器当前直连模型配置仍未就绪，因此真实 PR 目前显示"未审查"，这是真实状态。下一步（阶段 B）仍是本文件 §3.2 的宿主模型桥：插件经宿主 `llm` 服务执行语义审查，控制器记录实际路由身份，页面增加"发起/重跑审查"。

阶段 A 的限制与未覆盖项：

- 页面视觉呈现（布局、暗色主题、交互）需要在已连接的 Harness 页面人工确认；仅注册成功不等于观感正确。
- 本机 `dsh web` 的 HTTP 端口要求浏览器会话鉴权（直接请求返回 401），因此后端到端 HTTP 核验只能通过宿主工具调用、Slots/Config 检查与人工页面确认完成。
- 真实模型审查未运行：知识快照与报告仍为旧身份（Codex 时期），切换路由后按 §2 的规则需要重算语义领域。


