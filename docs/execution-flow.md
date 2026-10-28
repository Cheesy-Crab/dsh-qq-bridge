# DSH QQ 执行流

对应图：

[docs/execution-flow-v0.55.png](execution-flow-v0.55.png)

## 1. 主链

```text
QQ 消息
  → dsh-qq-bridge
  → session-core
  → effective profile
  → active capabilities
  → tool exposure + guard
  → DSH agent request
  → model tool call
  → InvocationLedger
  → tool body
  → turnEnd / DeliveryCoordinator
  → QQ 回复
```

## 2. 节点说明

| # | 节点 | 负责 | 是否调用 DeepSeek |
|---|---|---|---|
| 1 | QQ 消息 | 私聊、群聊、@、图片 | 否 |
| 2 | dsh-qq-bridge | 去重、身份、权限、命令、图片保存 | 否 |
| 3 | session-core | 队列、state、workspace、session | 否 |
| 4 | effective profile | selected / predicted / 无 profile | 否 |
| 5 | active capabilities | profile.capabilities → active set | 否 |
| 6 | tool exposure + guard | restrict 隐藏工具，guard 拒绝 scope 工具 | 否 |
| 7 | DSH agent request | 组装 prompt + tools，调用模型 | **是** |
| 8 | model tool call | 模型返回 tool call | **是**（同一轮响应） |
| 9 | InvocationLedger | 同 session/turn/tool/args 去重 | 否 |
| 10 | tool body | image-gen、MCP、bash 等 | 否（图生图走图片 provider） |
| 11 | turnEnd / DeliveryCoordinator | 输出入账、去重、发送 | 否 |
| 12 | QQ 回复 | 文本、图片 | 否 |

## 3. DeepSeek 调用点

真正发生 DeepSeek 调用的只有：

```text
DSH agent request
```

也就是 DSH 的 agent loop。

一轮消息内可能是多次：

```text
用户消息
  → DeepSeek 请求 1
  → 模型返回 tool call
  → tool 执行
  → DeepSeek 请求 2（带 tool result）
  → 模型可能继续 tool call
  → ...
  → 最终文本
```

所以：

```text
一个 QQ turn
  = 1 到 N 次 DeepSeek 请求
```

N 取决于模型调用工具的轮数。

## 4. 不调用 DeepSeek 的节点

```text
bridge
session-core
profile 解析
predictor
capability 映射
tool exposure
InvocationLedger
DeliveryCoordinator
profile-state 统计
```

这些都是本地逻辑。

## 5. tool body 的模型边界

tool body 本身不调用 DeepSeek。

例如：

```text
generate_image
  → image-gen
  → Civitai / OpenAI 图片 provider
```

```text
enhance_prompt
  → Civitai prompt enhancement
```

```text
web_search
  → 搜索 provider
```

除非某个 tool 自己显式调用 DeepSeek，否则 tool 执行不属于 DeepSeek 调用点。

## 6. 额外可能调用 DeepSeek 的情况

```text
subagent
subagent_fork
workflow 内的 agent()
```

这些会产生额外的 agent loop，因此也是额外 DeepSeek 请求。

```text
compaction / title / summary
```

如果 DSH 当前配置触发了这些辅助 agent，也可能产生额外请求。

## 7. 当前 provider

当前 QQ bridge 配置：

```text
provider = deepseek-account
```

API key 文件：

```text
%USERPROFILE%\.dsh\deepseek-key.txt
```

模型请求由 DSH agent runtime 发出，不是 QQ bridge 直接发出。

## 8. 一句话

```text
bridge → session → profile → capabilities → tool exposure
  全部本地

DSH agent request → DeepSeek
tool body → 对应 provider
turnEnd / delivery → 本地
```
