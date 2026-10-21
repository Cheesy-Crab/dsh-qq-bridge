# DSH 宿主 API 实测备忘

- 日期：2026-10-21
- 运行时：DSH 0.2.1-rc.2，profile `qqweb`（web 模板）
- 方式：临时插件在启动后延时探测 `ctx`，并从 `app.asar` 抽取包 README 与实现

## 服务名（root Context）

`workspaceRegistry`、`agents`、`sessions`、`sessionController`、`workspaceFiles`、`workingDirectory`、`approval`、`tools`、`commands`、`webServer`、`storage`、`sandbox`、`jobs`、`attachments`、`userQuestions`、`systemPrompt`、`credentials`、`llm`、`typert`、`remoteAccess`。

注意大小写与复数：是 `agents` 不是 `agent`；是 `workspaceRegistry` 不是 `workspaceController`（后者是给 Client 的 API 控制器，也能用，但注册表才是直接 seam）。

## 工作区

```js
const ws = await ctx.workspaceRegistry.create(dir, 'title') // dir 必须已存在、绝对路径
ws.id; ws.path; ws.title; ws.sessionIds
await ws.setTitle('renamed')
await ws.attachSession(sessionId)   // 异步；要求会话 header.cwd 的 realpath === ws.path
await ws.detachSession(sessionId)
await ctx.workspaceRegistry.delete(ws)  // 只删登记，不删目录/会话
```

- `sessionIds` 是过滤后的视图：只有 header.cwd 能解析且匹配该工作区路径的会话才会出现。
- 创建后目录缺失不会自动重建；`delete` 不删文件。

## 会话与 Agent

```js
const handle = await ctx.agents.create({
  sessionId,
  meta: { cwd: dir },
  agentOptions: { provider: 'deepseek-official', model: 'deepseek-flash' },
})
handle.agent.session.header.cwd   // 已规范化
await ctx.sessions.flush(handle.agent.session)
```

- `agents.create` **自己创建会话**；不要先 `ctx.sessions.create(sessionId)`，否则报 `session already exists`。
- `sessions.create(id, { meta: { cwd } })` 存在，但只用于不需要 agent 的场景。
- `handle.dispose()` 停 loop、注销、移除会话。
- 不传 `agentOptions` 时，web profile 的默认模型路由不会被自动用于 agent？实测未配置路由时 step 直接结束；显式传 `deepseek-official` / `deepseek-flash` 才进入请求。

## 驱动对话

```js
handle.agent.followup({
  id: 'qq-private-42-<message_id>',  // 必须，且会话内唯一
  role: 'user',                      // 必须显式带上
  content: [{ type: 'text', text: '你好' }],
  source: { kind: 'user' },
})
await handle.agent.whenIdle()
```

- **`followup` 必须带 `role: 'user'`**。官方示例省略了它，但实测省略后会话里的 `user/message` 事件没有 role，派生消息 role 为 `undefined`，DeepSeek 直接 400：`messages[1]: missing field role`。
- **`followup` 必须带 `id`**。省略后实时对话能跑，但重启时 `agents.resume()` 校验失败：`session event at seq N lacks an identified message`。用 QQ 的 `message_id` 拼 `${chatType}-${chatId}-${messageId}` 作为会话内唯一 id。
- `followup` 同步返回，轮次异步执行；`whenIdle()` 等整条 agent 停稳。
- 读回复：`handle.agent.session.deriveMessages()`，取最后一条 `role === 'assistant'` 的 text part；或订阅 `agent/assistant-stream` 做增量。
- `session/event` 的 payload 是会话状态对象（`log`、`surfaceManager`、`header`、`derived` 等），不是 `{ event }` 信封，别按 `payload.event.type` 解。
- 调试时可用 `session.snapshotEvents(fromSeq)` 看事件序列（已标记 deprecated，仅限排查）。

## 审批

```js
ctx.approval.setPolicy(agent, 'never')        // 或 'ask'
ctx.approval.effectivePolicy(session)
ctx.on('approval/request', (req, next) => {
  // req: { agent, toolName, callId?, reason?, signal? }
  return next()                                // 或返回 'allowed-once' / 'rejected' / 'cancelled' / 'unavailable'
})
```

- 应答者是 `approval/request` waterfall；注册在 agent 作用域的监听器只看得到该 agent。
- 没有应答者时结果 `unavailable`，调用方 fail-closed。
- `request` 只能在未结束的轮次内发生。

## 工具限制

```js
const dispose = handle.agent.ctx.tools.restrict({ allow: [], deny: ['bash'] })
dispose()
```

