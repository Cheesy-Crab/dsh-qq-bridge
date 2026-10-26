# 安全说明

## 信任边界

- **DSH Desktop / Host**：本机受信任，能读取 `~/.dsh` 与工作区。
- **QQ 用户**：不受信任。所有权限都由 QQ Bridge 的等级、能力、额度和审批控制。
- **QQ 群**：一个群共享一个工作区、会话、权限和生图额度；群成员之间没有文件隔离。
- **L3**：拥有 `danger-full-access` 和全部工具，只应授予完全信任的管理员。

## 已实施的保护

- 非 L3 的工具由 `tools.guard` 拦截；`exec` 也只升到 `workspace-write`，不会获得主机全权限。
- 审批失败关闭；审批只接受发起人回复，超时拒绝。
- 工作区路径经过 `isPathInside` / `assertInside` 校验，防止目录穿越。
- `/qq-bridge` 控制接口：
  - 不返回 CORS 通配符；
  - 所有 POST 必须带 `x-qq-bridge-control: 1` 头，防止跨站表单直接修改管理员、API Key、NapCat 路径；
  - 仍只应在回环地址上暴露给本机 DSH 页面。
- API Key、Civitai Token 通过 DSH Credentials 读取，不写入日志，不回显给普通 QQ 用户。
- 图片归档限制在会话工作区内；`/sendimage` 只允许 L3。

## 已知风险

- 本机上的任意原生进程仍可访问回环 HTTP 接口；`x-qq-bridge-control` 只防浏览器跨站请求，不能防本机恶意程序。
- 群聊共享权限和额度，任何能 @机器人 的群成员都能使用该群的能力。
- L3 可执行主机命令、截图、读取工作区外文件；不应授予不可信用户。
- NapCat 和 QQNT 是第三方二进制，需自行确认其来源与许可。
- `napcat.accessTokenEnv` 未配置时，本机 OneBot WebSocket 不校验 token；生产环境建议设置 `QQ_ONEBOT_TOKEN` 并让 NapCat 使用同一 token。

## 报告问题

请通过 GitHub Issues 私下联系维护者，不要在公开 Issue 中粘贴 API Key、QQ Token、账号密码或完整日志。
