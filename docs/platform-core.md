# 平台核心（Platform Core）

## 定位

平台核心是“人”的运行时，不是 QQ 适配器。

```text
平台核心
├─ 身份 / 意图
├─ 记忆 / 会话
├─ 能力注册与选择
├─ 权限 / 审批 / 审计
├─ 统一结果契约
└─ 通用交付路由
```

QQ、Web、Telegram、邮件都只是沟通表面；它们依赖平台核心，平台核心不依赖它们。

## 依赖方向

```text
QQ 适配器 ──→ 平台核心
插件 ──────→ 能力注册表
平台核心 ──→ 无 QQ / OneBot / NapCat 依赖
```

硬性边界：

- `src/platform` MUST NOT import `src/qq`、`src/agent-ext`、OneBot、NapCat；
- QQ 适配器 MAY import 平台核心；
- 平台核心不读取 QQ mention、群号、QQ 号；
- 平台核心不判断 image-gen、Civitai 或任何插件私有字段。

边界测试：

```text
test/platform-boundary.test.js
```

## 模块

```text
src/platform/
├─ index.js                 公开 API
├─ plugin-adapter.js        分类 / 旧结果适配
├─ delivery.js              通用媒体交付
├─ events.js                会话事件读取
└─ prompts/
   ├─ creative.prompt.js    通用创作策略
   └─ tool-failures.prompt.js 通用失败策略
```

### 公开 API

```js
import {
  classifyPlugin,
  createPluginAdapter,
  adaptToolResult,
  forwardMediaOutputs,
  generatedImageRecords,
  generatedImages,
  installCreativePrompt,
  installToolFailurePrompt,
} from './platform/index.js'
```

## 沟通适配器职责

一个沟通适配器只应提供：

```text
surface.register
surface.normalizeInbound
surface.sendText
surface.sendMedia
surface.mentionOptions
surface.identityOf
```

它不应该：

- 解析插件私有字段；
- 决定图片是否扣费；
- 决定工具是否重试；
- 读取能力 prompt 之外的插件逻辑。

QQ 适配器当前仍负责：

- OneBot / NapCat；
- 群聊 @；
- QQ 号与群号映射；
- QQ 命令入口；
- QQ 媒体发送与 mention。

## 插件进入平台

```text
有 capabilities        → native
只有 tools             → legacy-tools，推断 + 复核
只有 prompts/skills    → knowledge-only
什么都没有             → unknown，观察
```

结果统一成：

```text
meta.dsh.outputs
meta.dsh.operation
meta.dsh.retry
meta.dsh.cost
meta.dsh.error
```

平台只消费这个契约。

## 媒体交付

`forwardMediaOutputs` 不写死 QQ：

```js
forwardMediaOutputs({
  sendImage,
  sendText,
  charge,
  chat,
  session,
  fromSeq,
  optionsForChat,
  presentedFor,
  archive,
})
```

沟通适配器注入：

- `optionsForChat`：mention 等表面参数；
- `presentedFor`：该表面已展示的媒体；
- `archive`：会话归档策略。

## 迁移路线

1. **代码边界**：平台目录不反向依赖 QQ（已完成）。
2. **包边界**：把 `src/platform` 拆成独立包 `@dsh/platform-core`。
3. **适配器边界**：QQ 作为独立包 `@dsh/qq-adapter` 依赖核心。
4. **移除兼容 shim**：`agent-ext/events.js`、`agent-ext/generated-images.js`。
5. **多沟通表面**：Web / Telegram 复用同一核心与契约。

## 目标

```text
QQ 可以安装 GitHub 上任意符合契约的能力插件；
平台核心不需要为新插件改代码；
沟通适配器可以替换；
所有能力通过同一结果契约交付。
```
