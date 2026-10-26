# 变更记录

## 0.36.1

- 群聊里发送指令但未 @机器人 时，不再静默忽略，回一条“请先 @机器人”的提示。
- 修复用户误以为 `/help` 执行失败的问题；`/help` 本身对 L0 开放。

## 0.36.0

- 安全加固 `/qq-bridge` 控制接口：移除 CORS 通配符，所有 POST 必须带
  `x-qq-bridge-control: 1`，防止任意网页跨站修改管理员、API Key、NapCat 路径或启停 NapCat。
- 客户端请求自动带控制头；OPTIONS 不再返回 CORS 许可。
- 新增 `SECURITY.md`，说明信任边界、已实施保护和已知风险。

## 0.35.1

- 新增 `/quota`：私聊显示个人生图额度；群聊显示本群共享额度。
- `/whoami` 增加生图额度行。

## 0.35.0

- L1/L2 默认拥有 `image` 能力；L0 仍没有，L3 仍是全部能力。
- 生图仍需分配 `imageQuota`；能力默认不代表有额度。
- `/admin deny image` 现在会写入 denied 列表，可以撤销 L1/L2 默认生图能力。
- 私聊和群主体（`group:<群号>`）都适用。

## 0.34.0

- 默认沙箱调整：L1/L2 从 `read-only` 改为 `workspace-write`；L0 仍 `read-only`，L3 仍 `danger-full-access`。
- `applySandboxMode` 现在按 `sandbox.modeByLevel` 读取所有等级，不再只对 L3 使用配置。
- 因此 L1/L2 只要授予 `image` 和额度即可生图，不再额外需要 `write` 能力来落盘。

## 0.33.1

- 修复群聊回复 @ 错人：群状态会复用最早创建时的 chat 对象，后续发言人只更新了新消息的
  `mention`，回复仍用旧对象。现在每轮开始时把 `state.chat` 切到当前消息的 chat。
- 群权限/额度仍按 `group:<群号>` 单主体计算。

## 0.33.0

- 群聊简化为单主体 `group:<群号>`：全群共用一份等级、能力集和生图额度池。
- 群消息仍带 `[QQ:<QQ号>]` 前缀，回复仍 @ 发送者，但权限/扣费不再按成员计算。
- 群主体默认 L0；管理员用 `/admin level|allow|quota group:<群号>` 配置。
- 私聊权限、额度、提示词和行为不变。

## 0.32.1

- 修复群聊生图额度扣错对象：群聊现在扣发送者 QQ 的额度，而不是群号。
- 群聊绘图仍共用一个会话/工作区，但额度、权限和回复 @ 都按发送者计算。
- 群成员生图默认额度为 0，需管理员 `/admin quota <QQ号> <Buzz>` 分配。

## 0.32.0

- 群聊不再要求 `/bind`：只要在群里 @机器人 即可使用，成员等级/能力仍按各自账号计算。
- 群消息会带 `[QQ:<QQ号>]` 前缀，群会话能区分不同成员。
- 新增 `qq:group` 提示词，仅群聊注入，说明共享群会话、无需 bind、按 QQ 号区分成员；私聊不注入。
- 群聊仍要求 @机器人；私聊行为不变。

- `/sessions` 不再只显示会话 id 哈希：优先用 `/new`/`/rename` 起的名字，其次用 DSH 生成的
  会话标题（`session/title` 事件），都没有才退回短 id。标题在轮次结束时缓存，
  老会话第一次 `/sessions` 时从会话日志前 200 个事件补读。`/use <标题>` 也能匹配，
  `/archived` 同样显示标题。
- `agent.turnTimeoutMs` 默认值从 5 分钟改成 **30 分钟**（1800000 ms）：生图、长任务不再
  5 分钟就被判超时中断。`agent.followUp.idleMs` 同步从 5 分钟改成 30 分钟，子代理跑完得晚
  也能自动投递。代价是卡死的一轮会占住该聊天的队列更久（`maxQueue` 仍为 3）。
- 修复“自动续跑轮”不投递：子代理完成、后台任务回报、提问作答触发的轮次不再经过
  桥接器的 `run()`，此前这些轮次的文字和图片会全部丢掉。现在会话安静后按事件区间补投，
  由 `agent.followUp.*` 控制（`enabled` / `pollMs` / `idleMs`）。
