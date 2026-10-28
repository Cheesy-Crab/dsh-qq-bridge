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
})
```

键：

```text
sessionId + turnId + surface + outputId
```

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
})
```

键：

```text
sessionId + turnId + tool + sha256(normalizedArgs)
```

规则：

- 同参数已完成：返回缓存结果。
- 同参数进行中：single-flight 共享。
- `regenerate: true`：跳过参数去重。
- `exclusive`：同 capability 同 turn 只允许一次成功。
- 失败 release，允许重试。

## bridge → session-core

```js
chat.handle(message, {
  level,          // 访问等级 L0-L3
  accessGrants,   // 访问授权 image/read/write/exec，不是 profile capabilities
  imageQuota,     // Buzz 计费快照
  requester,      // 本条消息发送者
  principal,      // 额度/群权限归属
})
```

落盘字段：

```text
state.level
state.accessGrants
state.imageQuota
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
```

四者不能互相替代。

