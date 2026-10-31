# 会话交接

从旧会话交接给新会话。

## 当前目标

继续 DSH QQ 平台的开发与运维，优先保证：

```text
QQ 入站图片保存
DeepSeek 通道可用
session 不再异常增长
```

## 当前配置

```text
QQ bridge: deepseek-official / deepseek-flash  （已重启验证）
NapCat: enabled + autoStart
image-gen: enabled
QQ profile: 独立机器人账号
transport: connected
```

## 最近修复

```text
入站图片只有 file_id 时
  → 调用 NapCat get_image
  → 再保存到 attachments/incoming
```

## 会话数量

当前 bridge 只有 3 个活跃 chat，`pending=0`。

没有观察到“每条消息新建 session”。

最近的多个 session 来自：

```text
workspace 从 E:\dsh\工作区对接QQ
切换到 E:\QQdsh\u-b577ae62\1031-3e34b5
```

workspace 变化会触发新 session，这是设计行为。

## 新会话启动语

新会话第一条发送：

```text
先读 E:\dsh\工作区对接QQ\docs\session-handoff.md，
然后继续处理 DSH QQ 平台。
当前优先确认：
1. provider 是否为 deepseek-official
2. 入站图片保存
3. 连续消息是否复用同一个 sessionId
```

默认不自动重启。

## 重要路径

```text
QQ bridge 源码: E:\dsh\工作区对接QQ
平台核心: E:\dsh\dsh-platform-core
会话核心: E:\dsh\dsh-session-core
QQ 配置:
  %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
```

## 新会话建议

先验证：

```text
1. /qq-bridge/setup/status 的 provider 是否为 deepseek-official
2. 发一条普通 QQ 消息
3. 发一张图片，确认入站保存成功
4. 连续两轮消息是否复用同一 sessionId
```

不要自动重启；只有需要加载配置时才重启。

# 历史架构与设计

## 分层

```text
DSH host / agent runtime
  原生 agent loop、session 日志、tools、presets、plugins

@dsh/session-core
  对话生命周期、workspace、queue、profileId、accessGrants

@dsh/platform-core
  profile registry、capability bindings、tool exposure、profile state、
  invocation ledger、delivery coordinator、effect ledger、Fabric adapter

dsh-qq-bridge
  QQ/NapCat transport、身份/权限、命令、图片入站、QQ 出站交付
```

原则：

```text
DSH 是宿主，不被重写
platform-core 做治理
session-core 做会话
QQ bridge 只做适配
```

## 主执行流

```text
QQ 消息
  → bridge
  → session-core
  → effective profile
  → active capabilities
  → tool exposure + guard
  → DSH agent
  → tools/execute + InvocationLedger
  → tool body
  → turnEnd
  → DeliveryCoordinator
  → QQ
```

对应图：

```text
docs/execution-flow-v0.55.png
docs/architecture-v0.54.png
```

## profile 语义

```text
用户显式选择
  > 统计预测默认
  > 无 profile
```

已确定：

```text
session-core 只处理显式选择
platform 在 agent/created 决定 effective profile
默认 profile 不写回 state.profileId
agentPreset 不能在 agent/created 后替换
roleplay 是显式 behavior profile
capacity default 对用户不可见
```

相关文档：

```text
docs/profile-resolution.md
docs/profile-tool-issues.md
```

## capability 与 tool

```text
capability = 治理元数据
tool = 执行入口
```

能力不直接可调用，必须通过：

```text
capability.bind.tool
```

平台负责：

```text
active capabilities
→ capability bindings
→ deny inactive tools
→ ctx.tools.restrict
→ execution guard
```

profile family 只对 predicted profile 展开；显式 profile 仍保持窄能力集，这是待修 TODO。

相关文档：

```text
docs/tool-exposure.md
docs/capability.schema.json
```

## 幂等与交付

```text
InvocationLedger
  = 同 session/turn/tool/args 只执行一次

DeliveryCoordinator
  = 同 session/turn/surface/outputId 只交付一次
```

真实接入点：

```text
InvocationLedger → ctx.on('tools/execute')
DeliveryCoordinator → turnEnd / forwardMediaOutputs
```

不能只靠 prompt 保证幂等。

相关文档：

```text
docs/runtime-contracts.md
```

## profile 状态与预测

```text
ProfileStateStore
  = profile 级统计

UserCapabilityStore
  = user → capability 统计

profilePredictor
  = user stats → 默认 profile

prediction log
  = platform/predictions.jsonl
```

统计不保存消息、参数、结果正文。

相关文档：

```text
docs/profile-state.md
```

## Fabric

Fabric 仍是 Draft。

当前策略：

```text
dsh.platform 不变
提供 Host Descriptor / capability negotiation / effect ownership
通过 compatibility adapter 映射
不宣称 Fabric 一致性
```

相关文档：

```text
docs/fabric-field-map.md
docs/fabric-generation-effect.md
docs/dsh-desktop-reference.md
```

## 已知设计债

```text
selected profile 尚未展开 family
hot count 动态 capabilities 暂缓
scope tools 只能 execution guard，不能 schema 隐藏
predictor 的失败修正尚未形成闭环
profile state 仍以 profile 为主，user 聚合刚接入
/ profile 是实验性入口，不是当前支持链路
```

## 版本基线

```text
@dsh/platform-core  0.53.0
@dsh/session-core   0.52.8
dsh-qq-bridge       0.55.4
```