- 回复文本改为按事件区间提取（`replyTextSince`），续跑轮不会重发上一轮回复；
  下一条 QQ 消息到来时会先把待投递的续跑轮发完再开始新轮。
- 提示词明确：QQ 会话禁止派 subagent 生图（子会话的图回不到 QQ），
  该条覆盖 image-gen 手册里“主对话里派 subagent 生图”的建议。
- 修复 `present` 的图片从不转发：`deliverables/presented` 属于宿主记账事件，
  `snapshotEvents()` 不一定暴露，转发改读会话原始事件（`sessionEventsFrom`），
  读不到时回退到 `snapshotEvents()`。
- 新增诊断开关 `DSH_QQ_AGENT_LOG=1`（或 `restart-dsh.ps1 -AgentLog`），
  每次轮次结束把投递细节写到 `~/.dsh/logs/agent-ext.log`。
- 新增 `scripts/restart-dsh.ps1`：无需 GUI 重启 DSH（优雅关闭 → 拉起 → 轮询 OneBot 重连），
  日志写入 `~/.dsh/logs/restart-*.log`。
- 修复工作区归类丢失：DSH 用 `realpath(会话 cwd) === workspace.path` 判定归属，
  而工作区目录登记后变成 junction（本机 `E:\QQdsh\u-b577ae62\工作区对接QQ` →
  `E:\dsh\工作区对接QQ`）时记录里仍是旧路径，`attachSession` 抛错、会话被过滤出工作区。
  桥接器现在创建时统一取 `realpath`，并对旧记录做一次性迁移（重新登记到真实路径、
  搬走旧会话、删除旧登记）。
- 修复工作区列表归属：`/ws list` 等按“路径是否在用户目录下”过滤，工作区迁移到真实路径
  （junction 目标）后会从该 QQ 用户的列表里消失。新增 `ownsDir()`：除前缀匹配外，
  用户目录里的链接/junction 指向该目录也算自己的，10001 因此能继续管理
  `工作区对接QQ`。

## 0.31.0

- 新增 `/admin image-balance`：读取 Civitai `buzz.getBuzzAccount`，
  显示账户 blue / green / yellow / total Buzz，仅 L3 可用。
- 管理员额度命令与账户总额分离，普通 QQ 用户只看到已分配额度。

## 0.30.0

- image-gen 生成结果新增 `cost`（Civitai Buzz），并随 `meta` 返回。
- QQ Bridge 增加按用户分配的生图额度：`/admin quota <openid> <Buzz>`。
- 每次生图扣除成本；余额不足一次生成时允许生成并把余额归零。
- 生成后 QQ 回复“本次消耗 / 剩余额度”，不暴露 Civitai 账户总额。
- 额度为 0 时工具 guard 拦截生图。

## 0.29.0

- 图片按会话归档：生成/编辑结果额外落到
  `<workspace>/dsh-image-gen/sessions/<sessionId>/`，每个会话一套图。
- 保留 image-gen 原始 `savedTo` 供 `edit_image` 使用；QQ 转发使用归档路径。
- 归档优先硬链接，失败回退复制；归档失败不影响发图。

## 0.28.0

- 对接新版 dsh-image-gen：新增 `qq:generated-images`，识别
  `generate_image` / `generate_images` / `edit_image` 的 `meta.savedTo` 并自动发到 QQ，
  同时与 `present` 去重。
- `qq:visual-design` 改为生图前加载 `image-gen` skill，按 provider/model 方言编译 prompt；
  QQ 会话禁止派 subagent 生图，支持 seed / negative_prompt / loras / source_paths。
- `image` 能力放开 `skill` 工具，便于加载 image-gen 手册。

## 0.27.1

- 系统提示词统一收进 `src/agent-ext/prompts/`，文件名统一为 `*.prompt.js`。
- 提示词通过 `prompts/index.js` 统一导出，行为文件与提示词文件明确分开。
- `qq:visual-design` 增加无 `image` 权限时的约束，避免无权限会话尝试生图。

## 0.27.0

