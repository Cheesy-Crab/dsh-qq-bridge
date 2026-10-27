# DSH 插件接口规范 v1.2（Manifest + Profile）

状态：草案  
适用范围：DSH 标准插件 + 平台 profile 扩展。

## 1. 两层格式

```json
{
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" },
    "platform": {
      "contract": "1.2",
      "capabilities": [],
      "profiles": []
    }
  }
}
```

- `dsh.bundle` / `dsh.client`：DSH 标准，不改。
- `dsh.platform`：我们的命名空间扩展。
- `dsh.platform.contract`：契约版本。
- `dsh.platform.capabilities`：能力动作。
- `dsh.platform.profiles`：会话 profile。

旧字段 `dsh.pluginApi` / `dsh.capabilities` 仍可读取，但新插件应写新格式。

## 2. 插件角色

插件不再只有一个 kind，而是多角色：

```json
{
  "roles": ["capability", "profile", "client", "bundle"]
}
```

| 角色 | 来源 |
|---|---|
| `capability` | `dsh.platform.capabilities` 非空 |
| `profile` | `dsh.platform.profiles` 非空 |
| `client` | `dsh.client` |
| `bundle` | `dsh.bundle` |
| `adapter` | `dsh.platform.adapter` |

一个插件可以同时是 profile + client + bundle，例如 liketavern。

## 3. Capability

能力是 agent 可调用的动作：

```json
{
  "id": "image.generate",
  "kind": "action",
  "effects": ["network", "cost"],
  "permissions": ["image"],
  "bind": { "tool": "generate_image" },
  "delivery": ["image"]
}
```

约束：

- 必须有输入/输出
- 结果必须使用 `meta.dsh`
- 权限与 effects 必须声明
- 媒体通过平台交付

## 4. Profile

profile 是会话形态，不是动作：

```json
{
  "id": "tavern",
  "kind": "roleplay",
  "agentPreset": "tavern",
  "surfaces": ["web", "qq"],
  "promptPolicy": {
    "platformPrompts": false,
    "ownsSystemPrompt": true
  },
  "toolPolicy": {
    "ownsTools": true,
    "capabilities": []
  }
}
```

约束：

- `id` 必须稳定
- `agentPreset` 必须能在 DSH 中解析
- profile 不直接发消息
- profile 不直接访问 QQ/NapCat
- profile 需要由 `ProfileProvider` 实现运行时行为

## 5. ProfileProvider

```js
{
  listProfiles(ctx),
  resolve(ctx, { sessionId, conversationKey }),
  bind(ctx, { sessionId, profileId }),
  unbind(ctx, { sessionId }),
  promptPolicy(ctx, profile),
  toolPolicy(ctx, profile),
}
```

平台只通过该接口选择和应用 profile。

## 6. 支持等级

```text
Level 1 可发现：manifest 声明
Level 2 可调用：handler / provider 存在
Level 3 可组合：host / session / surface 已接通
```

只有 Level 3 才叫“支持”。

## 7. 兼容

```text
读取 dsh.platform.*
回退 dsh.pluginApi / dsh.capabilities
```

迁移顺序：

1. 读取新旧两套
2. 新插件写新格式
3. 旧字段 deprecated
4. 主版本升级时移除

## 8. 兼容字段

DSH 标准：

```text
dsh.bundle
dsh.client
engines.dsh
peerDependencies
```

我们的扩展：

```text
dsh.platform.contract
dsh.platform.capabilities
dsh.platform.profiles
dsh.platform.adapter
```

不要把这些自定义字段放到 `dsh` 根上。
