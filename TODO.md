# TODO

按优先级记录尚未完成的事项。已完成项见 [CHANGELOG.md](CHANGELOG.md) 与 [PLAN.md](PLAN.md)。

## 安全（低优先级）

- [ ] **OneBot 反向 WS token**：当前 NapCat 与插件都在 `127.0.0.1`，自环连接，暂不关键。
      跨机部署、或多用户共用一台机器之前必须补：NapCat 的 `websocketClients[].token` 与
      DSH 的 `QQ_ONEBOT_TOKEN` 填同一个值，然后重启两边（NapCat 重启可能需重新扫码）。

## 功能

- [ ] 官方 QQ 机器人适配（需要开放平台 appid/secret 与公网回调域名）。
- [ ] 图片/文件收发（当前 `deepseek-flash` 路由无视觉输入，等视觉模型或文件投递需求）。
- [ ] 去重表持久化（现在重启后同一 `message_id` 会再次处理）。

## 运维

- [ ] Windows 开机自启（任务计划程序或 NSSM）；注意 NapCat 重启后可能仍要扫码。
- [ ] 清理早期测试留下的空工作区（如 `E:\QQdsh\u-e4431691`、`E:\QQdsh\g-fc82267b`）。
- [ ] 发布 GitHub Release / tarball（目前从仓库源码安装，无构建产物）。
