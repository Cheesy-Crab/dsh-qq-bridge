# DSH 重启与会话连续性

## 已确认的机制

DSH Desktop 启动 Web 应用时传入：

```text
--port 0
```

这意味着：

```text
每次重启
→ 系统分配新端口
→ 启动 URL 的 host:port 变化
→ 浏览器会话 cookie 绑定 host+port
→ 旧标签页无法自动接回
```

启动 token 也是每个进程随机生成的，但真正导致旧页面失效的是 **端口变化 + authority-bound cookie**。

## 当前策略

```text
默认不自动重启
不在有活跃对话时重启
需要重启时由用户明确确认
```

已移除：

```text
计划任务 DSH-QQ-Bridge-Restart
```

不再使用“定时重启 + 等待重连”的方式。

## 需要重启时

```text
1. 先确认当前对话没有进行中的工具调用
2. 记录当前 DSH Web URL
3. 显式重启
4. 使用新 URL 打开
```

DSH 的会话历史仍在磁盘，但当前 turn 会被中断。

## 未来可选的稳定入口

桌面端固定端口不可配置，因此如果要彻底避免 URL 变化，需要：

```text
固定端口反向代理
  → 浏览器访问稳定 host:port
  → 代理转发到当前 DSH 端口
```

但需要同时配置：

```text
trustedHosts
反向代理 Host 保留
WebSocket upgrade
cookie Path/authority
```

在完成前，不以“自动重启”换取更新。

## 对开发流程的影响

```text
代码修改
  → 本地测试
  → 不自动重启 DSH

需要加载新 host 插件
  → 用户确认后重启一次
  → 告知新 URL
```

客户端插件可以走 HMR，但 host/core/adapter 变更需要重启。
