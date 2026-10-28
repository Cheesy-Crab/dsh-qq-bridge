# Profile → Capabilities → Tool 问题清单

状态：待逐项处理  
范围：`session-core` 的 profile 解析、platform 的 effective profile、capability bindings、tool exposure。

每节只描述一个问题，按优先级排列。

---

## P0-1. restrict 失败静默

### 现象

```js
try {
  return agent.ctx.tools.restrict({ deny })
} catch {
  return undefined
}
```

### 风险

```text
known tools 拿不到
deny 含未知工具
context 不是 scoped
```

都可能失败，但没有任何日志。

结果：

```text
看起来做了 tool exposure
实际全量工具可用
```

### 修复

```text
known 不可用时不要猜 deny，直接返回并记录
catch 里记录 profileId / agentPreset / deny / error
```

---

## P0-2. capability id 未校验

### 现象

```js
const active = new Set(profile.capabilities)
```

### 风险

拼错：

```text
image.genrate
```

会导致：

```text
active 集合不包含任何真实 capability
所有 managed tools 都被 deny
```

用户看到工具消失，但没有错误。

### 修复

```text
unknown capability → warning
从 active 中剔除
如果 active 为空，fallback 到 default
```

---

## P0-3. predictor 返回值未校验

### 现象

```js
const predicted = predictor?.predict?.(...)
```

### 风险

predictor 可返回：

```text
不存在的 profile
agentPreset 和当前 agent 不一致的 profile
capabilities 非法的 profile
```

platform 会直接接受。

### 修复

```text
predicted 必须能在 ProfileRegistry 里找到
predicted.agentPreset 必须等于 session.meta.agentPreset
capabilities 必须经过 P0-2 的校验
不满足则 fallback default
```

---

## P0-4. 默认 profile 未记录到 session

### 现象

只有用户选择会写：

```text
session.meta.profileId
```

预测结果只写：

```text
agent.__platformProfile
```

### 风险

进程重启、session 恢复后：

```text
meta.profileId 不存在
→ predictor 重新预测
→ 可能得到不同 profile
```

同一个 session 前后工具面变化。

### 修复

在 session meta 记录：

```text
effectiveProfileId
effectiveProfileSource
```

但不要写 `state.profileId`。

`profileId` 仍然只表示用户选择。

---

## P1-1. capability binding 冲突 first-wins

### 现象

```js
if (!map.has(capability.id)) map.set(capability.id, tool)
```

### 当前顺序

```text
legacy image bindings
→ plugin capabilities
→ config bindings
```

### 风险

插件声明会被内置 legacy 覆盖。

### 修复

```text
插件 manifest > config > legacy
冲突时 warning
```

---

## P1-2. capability prompt 会宣传未安装工具

### 现象

`managedCapabilities` 永远包含 legacy image bindings。

### 风险

即使没有安装 image-gen，prompt 仍可能列出：

```text
image.generate
```

agent 会尝试调用不存在的 tool。

### 修复

生成 capability brief 前按：

```text
known tools
capability availability
```

过滤。

---

## P1-3. capability family 太窄

### 现象

image profile 只激活：

```text
image.generate
```

### 风险

用户下一轮说：

```text
改一下这张图
```

`edit_image` 不在工具表。

这是预测失败，不是工具错误。

### 修复

预测命中 image family 时，默认激活：

```text
image.generate
image.edit
```

或整个 image family。

---

## P1-4. predictor 尚未接统计

### 现象

```text
profilePredictor 服务不存在
→ profileSource = default
```

### 状态

第一个问题只完成“单点解析”。

### 后续

```text
UserCapabilityStats
  → predictor
  → agent/created
  → capability profile
```

---

## P2-1. 没有预测记录

### 现象

没有持久化：

```text
预测结果
预测失败原因
missing capability
fallback
```

### 建议

只记录元数据：

```text
predictedProfileId
actualProfileId
source
fallbackReason
missingCapabilities
```

不记录消息内容。

---

## P2-2. scope 工具不受 restrict 影响

### 现象

`ctx.tools.restrict` 只对 agent 继承的 global tools 生效。

### 当前

image-gen 是 global，实测有效。

### 风险

未来改成 preset-scope：

```text
restrict 可能无效
```

### 修复方向

```text
preset 组合
而不是 deny
```

---

## 建议处理顺序

```text
1. P0-1 restrict 失败可观测
2. P0-2 capability 校验
3. P0-3 predictor 校验
4. P0-4 session 记录 effective profile
5. P1-1 binding 优先级
6. P1-2 prompt 只列可用工具
7. P1-3 image family
8. P1-4 接统计
9. P2-1 预测记录
10. P2-2 scope
```
