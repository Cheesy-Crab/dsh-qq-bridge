# Profile State

profile 现在可以有独立于 chat/session 的持久状态。

## 位置

```text
$DSH_HOME/platform/profiles/<profileId>.json
```

默认：

```text
C:\Users\<用户名>\.dsh\platform\profiles\image.json
```

## 结构

```json
{
  "schemaVersion": 1,
  "profileId": "image",
  "createdAt": "...",
  "updatedAt": "...",
  "tools": {
    "generate_image": {
      "calls": 3,
      "successes": 3,
      "failures": 0,
      "unknown": 0,
      "totalDurationMs": 0,
      "lastUsedAt": "...",
      "capabilityId": "image.generate"
    }
  },
  "capabilities": {
    "image.generate": { "calls": 3, "successes": 3, "failures": 0 }
  },
  "sessions": {
    "sess-qq-...": {
      "calls": 3,
      "successes": 3,
      "failures": 0,
      "chatKey": "private:<QQ号>",
      "lastUsedAt": "..."
    }
  },
  "totals": {
    "toolCalls": 3,
    "successes": 3,
    "failures": 0,
    "turns": 1
  }
}
```

不保存：

```text
prompt
消息正文
工具参数
工具结果正文
本地文件路径
```

## API

```js
ctx.profileState.load(profileId)
ctx.profileState.snapshot(profileId)
ctx.profileState.recordToolUse({ profileId, tool, capabilityId, outcome, sessionId, chatKey })
ctx.profileState.recordTurn({ profileId, tools, sessionId, chatKey })
ctx.profileState.stats()
```

`recordTurn` 在 `platform:profile-state` 扩展的 `onTurnEnd` 调用。

## 统计来源

```text
sessionEventsFrom(session, fromSeq)
  → tool/call
  → tool/result
  → collectToolUsage()
  → toolCapabilityMap()
```

只记录：

```text
tool 名
capability id
success / failure / unknown
session id
chat key
turn count
```

## Scope

```text
profile 级：跨 session 聚合
session 级：每个 session 的调用数
```

当前 chat 不单独存工具总数；chatKey 只作为 session 维度字段。

## 注意

```text
统计是 usage，不是计费账单
token / cost 需要从 LLM usage 另行归集
工具失败判断依赖 tool/result 的 isError / error / 文本前缀
```

## 入口

```text
GET /qq-bridge/profile/state
GET /qq-bridge/profile/state?id=image
```

## 后续

- token/cost 归集
- 按 chat 聚合
- 清理策略 / 保留期

## 验证状态（2026-11-01）

`image` 的 profile 文件存在，但 `tools` / `capabilities` 为空：重启后还没有产生新的工具调用，
历史调用不回灌。跑一轮生图后再查同一路由，能看到对应条目——这就是“重启后实际统计”的核对方法。

