# TODO

按优先级记录尚未完成的事项。已完成项见 [CHANGELOG.md](CHANGELOG.md) 与 [PLAN.md](PLAN.md)。

## 权限现状（2026-10-22 确认）

| 等级 | 文件沙箱 | 审批行为 |
|---|---|---|
| L0 访客 | `read-only` | `never`，直接拒绝；另有写/执行工具掩码 |
| L1 用户 | `workspace-write`（会话 cwd 内可写） | `ask`，QQ 回 `1`/`2` |
| L2 高级 | `workspace-write` | `ask`，QQ 回 `1`/`2` |
| L3 管理员 | `danger-full-access` | `ask`，**由 L3 的 QQ 用户本人回 `1`/`2`** |

已确认的设计决定：

- **不做自动审批**：不加 `approval.autoApproveLevels`。L3 也不自动放行，保留人工闸门。
- **不做跨会话授权**：DSH 权限按“会话 + 每次工具调用”判定，另一个会话（哪怕全权限）无法把权限借给调用方。因此不需要在别人的工作区里新建“授权会话”。
- **L3 的“全权限”指沙箱边界最大**（可读写任意路径、可执行命令），不等于跳过审批。
- **`agent.preset: standard` 必须保留**：否则会话只剩 `working_directory`，连写文件都没有工具。
- 工具集、沙箱、模型已经到位；剩下的是机器环境（PATH、Node/Python 等）。

## 安全（低优先级）

- [ ] **OneBot 反向 WS token**：当前 NapCat 与插件都在 `127.0.0.1`，自环连接，暂不关键。
      跨机部署、或多用户共用一台机器之前必须补：NapCat 的 `websocketClients[].token` 与
      DSH 的 `QQ_ONEBOT_TOKEN` 填同一个值，然后重启两边（NapCat 重启可能需重新扫码）。

## 权限相关（暂不做）

- [ ] `approval.autoApproveLevels`：减少 L3 审批打扰；已决定暂不实现。
- [ ] 审批/运维代理会话：把越权请求转给专门的 ops 会话处理；需要新协议和审计，暂不做。

## 功能

- [ ] 官方 QQ 机器人适配（需要开放平台 appid/secret 与公网回调域名）。
- [ ] 图片/文件收发（当前 `deepseek-flash` 路由无视觉输入，等视觉模型或文件投递需求）。
- [ ] 去重表持久化（现在重启后同一 `message_id` 会再次处理）。

## 运维

- [ ] Windows 开机自启（任务计划程序或 NSSM）；注意 NapCat 重启后可能仍要扫码。
- [ ] 清理早期测试留下的空工作区（如 `E:\QQdsh\u-e4431691`、`E:\QQdsh\g-fc82267b`）。
- [ ] 发布 GitHub Release / tarball（目前从仓库源码安装，无构建产物）。
