# Fabric Generation 与 Effect Ledger 设计

状态：基础版已实现；profile/capability generation 边界仍待接入。  
目标：把 Desktop 的 generation 边界和 Fabric 的 effect ownership 映射到我们的平台。

## 已实现（platform-core 0.48.0）

```text
platformGeneration
effectLedger
DeliveryCoordinator: generationId + effect records
InvocationLedger: generation-scoped keys
/platform/status: generation + effects stats
```

`platformGeneration` 在 platform-core apply 时生成：

```text
gen-<time>-<random>
```

效果记录包含：

```text
generationId
owner.pluginId
owner.activationId
effectId
effectKind
operation
state
resourceId
```

当前 owner 固定为 `platform-core`；插件级 owner 还需 adapter 传入。

## 1. 为什么需要 generation

当前问题：

```text
profile 切换
capability 切换
adapter 重载
```

如果只是在旧对象上改字段：

```text
旧 session handle 仍可能被引用
旧 tool 仍可能被调用
旧 delivery 仍可能发送
旧 service reference 仍可能被缓存
```

Fabric / Desktop 的做法是：

```text
generation 是生命周期边界
generation 内创建的对象不能跨代使用
```

## 2. 建议的 generation 模型

```text
process boot
  → generation: host-<id>

profile switch
  → generation: profile-<id>-<n>

capability set switch
  → generation: capability-<hash>-<n>

surface adapter reload
  → generation: adapter-<id>-<n>
```

最低要求：

- 每个 agent/session 记录 `generationId`
- `DeliveryCoordinator` 的 delivery key 带 `generationId`
- `InvocationLedger` 的 claim 带 `generationId`
- stale generation 的请求拒绝，不做静默重定向
- profile 切换创建新 session，不复用旧 handle
- adapter dispose 时释放本代资源

## 3. 当前状态

已存在：

```text
profile 切换会清 sessionId / handle
下一条消息重新 createSession
Delivery/Invocation ledger 按 session/turn 去重
```

缺少：

```text
显式 generationId
跨代引用校验
跨代 delivery / invocation 拒绝
adapter 释放记录
```

## 4. Effect Ledger 字段

在现有 Delivery/Invocation 之上增加 owner：

```json
{
  "ledgerVersion": "0.1.0",
  "generationId": "profile-image-3",
  "owner": {
    "pluginId": "dsh-image-gen",
    "activationId": "act-...",
    "runtimeId": "runtime-..."
  },
  "effectId": "output:sha256:...",
  "effectKind": "media.delivery",
  "operation": "create",
  "state": "delivered",
  "resourceId": "image-a89e3bd4.jpg",
  "correlationId": "turn-2",
  "sensitivityClass": "private"
}
```

`operation`：

```text
create
bind
replace
release
cleanup-failed
```

## 5. 和现有模块的映射

| Fabric | 我们的模块 |
|---|---|
| Runtime / generation | host / session / adapter |
| effect ledger | DeliveryCoordinator + InvocationLedger |
| pluginId | plugin registry 的包名 |
| activationId | 待补 |
| resourceId | outputId / invocation key |
| cleanup-failed | delivery failed / adapter dispose error |

## 6. 集成顺序

1. 生成 `generationId`，放进 session state。
2. ledger key 加 generation。
3. stale generation 拒绝。
4. 记录 adapter dispose 与 cleanup failure。
5. 在 `/platform/status` 暴露 generation 与 ledger 统计。
6. 再考虑 Fabric probe/export。

## 7. 不做

```text
不把 generation 做成安全沙箱
不要求跨代恢复内存对象
不把未实现的 Fabric 字段伪装成标准
```

## 8. 剩余实现

```text
session state 记录 generationId
profile/capability 切换时生成新 generation
adapter 传入真实 pluginId / activationId
stale generation 请求拒绝
cleanup-failed 记录 adapter 释放失败
```
