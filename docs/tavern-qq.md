# Tavern Official Adapter

包位置：

```text
E:\dsh\dsh-tavern-qq
```

职责：

```text
注册 tavern profile
调用 liketavern 的 getSessionBinding / setSessionBinding
把 QQ/Web 的 profile 绑定映射到同一个 Tavern session
```

不包含：

```text
QQ transport
NapCat
QQ 权限
Tavern UI
```

## 使用

```text
/profile use tavern:<cardId>
```

已有绑定时：

```text
/profile use tavern
```

保留原角色卡。

## 前提

```text
1. 安装 dsh-liketavern（0.5.9，已安装到 desktop profile）
2. liketavern 提供 ctx.tavern（service 名 `tavern`）
3. platform-core 提供 conversationProfiles（0.54.0）
```

当前安装状态（2026-11-01）：

```text
dsh-liketavern  0.5.9   file:E:/dsh/dsh-liketavern-0.5.9.tgz
dsh-tavern-qq   0.1.0   link:E:/dsh/dsh-tavern-qq
bundles 顺序     ... @dsh/session-core → dsh-liketavern → dsh-tavern-qq → dsh-image-gen
```

未安装 Tavern 时，这个包只作为可安装适配器存在，不会注册 profile。

## 验证

`dsh-liketavern 0.5.9` 在 DSH `0.2.1-rc.2` 的独立临时 profile 中冷启动通过：
客户端 bundle 里出现 `dsh-liketavern/client.js`，宿主侧创建了
`<DSH_HOME>/dsh-tavern/{characters,library,personas,regex,sessions}`。

桌面端重启后检查：

```text
1. Web UI 出现 Tavern / 酒馆入口，能新建角色卡与预设
2. GET /qq-bridge/profile/status 的 profiles 里出现 tavern
3. QQ 私聊 /profile use tavern:<cardId>，下一条消息进入 Tavern 会话
```

`dsh-tavern-qq` 的测试：`cd E:\dsh\dsh-tavern-qq && node --test`（2/2 通过）。