- 新增 `image` 能力：非 L3 用户可被授予 `generate_image` / `edit_image` /
  `present` / `read_image` 等工具权限。
- 新增 `qq:visual-design` 行为扩展：先讨论视觉锚点，在合适节点主动出图，
  生成后 present 到 QQ，迭代时用 `edit_image` 保持角色一致。
- 更新能力文档与白名单示例。

## 0.26.0

- agent 行为改成可扩展注册表：其他插件可通过 Cordis 服务
  `agentExtensions` 注册 `onSession` / `onTurnEnd`。
- QQ 的 prompt / policy / present 变成三个内置扩展，由 bridge 注册。
- `ChatAgentManager` 不再认识任何 QQ 行为，只调用 `sessionReady` / `turnEnd`。
- 新增 `docs/architecture.md` 的扩展 API 说明与 registry 测试。

## 0.25.0

- 架构重构：按 `core / access / transport / workspace / agent-ext / qq / runtime`
  分层，依赖方向固定。
- `agent-ext` 抽出 `present`、`prompt`、`policy`；`ChatAgentManager` 不再 import
  agent 行为，通过 `behavior` 注入。
- 新增 `qq/router.js`：sessionId ↔ chat 唯一索引，审批/提问/媒体不再回查 manager。
- `imagesOf` 下沉到 transport，transport 不再依赖 agent-ext。
- 新增 `docs/architecture.md`。

## 0.24.0

- 给每个 QQ agent 注入一条系统提示：用户要截图/发图/看效果时，必须先生成图片并
  调用 `present`；桥接器只转发 `present` 中的图片，文字里的路径不会发图。
- agent 不再需要靠猜 `present` 是否会发到 QQ。

## 0.23.2

- 「刷新二维码」改为强制扫码：重启 NapCat 时临时去掉 `-q`，确保生成新二维码，
  不再沿用快速登录而没有新码。
- 新增 `POST /qq-bridge/napcat/qr/refresh`。

## 0.23.1

- 修复登录二维码不更新：NapCat 启动前删除旧 `qrcode.png`，状态携带文件 mtime，
  页面用 mtime 作为缓存键并每 2 秒刷新图片。
- 未上线时增加「刷新二维码」按钮（重启 NapCat 生成新码）。

## 0.23.0

- 设置页错误改为显眼的红色错误横幅，可手动关闭；操作错误不再被 5 秒轮询清掉。
- 增加 QQ 在线/离线状态点（绿色/红色）和 NapCat 运行状态点。
- 网络错误提示改为「无法连接 QQ Bridge 服务」而不是裸 `Failed to fetch`。

## 0.22.0

- 默认模型路由改为 `deepseek-account`：直接使用 DSH Desktop 当前登录账号，
  部署时不再需要配置 API Key。
- 设置页在账号模式下隐藏 API Key 输入，只显示「模型：DSH 当前登录账号」。
- 需要 API Key 的部署仍可把 `agent.provider` 设为 `deepseek-official`。

## 0.21.0

- NapCat 部署改成路径输入栏：已有 NapCat 只需选择目录或粘贴路径，右侧提供
  「选择目录」和「下载」按钮。
- 路径持久化到 `~/.dsh/qq-bridge/settings.json`，重启后继续使用。
- 目录选择：Desktop 内用 Electron 原生目录对话框；CLI Host 回退到
  PowerShell / zenity / osascript。
- 下载仍安装到 `~/.dsh/qq-bridge/napcat`，不再强制覆盖已有路径。

## 0.20.0

- DSH Desktop 一键部署：设置页新增安装 NapCat、保存 API Key、设置管理员、
  启动/二维码，全部通过按钮完成，不再需要前台网页或命令行。
- NapCat 不再要求随包分发：默认下载官方 Shell 到 `~/.dsh/qq-bridge/napcat`；
  也支持本地 zip 或本地目录。
- 新增 `/qq-bridge/setup/*` 与 `/qq-bridge/bridge/status` 接口。
- NapCat 目录自动探测：配置目录、`vendor/napcat`、数据目录，以及解压后的子目录。

## 0.19.3

