# 下一阶段 TODO（可执行版）

状态基线：2026-10-28 23:45  
当前版本：

```text
@dsh/platform-core  0.53.0
@dsh/session-core   0.52.7
dsh-qq-bridge       0.55.2
dsh-tavern-qq       0.1.0
```

> 当前运行进程加载 platform 0.48.2 + QQ 0.53.2；0.53.0 / 0.52.7 / 0.55.2 已安装，待重启。  
> image profile 已注册；generation/effect 已生效。

## 执行状态

P0 全部完成：

```text
P0-1 DeliveryCoordinator / DeliveryLedger
P0-2 InvocationLedger
P0-3 profile promptPolicy / toolPolicy
P0-4 /profile use 会话重建
P0-5 子 agent 过滤
```

P1 全部完成：

```text
P1-1 platform:capabilities prompt
P1-2 ProfileProvider
P1-3 contract 校验
P1-4 命令扩展缝
```

P2 已完成：

```text
P2-1 DSH inventory 快照（启动时读取，动态变化仍由重启/HMR 处理）
P2-2 CI / BOM / JSON
P2-3 /platform/status、/session/status、/profile/status
P2-4 dsh-tavern-qq 包与 provider 测试
P2-5 文档清理
```

P2 剩余安装项：

```text
dsh-tavern-qq 尚未安装到含 Tavern 的 profile
原因是当前环境没有安装 dsh-liketavern
```

## 执行规则

1. 按 P0 → P1 → P2 顺序执行。
2. 每个任务必须有测试；测试不过不进入下一任务。
3. 不把“prompt 写了”当作完成，必须有代码约束或运行时校验。
4. 不改 capability 的核心语义（effects/permissions/delivery/retry/recovery）。
5. 不新增 PowerShell 写 JSON；统一用 Node `JSON.stringify`，禁止 BOM。
6. 每次发布前检查 `package.json` 无 BOM。
7. QQ 默认保持离线；需要上线验证时单独确认。
8. 不把 12k 行 bridge 式实现塞回 adapter。

---

# P0：正确性

## P0-1 DeliveryCoordinator

目标：所有发送只有一个出口。

新增：

```text
packages/platform-core/src/delivery-coordinator.js
```

导出：

```js
export class DeliveryCoordinator {
  deliver({ sessionId, turnId, surface, target, output, send })
  status({ sessionId, turnId, surface, outputId })
}
```

规则：

- key = `sessionId + turnId + surface + outputId`
- `outputId` 优先 `output.id`
- 没有 id 时用 `sha256(path + size + mtime)`
- `claim` 成功才发送
- 发送成功 `commit`
- 发送失败 `release`
- 重复 deliver 返回 `{ skipped: 'already_delivered' }`

集成：

- `forwardMediaOutputs` 接受可选 `deliveryCoordinator`
- 平台自动交付走 coordinator
- 后续 `send_image` tool 走同一个 coordinator
- adapter 不再被 tool 直接调用

验收：

- 同 output 调两次 deliver，只 send 一次
- 第一次 send 失败后 release，第二次可重试
- 自动交付和手动 send 共用一个 coordinator 时只发一次

测试：

```text
packages/platform-core/test/delivery-coordinator.test.js
```

---

## P0-2 InvocationLedger

目标：同 tool 同参数不重复执行。

新增：

```text
packages/platform-core/src/invocation-ledger.js
```

导出：

```js
export class InvocationLedger {
  claim({ sessionId, turnId, tool, args, capabilityId, exclusive })
  complete(key, result)
  fail(key, error)
  status(key)
}
```

规则：

- key = `sessionId + turnId + tool + sha256(normalizedArgs)`
- `exclusive` 时再加 `capabilityId` 锁
- 并发同 key 使用 single-flight
- 成功缓存结果
- 显式 `regenerate: true` 跳过参数去重
- 只对 `effects` 含 `write/network/cost/external_effect` 的 tool 自动启用

验收：

- 同参数两次调用只执行一次
- 并发两次只执行一次
- `regenerate: true` 允许第二次
- 同 capability 不同 tool 在 exclusive 下拒绝第二次

测试：

```text
packages/platform-core/test/invocation-ledger.test.js
```

---

## P0-3 profile promptPolicy / toolPolicy 生效

目标：profile 声明的策略真正影响 agent。

修改：

```text
packages/platform-core/src/index.js
packages/platform-core/src/profiles.js
packages/session-core/src/manager.js
```

规则：

- profile 解析顺序：
  1. `agent.__platformProfile`
  2. `agent.session.meta.agentPreset` 匹配 profile
  3. 默认 profile
- `promptPolicy.platformPrompts === false` 时：
  - 不注入 `platform:creative`
  - 不注入 `platform:tool-failures`
- `promptPolicy.capabilities === 'none'` 时：
  - 不注入 capabilities prompt
- `toolPolicy.ownsTools === true` 时：
  - 不自动注入平台 capability 工具
- session-core 创建 agent 后设置 `agent.__platformProfile = profile`

验收：

