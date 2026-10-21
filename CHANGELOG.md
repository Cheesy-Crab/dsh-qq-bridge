# 变更记录

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