- 新增 `packages/qq-bridge-ui`：只含客户端 UI 的第三方组合包，可从 DSH Desktop
  的插件管理器安装，为 Desktop 添加「QQ Bridge」设置页。
- 该包不启动 Host/NapCat，按钮通过 `http://127.0.0.1:3080/qq-bridge/*` 控制
  qqweb 里的实例，避免第二个 bot 抢登录。
- `scripts/bundle.ps1` 带上 `packages/`。

## 0.19.2

- 客户端插件补上 Cordis `inject = ["slots"]`，修复 `dsh-qq-bridge: failed` /
  “1 entry did not activate”。

## 0.19.1

- 设置页请求改为 `credentials: omit`，避免 Desktop 的 file:// 页面在
  `Access-Control-Allow-Origin: *` 下被浏览器拒绝。

## 0.19.0

- DSH Desktop 设置页新增「QQ Bridge」分区：状态、启动、停止、重启、显示二维码。
- Host 暴露同源 `/qq-bridge/napcat/*` 控制接口；只操作插件管理的 NapCat。
- 客户端 bundle `lib/client.js` 使用 DSH 的 `__ModuleLoader__` 工厂，无需额外构建工具。
- `scripts/bundle.ps1` 现在会带上 `lib/`。

## 0.18.0

- 内置 NapCat：把 NapCat Shell 放进 `vendor/napcat`（git 忽略），由插件启动和守护。
- `napcat.enabled/autoStart/cwd/args/restart` 配置；`/napcat status|start|stop|restart|qr`。
- 通过 OneBot 客户端连接状态判断外部实例，不再把桥接器自己的 6700 监听误判成 NapCat。
- 支持 `args: ['-q','123456789']` 快速登录；首次仍扫码，`/napcat qr` 可重发二维码。
- 新增 `scripts/install-napcat.ps1`、`scripts/bundle.ps1`（源码 + vendor 打 zip）。

## 0.17.0

- 入站图片：QQ 消息里的图片下载到当前工作区 `attachments/incoming/`，消息追加
  `[图片已保存] 路径`，agent 可通过 `read_image` 或脚本处理。
- 支持 http(s) URL、`base64://`、本地 `file://`/路径三种来源，单图上限 20MB。
- 下载失败时消息追加 `[图片下载失败]`，不阻塞文字处理。
- 新增 L3 指令 `/sendimage <路径>`，发送工作区里的图片。
- 出站图片继续支持 `present` 自动转发和 `/screenshot`。

## 0.16.0

- 新增 QQ 问答桥：agent 的 `ask_user_question` 选项会转成文字发到对应 QQ，
  用户回复序号/选项文字/自定义文字即可继续。
- 多选支持 `1,3` 形式；只有提问发起者能回答。
- 新增 `questions.timeoutSec`，默认 1800 秒（30 分钟），`0` 表示不限时。
- 问答等待不消耗 token；超时以“用户超时未回复”的自定义答案返回给模型。

## 0.15.0

- agent 在回复中用 `present` 展示图片时，该轮结束后自动把图片发到对应 QQ 会话。
- 只转发 png/jpg/jpeg/gif/webp；其他文件仍只发文字说明。
- 解决“工作区里做好了 app/网页、agent 只发文字”的验收问题。
- 转发失败只记日志，不影响文字回复。

## 0.14.0

- 新增 L3 指令 `/screenshot`：抓取所有显示器，保存 JPEG 到当前工作区
  `attachments/qq/`，通过 OneBot `image` 段（base64）发回 QQ；群聊附带 @。
- 传输层新增 `sendImage`；FakeTransport 同步支持，便于测试。
- 截图使用 Python + Pillow（优先 DSH 自带 Python，可用 `DSH_QQ_PYTHON` 覆盖），
  避开 PowerShell 屏幕抓取被 AMSI 拦截的问题。

## 0.13.0

- 新增 `/ws delete <序号|名称>`：把工作区从 DSH 登记中移除。
- 只解除登记，不删除目录和会话历史；会话变为 ungrouped，目录仍在原路径。
- 删除当前工作区后会清空 active，下一条消息重新创建默认工作区。
- 修复 `workspaceRegistry.delete()` 参数：必须传 workspace id，不能传实体对象。

## 0.12.0

