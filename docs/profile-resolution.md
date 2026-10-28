# Profile Resolution

状态：0.50.0 已实现“单点 effective profile”。

## 职责

```text
session-core
  = 只解析用户显式选择
  = 把 profileId 放进 session meta

platform agent/created
  = selected?
      是 → 使用 selected
      否 → 询问 predictor
      仍无 → 不启用 profile
  = 设置 agent.__platformProfile
  = 安装 capability prompt

sessionReady
  = 只按 effective profile 暴露 tools
```

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

统计默认以后接在这里，不改 session-core。

## 结果

```text
agent.__platformProfile
agent.__platformProfileSource = selected | predicted | default
```

`source` 只存在于运行时，不持久化。

## tool exposure

```text
onSession({ agent, profile })
  → profile 有 id ? profile
  : agent.__platformProfile
  → applyToolExposure
```

sessionReady 只在 create/resume 调用一次，run 不再调用。
