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
1. 安装 dsh-liketavern
2. liketavern 提供 ctx.tavern
3. platform-core 提供 conversationProfiles
```

未安装 Tavern 时，这个包只作为可安装适配器存在，不会注册 profile。
