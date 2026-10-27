# 平台核心（Platform Core）

独立仓库：

**https://github.com/Cheesy-Crab/dsh-platform-core**

会话核心独立仓库：

**https://github.com/Cheesy-Crab/dsh-session-core**

安装：

```text
https://github.com/Cheesy-Crab/dsh-platform-core.git#v0.41.1
https://github.com/Cheesy-Crab/dsh-session-core.git#v0.46.0
```

QQ 仓库不再保存平台核心或会话核心副本；两者通过包依赖安装。

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
dsh-platform-core/
├─ package.json             @dsh/platform-core
└─ src/
   ├─ index.js              公开 API
   ├─ plugin-adapter.js     分类 / 旧结果适配
   ├─ delivery.js           通用媒体交付
   ├─ events.js             会话事件读取
   ├─ registry.js           插件发现 / 能力注册表
   └─ prompts/
      ├─ creative.prompt.js
      └─ tool-failures.prompt.js
```

根包的 `src/platform/*` 只保留兼容 re-export；新代码应直接依赖 `@dsh/platform-core`。

### 公开 API

```js
import {
  classifyPlugin,
  createPluginAdapter,
  adaptToolResult,
  discoverPlugins,
  PluginRegistry,
  forwardMediaOutputs,
  generatedImageRecords,
  generatedImages,
  installCreativePrompt,
  installToolFailurePrompt,
} from '@dsh/platform-core'
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

### 发现

平台核心从 DSH profile 的 `node_modules` 发现已安装插件，只读取 `package.json` 的 `dsh` 清单，不执行插件代码：

```js
import { discoverPlugins, PluginRegistry } from './platform/index.js'

const plugins = discoverPlugins({
  profileDir: 'C:/Users/me/.dsh/profiles/desktop',
})

const registry = new PluginRegistry(plugins)
registry.forTool('generate_image')
registry.capabilities()
registry.prompts({ surfaces: ['qq'] })
registry.describe()
```

### 分类

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

## Web GUI 接入（TODO）

Web GUI 的对话可以正常使用，但平台核心的 `agentExtensions` 目前只被 QQ 的 `ChatAgentManager` 消费。

待办：

- 在 DSH Host 增加通用 agent 创建 hook；
- 或增加 Web 适配器，调用 `installCreativePrompt` / `installToolFailurePrompt`；
- 接入后 Web 对话才具备平台级的创作和工具失败提示词。

## 迁移路线

1. **代码边界**：平台目录不反向依赖 QQ（已完成）。
2. **包边界**：独立包 `@dsh/platform-core`（已完成）。
3. **适配器边界**：QQ 作为独立包 `@dsh/qq-bridge` 依赖核心（已完成）。
4. **移除兼容 shim**：`agent-ext/events.js`、`agent-ext/generated-images.js`（后续清理）。
5. **多沟通表面**：Web / Telegram 复用同一核心与契约（Web 待接入）。

## 目标

```text
QQ 可以安装 GitHub 上任意符合契约的能力插件；
平台核心不需要为新插件改代码；
沟通适配器可以替换；
所有能力通过同一结果契约交付。
```