- 必须在 **agent 作用域** 调用（`agent.ctx.tools`），root 上下文会抛错。
- `allow` / `deny` 至少给一个；空对象是 no-op 并抛错。
- 未知工具名会抛错并列出可用工具。
- 也可以 `agent.ctx.tools.guard(fn)` 注册单调守卫，在 `tools/pre-execute` 之后、执行之前拒绝调用。

## 模型与凭据

- web 模板默认路由：`provider: deepseek-official`、`model: deepseek-flash`（`agent-default-model` 行）。
- `provider: 'deepseek'` **没有 adapter**，会得到 `NO_ADAPTER`。
- CLI 启动的 profile 没有 `DEEPSEEK_API_KEY`，请求报 `MISSING_CREDENTIAL`；桌面端登录的账号凭据不会自动进入该 profile。
- 插件的 `loadApiKey()` 在启动时从 `apiKeyFile` 读明文并写入 `process.env.DEEPSEEK_API_KEY`（环境变量已存在则不覆盖）。实测启动日志确认写入成功；是否被适配器接受取决于 key 本身，未用真实 key 验证。
- **只写 `process.env` 不够**：适配器组合了 credentials 服务时按该服务的存储解析，而启动环境在插件运行前已被快照。必须在服务就绪后调用 `ctx.credentials.set('DEEPSEEK_API_KEY', key)`（`describe(ref)` 只看是否配置，不返回值）。插件每次启动都会把文件里的 key 导入存储，文件因此是有效来源。
- 凭据优先级：存储文件 > 启动环境 > 项目 `.env` > `$DSH_HOME/.env`；保存的值写入存储层并立即生效。
- 密钥文件默认 `${DSH_HOME}/deepseek-key.txt`；支持裸 key 或 `NAME=value`，忽略 `#`/`//` 注释与 BOM。

## 平台

- Windows 中文路径可正常建工作区、attach、校验（realpath 一致）。
- 控制台里中文显示为乱码是 `Get-Content` 默认 ANSI 解码导致；文件与数据是 UTF-8。
- 插件 `package.json` 里 pnpm 记录的 `link:` 路径可能显示乱码，但 junction 目标正确。

## OneBot 传输

- 插件内置反向 WS 服务端（`ws` 依赖），默认 `ws://127.0.0.1:6700/`；NapCat 里配置「WebSocket 反向连接」指向它。
- token 从 `QQ_ONEBOT_TOKEN` 读取；支持 `Authorization: Bearer <token>` 与 `?access_token=<token>`，为空则不校验。
- `transport.onebot.path` 为 `/` 时接受任意路径（NapCat 可能用 `/onebot/v11/ws`），其他值精确匹配。
- 动作回包靠 `echo` 关联，10 秒超时；`send_private_msg` / `send_group_msg` 的参数分别是 `user_id` / `group_id`。
- 客户端断开时会立刻拒绝所有在途 action（`onebot client disconnected`），不必等超时。
- 入站只处理 `post_type: message`；`message_sent`、`meta_event`、`notice` 忽略。
- 文本从 `message` 段数组提取：`text` 拼接、`image` → `[图片]`、`face` → `[表情]`、`at` 丢弃；为空则回退 `raw_message`。
- 群消息的 `mentioned` 由 `at` 段的 `qq` 与事件里的 `self_id` 比较得出；不要依赖配置里的 bot 号。
- 群回复用 `send_group_msg`，`message` 段为 `[{type:'at',data:{qq}}, {type:'text',data:{text}}]`。
- 去重在 bridge 层按 `message_id` 做（内存 TTL 7 天），重复事件不会再触发动作。

## 会话恢复

```js
const handle = await ctx.agents.resume({
  resumeSessionId: sessionId,       // 注意不是 sessionId
  agentOptions: { provider: 'deepseek-official', model: 'deepseek-flash' },
})
```

- `resume` 要求已组合 session persistence，否则抛 `cannot resume: session persistence is not configured`。
- 恢复前会校验持久日志；消息缺 `id`、role 缺失或日志截断都会失败，失败信息形如 `stored session "<id>" failed validation: ...`。
- 同一会话已经 live 时（`ctx.agents.get(id)` 有值）不要再 resume，直接复用裸 Agent。
- `ws.sessionIds` 是过滤后的视图，只列 header.cwd 能解析且匹配该工作区路径的会话。

## 加载与生命周期

- 插件 `apply(ctx, config)` 时 root 上只有 `loader`；其他服务稍后才注册，需要轮询 `ctx.get(name)` 或声明 `inject`。
- `ctx.effect(() => disposer)` 管 socket/timer/监听器；`ctx.on(event, handler)` 注册监听。
- `ctx.logger.info()` 不一定进 stdout；排查时用 `DSH_QQ_BRIDGE_DEBUG=1` 镜像到 console。
- profile 的 `dsh.bundle.patch` 会自动把插件行 insert 进配置树；`--dump-config` 可核对。
