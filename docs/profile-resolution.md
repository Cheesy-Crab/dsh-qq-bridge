# Profile Resolution

状态：0.50.1 / 0.52.5 已实现“单点 effective profile”。

## 职责

```text
session-core
  = 只保存用户显式选择的 profileId
  = 不保存 profile 完整对象
  = 不预测默认
  = 把 profileId 放进 session meta

platform agent/created
  = selected?
      是 → 使用 selected
      否 → 询问 predictor
      仍无 → 不启用 profile
  = 设置 agent.__platformProfile
  = 记录 effectiveProfileId / effectiveProfileSource
  = 安装 capability prompt

sessionReady
  = 只按 effective profile 暴露 tools
```

## 持久化

```text
state.profileId
  只表示用户选择

session.meta.profileId
  用户选择

session.meta.effectiveProfileId
  effective 结果

session.meta.effectiveProfileSource
  selected | predicted | default
```

不再持久化：

```text
state.profileOverride
```

profile 描述符每次从 registry 解析。

## 优先级

```text
用户显式选择
  > predictor 默认
  > 无 profile / 全局默认
```

## 禁止

```text
platform 按 agentPreset 猜 profile
session-core 预测默认
默认 profile 写回 state.profileId
```

## predictor

platform 读取可选服务：

```text
ctx.get('profilePredictor').predict({ agent, profiles })
```

返回：

```text
profile 对象
或 profile id
或 undefined
```

校验：

```text
profile 必须存在于 registry
agentPreset 必须与当前 agent 一致
否则 fallback default
```

统计默认已接入：\n\n```text\nUserCapabilityStore\n  → topCapabilities(user)\n  → profile score\n  → predicted profile\n```\n\n样本阈值：3 次。\n群聊按 group principal 聚合。\n每次预测写入 `%DSH_HOME%\\platform\\predictions.jsonl`。\n预测只匹配同一 agentPreset 的 profile。\n预测 profile 会按 family 展开能力面。

## resolver 失败

session-core：

```text
profileId 仍保留
profile 解析失败记录 warning
本次 session 使用默认 preset
```

## 结果

```text
agent.__platformProfile
agent.__platformProfileSource = selected | predicted | default
session.meta.effectiveProfileId
session.meta.effectiveProfileSource
```

resume 优先复用：

```text
selected profileId
→ 否则 effectiveProfileId
→ 否则才重新预测
```

## tool exposure

```text
onSession({ agent, profile })
  → profile 有 id ? profile
  : agent.__platformProfile
  → applyToolExposure
```

sessionReady 只在 create/resume 调用一次，run 不再调用。

## /profile 状态

```text
/profile 目前是实验性入口
不属于当前支持链路
不在本轮继续扩展
```

用户未显式选择时，由 platform predictor 决定 effective profile。