- Tavern profile 不出现 `platform:creative`
- 默认 profile 仍然出现
- 有 `ownsTools` 时不会重复注入平台能力说明

测试：

```text
packages/platform-core/test/profile-policy.test.js
packages/session-core/test/profile-policy.test.js
```

---

## P0-4 `/profile use` 真正切换会话

目标：切 profile 后，下一条消息使用新 agent preset。

修改：

```text
packages/session-core/src/manager.js
packages/qq-bridge/src/qq/commands.js
```

规则：

- `setProfile(chat, profile)`：
  - 保存 `profileOverride`
  - 保存 `profileId`
  - 清空 `state.sessionId`
  - 清空 `state.handle`
  - 保留 workspace
- 下一条消息重新 `createSession`
- `/profile use` 返回：
  - `已切换 profile：<id>；下一条消息使用新 profile。`

验收：

- 当前会话已存在时切 profile，下一条消息触发新 session
- 旧 session 不再被复用
- workspace 不变

测试：

```text
packages/session-core/test/profile-switch.test.js
```

---

## P0-5 过滤子 agent

目标：平台 prompt 只注入主 agent。

修改：

```text
packages/platform-core/src/index.js
```

规则：

- 跳过有父 agent 的 agent
- 跳过 `source` 为子代理/压缩/工具 agent 的 agent
- 只对用户会话主 agent 注入

验收：

- 主 agent 注入
- 子 agent 不注入
- 压缩 agent 不注入

测试：

```text
packages/platform-core/test/agent-filter.test.js
```

---

# P1：能力提示与 ProfileProvider

## P1-1 系统级 capabilities prompt

新增：

```text
packages/platform-core/src/prompts/capabilities.prompt.js
```

导出：

```js
buildCapabilityBrief(capabilities, { max = 20 })
installCapabilityPrompt(agent, state, brief)
```

规则：

- 默认 `capabilitiesMode = 'index'`
- `index`：一行一个能力
- `full`：能力 + tool + delivery
- `none`：不注入
- 过滤 `platform.core` / `session.core`
- 只列当前 registry 中存在的 capability
- 最多 20 条，超出按 kind 分组
- section 名固定 `platform:capabilities`
- 幂等：同一 agent 只注入一次
- 缓存键：
  - `snapshotRevision`
  - `profileId`
  - `surface`
  - `permissionSet`
- 插件/工具不变时不重新生成
- 新 agent 仍然注入缓存 brief

验收：

- 默认注入一次
- 同 agent 不重复追加
- Tavern profile 不注入
- 超过 20 条时分组摘要
- 不可用能力不出现

测试：

```text
packages/platform-core/test/capabilities-prompt.test.js
```

---

## P1-2 ProfileProvider

目标：not just descriptor，能真正 bind。

修改：

```text
packages/platform-core/src/profiles.js
packages/platform-core/src/index.js
packages/session-core/src/manager.js
```

规则：

- `ProfileRegistry.register(provider)`
- provider 接口：
  - `id`
  - `listProfiles()`
  - `resolve({ sessionId, conversationKey })`
  - `bind({ sessionId, profileId })`
  - `unbind({ sessionId })`
  - `promptPolicy(profile)`
  - `toolPolicy(profile)`
- descriptor 仍用于 manifest
- runtime provider 用于 bind/resolve
- 没有 provider 时只允许静态 profile

验收：

- fake provider 可以 list/bind/resolve
- bind 后 session-core 使用新 profile
- unbind 恢复默认
- 缺 provider 时返回明确 status

测试：

```text
packages/platform-core/test/profile-provider.test.js
```

---

## P1-3 contract 校验

修改：

```text
packages/platform-core/src/manifest.js
packages/platform-core/src/registry.js
```

规则：

- `contract` 缺失：按 1.0 legacy 处理，警告
- `1.x`：接受
- `2.x`：拒绝
- `profiles[].agentPreset` 必须非空
- `capabilities[].id` 必须唯一
- profile id 必须唯一

验收：

- 2.x 被拒绝
- 空 agentPreset 被拒绝
- 重复 id 被拒绝
- 1.0 仍可加载

测试：

```text
packages/platform-core/test/contract-validation.test.js
```

---

## P1-4 命令扩展缝

修改：

```text
packages/qq-bridge/src/qq/commands.js
packages/qq-bridge/src/qq/bridge.js
packages/platform-core/src/adapter-host.js
```

规则：

- host 增加 `commands` 注册接口
- 或 QQ adapter 暴露 `qqCommands` 服务
- 插件可以注册：
  - 命令名
  - usage
  - handler
  - minLevel
- `/profile` 保留为 builtin，但不再写死插件专属命令

验收：

- 测试插件注册 `demo` 命令成功
- 权限不足被拒绝
- 卸载插件后命令消失

---

# P2：工程与集成

## P2-1 消费 DSH inventory

- [x] platform-core 不再自己扫 `node_modules`
- [x] 改为读取 DSH plugin manager inventory
- [x] 保留 `extraDirs` 兼容测试
- [x] inventory 过滤已禁用/失败的插件（启动快照；host 变化仍由重启/HMR 处理）

