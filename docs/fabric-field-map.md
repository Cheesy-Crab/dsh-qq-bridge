# dsh.platform ↔ Fabric 字段对照

状态：兼容层设计，不宣称 Fabric 一致性。

Fabric 当前是 Draft；本表用于描述“如何映射”，不是标准采纳声明。

## Manifest

| Fabric 字段 | 我们的字段 | 映射 | 备注 |
|---|---|---|---|
| `$schema` | 无 | 无 | Fabric schema 未定稿，不伪造 |
| `manifestVersion` | `dsh.platform.contract` | 部分 | 版本语义不同 |
| `id` | `package.json.name` | 直接 | 包名 |
| `name` | `package.json.name` | 直接 | 展示名后续扩展 |
| `version` | `package.json.version` | 直接 | SemVer |
| `apiVersion` | `dsh.platform.contract` | 部分 | Fabric API 与平台 contract 不是同一版本轴 |
| `entrypoints.host` | `package.json.main` | 直接 | 仅宿主入口 |
| `capabilities.required` | `dsh.platform.requires.required` | 直接 | v0 兼容字段 |
| `capabilities.optional` | `dsh.platform.requires.optional` | 直接 | 缺失时 degraded |
| `subscriptions` | 无 | 未映射 | DSH 用 Cordis event |
| `contributes.commands` | 无 | 空 | 不伪造 |
| `contributes` 其他 | `capabilities` / `profiles` | 部分 | 放在 `x-dsh`，不冒充标准 contribution |

## Host Descriptor

| Fabric 字段 | 我们的字段 | 状态 |
|---|---|---|
| `descriptorVersion` | `0.1.0` | 已实现 |
| `id` | `dsh.platform-core` | 已实现 |
| `version` | `0.1.0` | 已实现 |
| `contract` | `1.2` | 扩展字段 |
| `execution.environment` | `node` | 已实现 |
| `execution.trustMode` | `trusted-in-process` | 已实现，不声称沙箱 |
| `capabilities` | `dsh.platform.*` | 已实现 |
| `surfaces` | `qq` / `web` | 扩展 |
| `profiles` | `true` | 扩展 |

## Capability 协商

```text
required 缺失 / 版本不满足 → incompatible
optional 缺失 / 版本不满足 → degraded
全部满足                    → compatible
```

实现：

```text
src/fabric.js
  createHostDescriptor()
  negotiateCapabilities()
  satisfiesVersion()
  toFabricManifest()
  fabricCompatibility()
```

## Lifecycle / Effect

| Fabric 概念 | 我们的现状 | 决定 |
|---|---|---|
| activation instance | session / agent | 部分 |
| generation id | 无显式 id | 待补 |
| effect ledger owner | outputId / invocation key | 待补 pluginId/activationId |
| cleanup failed | delivery failed 状态 | 部分 |
| provenance | 日志 | 待补 |

## 结论

当前采用：

```text
兼容 adapter
```

不是：

```text
切换到 dsh-plugin.json
```

原因：

```text
Fabric 仍是 Draft
没有正式 schema / SDK / runtime
我们的 dsh.platform 已在运行
```

下一步：

```text
Host Descriptor v0 已实现
required/optional 协商已实现
generation id / effect ownership 待实现
```
