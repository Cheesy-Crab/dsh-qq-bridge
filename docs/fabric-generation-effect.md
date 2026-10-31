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

0.54.0 在此基础上补齐了 per-session generation、adapter owner 和跨代拒绝，见 §8。

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

已存在（0.54.0）：

```text
per-session generationId（session.meta.generationId）
profile / capability 切换时 fork 新 generation
DeliveryCoordinator / InvocationLedger 显式拒绝 stale_generation
adapter owner（pluginId + activationId）
adapter create / release / cleanup-failed 记录
```

仍然不做：

```text
不把 generation 做成安全沙箱
不要求跨代恢复内存对象
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

## 8. 实现状态（0.54.0）

```text
[x] session state 记录 generationId
[x] profile/capability 切换时生成新 generation
[x] adapter 传入真实 pluginId / activationId
[x] stale generation 请求拒绝（stale_generation）
[x] cleanup-failed 记录 adapter 释放失败
```

语义：

```text
新 session            → 新 generation
同 session 同装配 resume → 复用
profile 变化          → fork（profile-switch）
capability 集变化      → fork（capability-switch）
未知 generation id    → 放行（进程重启后 registry 为空）
已知但已退休的 id      → 拒绝
```

待发布：

```text
platform-core v0.54.0 push + tag
profile 重新安装 platform-core
重启 DSH 后生效
```

QQ 适配器无需改代码：`host.forwardMediaOutputs` 自动带 owner，delivery 从
`session.meta.generationId` 取 generation。
