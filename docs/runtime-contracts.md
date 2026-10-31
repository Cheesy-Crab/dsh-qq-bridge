# 运行时契约：DeliveryCoordinator 与 InvocationLedger

## DeliveryCoordinator

所有发送必须经过它：

```text
平台自动交付
agent send tool
MCP send tool
管理端补发
        ↓
DeliveryCoordinator
        ↓
adapter.send
```

接口：

```js
deliver({
  sessionId,
  turnId,
  surface,
  target,
  output,
  send,
  generationId,   // 可选：per-session generation
  owner,          // 可选：{ pluginId, activationId }，写入 effect ledger
})
```

键：

```text
generationId + sessionId + turnId + surface + outputId
```

`generationId` 缺省时退回进程 generation；已退休的 id 返回
`{ skipped: 'stale_generation' }`，不发送。

状态：

```text
pending
delivered
failed
```

规则：

- 第一次 claim 成功才调用 `send`。
- 并发同键共享一个发送。
- 成功 commit。
- 失败 release，允许重试。
- 重复调用返回 `already_delivered`，不再发送。

## InvocationLedger

工具调用幂等层：

```js
claim({
  sessionId,
  turnId,
  tool,
  args,
  capabilityId,
  exclusive,
  generationId,   // 可选：per-session generation
})
```

键：

```text
generationId + sessionId + turnId + tool + sha256(normalizedArgs)
```

已退休的 generation 返回 `{ ok: false, reason: 'stale_generation' }`。

规则：

- 同参数已完成：返回缓存结果。
- 同参数进行中：single-flight 共享。
- `regenerate: true`：跳过参数去重。
- `exclusive`：同 capability 同 turn 只允许一次成功。
- 失败 release，允许重试。

## tool execution

platform 注册：

```text
ctx.on("tools/execute", handler)
```

对 managed tool：

```text
sessionId = agent.session.header.id
turnId = tool/call event.data.turn
tool = exec.name
args = exec.arguments
```

claim → next() → complete / fail。

效果：

```text
同 session/turn/tool/args 只执行一次
并发重复加入 in-flight
失败释放 claim
```

## bridge → session-core

```js
chat.handle(message, {
  level,          // 访问等级 L0-L3
  accessGrants,   // 访问授权 image/read/write/exec，不是 profile capabilities
  requester,      // 本条消息发送者
  principal,      // 群权限归属
})
```

落盘字段：

```text
state.level
state.accessGrants
state.requester
state.principal
```

边界：

```text
bridge 不选择 profile
bridge 不计算 capability bindings
bridge 不决定 tool exposure
```

## 边界

```text
DeliveryCoordinator 防止重复发送
InvocationLedger   防止重复执行
capability mutex   防止同能力多 provider
profile policy     防止错误 prompt/tool 面
generation         防止跨装配重放（stale_generation）
```

五者不能互相替代。

## adapter owner

`AdapterHost.mount()` 为每个 adapter 生成：

```text
{ pluginId, activationId }
```

mount 记录 `create`，dispose 记录 `release`；`stop()` 抛错记录
`cleanup-failed`（`errorCode: adapter-stop-failed`）。delivery 的 effect
记录使用同一 owner。





