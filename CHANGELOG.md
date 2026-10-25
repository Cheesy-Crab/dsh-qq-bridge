# 变更记录

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
