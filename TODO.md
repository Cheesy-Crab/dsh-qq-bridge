# TODO

按优先级记录尚未完成的事项。已完成项见 [CHANGELOG.md](CHANGELOG.md) 与 [PLAN.md](PLAN.md)。

## 权限现状（2026-10-22 确认）

| 等级 | 文件沙箱 | 审批行为 | 默认能力 |
|---|---|---|---|
| L0 访客 | `read-only` | `never` | 仅聊天 |
| L1 用户 | `read-only` | `never`（无工具） | 仅聊天；白名单可开 |
| L2 高级 | `read-only` | `never`（无工具） | 仅聊天；白名单可开 |
| L3 管理员 | `danger-full-access` | `ask`，L3 QQ 本人回 `1`/`2` | 全部 |

已确认的设计决定：

- **L3 以外仅聊天**，工作区、读写、执行都由管理员白名单逐项授予（`workspace` / `read` / `write` / `exec`）。
- 白名单可用 `/admin allow|deny` 或配置 `access.whitelist` 管理；变更在下一条消息生效。
- **不做自动审批**：L3 也不自动放行，保留人工闸门。
- **不做跨会话授权**：DSH 权限按“会话 + 每次工具调用”判定，另一个会话（哪怕全权限）无法把权限借给调用方。
- **L3 的“全权限”指沙箱边界最大**，不等于跳过审批。
- **`agent.preset: standard` 必须保留**：否则会话只剩 `working_directory`，连写文件都没有工具。

## 安全（低优先级）

- [ ] **OneBot 反向 WS token**：当前 NapCat 与插件都在 `127.0.0.1`，自环连接，暂不关键。
      跨机部署、或多用户共用一台机器之前必须补：NapCat 的 `websocketClients[].token` 与
      DSH 的 `QQ_ONEBOT_TOKEN` 填同一个值，然后重启两边（NapCat 重启可能需重新扫码）。

## 权限相关（暂不做）

- [ ] `approval.autoApproveLevels`：减少 L3 审批打扰；已决定暂不实现。
- [ ] 审批/运维代理会话：把越权请求转给专门的 ops 会话处理；需要新协议和审计，暂不做。

## 功能

- [x] 截屏发图：`/screenshot`（L3，全屏 JPEG，base64 发送）。
- [x] 入站图片：下载到工作区 `attachments/incoming`，路径交给 agent；视觉理解取决于模型。
- [ ] 出站任意文件：目前只支持图片（present 自动转发、`/sendimage`）；pdf/zip 还没有出口。
- [ ] 官方 QQ 机器人适配（需要开放平台 appid/secret 与公网回调域名）。
- [ ] 去重表持久化（现在重启后同一 `message_id` 会再次处理）。

## 运维

- [ ] Windows 开机自启（任务计划程序或 NSSM）；注意 NapCat 重启后可能仍要扫码。
- [ ] 清理早期测试留下的空工作区（如 `E:\QQdsh\u-e4431691`、`E:\QQdsh\g-fc82267b`）。
- [ ] 发布 GitHub Release / tarball（目前从仓库源码安装，无构建产物）。
