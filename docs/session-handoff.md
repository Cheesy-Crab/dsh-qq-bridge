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