## P2-2 CI

- [x] JSON parse 检查
- [x] BOM 检查
- [x] manifest schema 检查
- [x] platform-core CI
- [x] session-core CI
- [x] QQ CI 保持 ubuntu/windows

## P2-3 健康状态

- [x] `/platform/status`
- [x] `/session/status`
- [x] `/profile/status`
- [x] 输出 plugin count / capability count / profile count / revision

## P2-4 Tavern 官方适配

- [x] 新增 `dsh-tavern-qq` 包
- [x] provider / bind / unbind 测试
- [x] `/profile use tavern:<cardId>`
- [ ] 安装到含 Tavern 的 profile（Tavern 未安装）

新增：

```text
dsh-tavern-qq
```

规则：

- 不修改 liketavern 上游
- 不出现 QQ 逻辑在 liketavern 内
- 调用 `ctx.get('tavern')`
- 注册 profile `tavern`
- 调：
  - `listCharacters`
  - `listPresets`
  - `getSessionBinding`
  - `setSessionBinding`
- `profile.promptPolicy.platformPrompts = false`
- `profile.toolPolicy.ownsTools = true`

验收：

- Web 原生 Tavern 正常
- QQ `/profile use tavern` 可用
- 不污染平台 prompt
- 不重复发送

## P2-5 文档清理

- [x] v1.1 标记 deprecated
- [x] v1.2 作为主文档
- [x] 更新架构图
- [x] 更新 README 安装版本
- [x] 记录 DeliveryCoordinator / InvocationLedger 契约

---

# 发布检查清单

每个阶段发布前：

- [x] `node --test` 全部通过
- [x] `package.json` 无 BOM
- [x] `dsh.platform.contract` 存在
- [x] 旧字段兼容测试通过
- [x] profile 切换测试通过
- [x] 自动交付去重测试通过
- [x] DSH 启动无 404
- [x] QQ 离线，不触发登录

---

# 后续：参考 DSH Desktop / Fabric

详见 [dsh-desktop-reference.md](dsh-desktop-reference.md)、[fabric-field-map.md](fabric-field-map.md) 和 [fabric-generation-effect.md](fabric-generation-effect.md)。

- [x] 读 Fabric RFC 0001–0004
- [x] 对比 `dsh.platform` 与 Fabric manifest
- [x] 设计 Host Descriptor v0
- [x] 设计 required / optional capability
- [x] 设计 generation id 与 effect ownership（基础版已实现）
- [x] 评估 Fabric 兼容 adapter，不立即切换标准

已实现：

```text
platform-core/src/fabric.js
platformStatus.host
platformHostDescriptor
fabricCompatibility
```

待补：

```text
profile/capability 切换时的新 generation
adapter 的 pluginId / activationId
image-gen capability 映射
Fabric 兼容状态展示
```

# 暂缓：capability → tool exposure

- [x] 验证 `ctx.tools.restrict` 的真实签名
- [x] 确认 image-gen 工具可被 restrict 隐藏
- [x] profile.capabilities → activeToolSet（helper + image profile 已实现）
- [x] 为 image-gen 增加内置 capabilityBindings
- [x] 用 contextBreakdown.toolsTokens 做前后对比（11,588 → 8,260）
- [x] 接入 sessionReady，保留 base tools
- [x] QQ 里实际执行 `/profile use image`

# 明确不做

- [ ] 不把 capability 暴露成可调用工具
- [ ] 不靠 prompt 保证幂等
- [ ] 不让 tool 直接拿 OneBot token
- [ ] 不把 QQ 逻辑写进 liketavern
- [ ] 不 fork liketavern
- [ ] 不一次性删除旧 manifest 字段
- [ ] 不为了“统一”重写 DSH agent loop











## Profile State

- [x] ProfileStateStore
- [x] tool usage collector
- [x] onTurnEnd 持久化
- [x] /profile/state 路由（0.54.0）
- [ ] 重启后实际统计









# 暂缓：hot count 动态 capabilities

- [ ] 定义 hot count：按 capability 的调用次数 + 衰减 + 成功率
- [ ] 统计归属：user / chat / session，不放在 profile 共享字段
- [ ] 默认策略：hot count 只影响下一次 session 的 active capabilities
- [ ] 会话内动态：turn 边界重算，不在 tool call 中途切换
- [ ] 保存 tool exposure disposer，切换前 dispose 旧 restriction
- [ ] 加迟滞阈值，避免 tools 抖动
- [ ] 需要时再考虑 capability family 一起激活






# 待做：显式 profile 也需要能力预测

- [ ] selected profile 只锁定 profile / agentPreset / family 边界
- [ ] capabilities 仍然由 user stats 预测
- [ ] selected profile 默认展开 family
- [ ] 取消 `source === "predicted"` 才展开 family 的分支
- [ ] 评估显式 image profile 的工具数从 33 回到接近 40 的 token 成本
- [ ] 如果用户要省 token，应显式选择更窄的 capability 子集，而不是禁止预测
