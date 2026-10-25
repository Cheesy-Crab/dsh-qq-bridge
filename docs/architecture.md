# 架构

QQ Bridge 分为 **两个业务域 + 一个运行支撑层**。依赖方向是单向的：

```text
QQ / NapCat / OneBot
        │
        ▼
src/transport/                 OneBot 反向 WS、去重
        │
        ▼
src/qq/                        QQ 适配层：Bridge、ConversationRouter、命令
        │
        ├──────────────► src/workspace/   工作区、会话、agent 生命周期
        │
        ├──────────────► src/agent-ext/   agent 行为扩展
        │
        ├──────────────► src/access/      等级、能力、配额
        │
        └──────────────► src/runtime/     NapCat 进程、安装、控制 API
                               │
                               ▼
                        src/core/  配置、路径、存储、凭据
```

## 目录

```text
src/
  index.js                  Cordis 入口 / composition root
  core/                     无业务知识的基础设施
    config.js
    paths.js
    store.js
    secrets.js
    credentials.js
    selftest.js
  access/                   身份与权限
    levels.js
    capabilities.js
    users.js
  transport/                OneBot 与 Fake 传输
    onebot.js
    fake.js
    dedupe.js
  workspace/                工作区对接域
    chat.js                 工作区/会话/agent 生命周期
    reply.js                回复提取与分段
  agent-ext/                agent 行为扩展域
    approval.js             审批转 QQ
    questions.js            ask_user_question 转 QQ
    images.js               入站图片落盘
    screenshot.js           全屏截图
    present.js              present 图片自动转发
    prompt.js               QQ 专用系统提示
    policy.js               审批策略 + 工具 guard
  qq/                       QQ 适配层
    bridge.js               组合根：用户、审批、问答、命令、聊天
    router.js               sessionId ↔ chat 索引
    commands.js             指令适配器
  runtime/                  运行支撑
    napcat.js               NapCat 进程守护
    napcat-install.js       下载/解压 NapCat
    napcat-http.js          Desktop 控制 API
    browse.js               目录选择
```

## 领域职责

### workspace：工作区对接域

负责“QQ 聊天 → 工作区 → 会话 → agent”的稳定映射：

- 用户/群目录、默认工作区、群工作区；
- 工作区创建、切换、重命名、删除；
- 会话创建、恢复、切换、归档；
- agent preset、provider、沙箱模式；
- 工作区/会话持久化。

**不负责**：审批弹窗、提问、图片发送、QQ 系统提示。

行为通过构造参数注入，而不是 import：

```js
behavior = {
  installPrompt(agent, state) {},
  applyPolicy(handle, level, state) {},
  forwardImages({ sendImage, chat, session, fromSeq, log }) {},
}
```

`workspace/` 不 import `agent-ext/`；由 `qq/bridge.js` 负责装配。

### agent-ext：agent 行为扩展域

负责在 agent 生命周期上挂 QQ 行为：

- 工具审批 → QQ 文本，回 `1/2`；
- `ask_user_question` → QQ 文本，回序号/文字；
- 本轮 `deliverables/presented` 中的图片 → QQ；
- `/screenshot`、`/sendimage` 的媒体输出；
- 入站图片保存；
- QQ 专用系统提示；
- 非 L3 的工具 guard 与审批策略。

**不负责**：创建工作区、恢复会话、决定用户等级。

### qq：QQ 适配层

- `bridge.js` 是 composition root，把 transport、users、approval、questions、
  commands、workspace manager 接起来；
- `router.js` 是 sessionId ↔ chat 的唯一索引，供审批/提问/媒体使用；
- `commands.js` 是 QQ 指令适配器，指令是入口，不是领域逻辑。

### runtime：运行支撑

- NapCat 进程启停、二维码、下载安装；
- Desktop 设置页调用的 `/qq-bridge/*` HTTP API；
- 目录选择。

它不依赖 workspace/agent-ext，只被 `index.js` 组合。

## 关键依赖规则

1. `workspace/` 不 import `qq/`；
2. `agent-ext/` 不 import `qq/`、`runtime/`；
3. `transport/` 不 import `workspace/`、`agent-ext/`（仅媒体段解析常量可放宽）；
4. `runtime/` 不 import `workspace/`、`agent-ext/`；
5. 只有 `qq/bridge.js` 和 `index.js` 知道所有域；
6. 域之间通过构造参数/回调传递能力，不通过全局单例互相查找。

## 主要运行链路

### 消息 → agent

```text
OneBot event
  → transport.normalizeEvent
  → qq.bridge.handleMessage
  → users.level/capabilities
  → commands.execute（若是指令）
  → agent-ext.images.saveIncomingImage（若有图）
  → workspace.chat.handle
      → ensure workspace/session
      → agent.followup
      → whenIdle
      → agent-ext.present.forwardPresentedImages
```

### 审批/提问

```text
DSH approval/request
  → agent-ext.approval
  → qq.router.chatForSession(sessionId)
  → transport.sendText
  → 用户回 1/2 或选项
```

### 截图

```text
用户 /screenshot
  → qq.commands
  → agent-ext.screenshot.captureScreen
  → transport.sendImage(base64)
```

## 扩展点

- **新增工作区能力**：只改 `workspace/` + `qq/commands.js`；
- **新增 agent 行为**：只加 `agent-ext/` 模块，由 `qq/bridge.js` 或 manager 注入；
- **换 QQ 协议**：新增 `transport/` 实现，workspace/agent-ext 不变；
- **换部署方式**：只改 `runtime/` 与 `index.js`。

## 已知边界

- `commands.js` 仍是一个 QQ 适配器文件，包含 workspace/admin/agent 三类指令；
  领域逻辑已经下沉，后续可再拆成 `qq/commands/*`；
- `workspace/chat.js` 仍负责 agent 创建与沙箱，因为它们是工作区会话生命周期的一部分；
- 审批/提问的“谁能回答”仍由 QQ 聊天身份决定，这是产品约束，不是领域泄漏。