- 新增会话归档：`/archive [名称|序号]`、`/archived`、`/unarchive <名称|id>`。
- 归档会调用 DSH 的 `archiveSession`，并持久化在 `state.json` 的 `archived` 里；
  列表隐藏但日志保留，可恢复。
- 归档当前会话后会清空 active，下一条消息自动新建会话。
- 有回合在跑时拒绝归档。

## 0.11.0

- 会话支持可选名称：`/new test`、`/reset test`、`/rename 新名字`。
- `/sessions` 显示名称 + 会话 id 末段，当前会话带标记。
- `/use` 支持按名称切换会话。
- 名称持久化在 `state.json` 的 `labels` 里，重启后保留。

## 0.10.0

- 指令前缀支持多个符号，默认 `/`、`!`、`#`，避免 QQ 的 `/` 表情联想干扰。
- `commandPrefix` 接受字符串或数组；多字符前缀按最长匹配。
- 帮助与未知指令提示会显示实际使用的多个前缀。

## 0.9.0

- 非 L3 用户默认**仅聊天**：不能管理/切换工作区，也不能读写文件或执行命令。
- 新增能力白名单 `workspace` / `read` / `write` / `exec`，按账号授予。
- 管理员指令：`/admin allow`、`/admin deny`、`/admin perms`；也可用 `access.whitelist` 配置。
- 能力变更在用户下一条消息生效；guard 读取实时状态，等级提升/降级也即时生效。
- L1/L2 未获 `write`/`exec` 时沙箱为 `read-only`；获授后为 `workspace-write`；L3 仍为 `danger-full-access`。

## 0.8.0

- 修复：会话没有挂载 agent preset，导致只有 `working_directory`、无法写文件或执行命令。
- 新增 `agent.preset`（默认 `standard`），创建与恢复会话时挂载。
- 新增按等级的文件沙箱策略 `sandbox.modeByLevel`：L0 只读、L1/L2 工作区可写、L3 完全访问。
- 新增管理员指令 `/sandbox [模式]`，可查看或切换当前会话的文件策略。

## 0.7.0 — M6（进行中）

- 新增 GitHub Actions 双平台 CI（ubuntu / windows）。
- 新增 `scripts/ci.ps1`、`scripts/ci.sh`，本地可跑与 CI 相同的两步。
- 新增 Linux 部署文档与 systemd 单元。
- 新增发布前检查清单。

## 0.6.0 — M5

- 每个群一个专属工作区（`g-<hash>`），全群共享会话。
- 群聊必须 @机器人；回复自动 @ 发送者。
- 群指令限制：`/ws info` 可用，`/new` `/reset` 仅 L3。

## 0.5.0 — M4

- 四级权限（L0–L3）、`/bind` 配对码、每日轮次与工作区配额。
- L0 访客只读：guest 工作区 + 工具限制 + 审批拒绝。
- QQ 审批桥：`1` 允许 / `2` 拒绝，只认发起人，超时拒绝。
- 管理指令：`/admin users|invite|level|freeze|unfreeze|ws list`。

## 0.4.0 — M3

- 聊天状态持久化（工作区、会话、每工作区上次会话）。
- 重启后 `agents.resume()` 续聊，失败回退新会话。
- 指令层：`/help` `/whoami` `/status` `/ws ...` `/new` `/reset` `/sessions` `/use` `/stop`。

## 0.3.0 — M2

- QQ 私聊消息进入工作区会话，模型回复发回 QQ。
- 每聊天一个 agent 会话，消息排队串行。
- API key 从文本文件读取并导入 DSH 凭据存储。
- 修复：`followup` 必须带 `role` 与 `id`。

## 0.2.0 — M1

- OneBot 11 反向 WebSocket、token 校验、action 回包关联。
- 消息去重（内存 TTL）、断线重连、客户端断开时拒绝在途 action。
- 回显模式与假 NapCat 联调脚本。

## 0.1.0 — M0

- 插件骨架：bundle patch、配置校验、生命周期。
- 跨平台路径层（`E:\QQdsh` / `${DSH_HOME}/qq-workspaces`）。
- 四个宿主接缝自检：工作区、会话/agent、审批策略、工具限制。
