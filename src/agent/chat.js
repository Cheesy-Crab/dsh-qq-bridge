import fs from 'node:fs'
import path from 'node:path'

import { groupDir, isInside, uniquenessKey, userDir, validateName, workspacePath } from '../paths.js'
import { extractReplyText, splitText, turnError } from './reply.js'

const clip = (value, limit = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
const shortId = (id) => {
  const text = String(id ?? '')
  return text.length <= 10 ? text : `…${text.slice(-10)}`
}

/**
 * One agent Session per QQ chat, persisted across restarts. The first message
 * provisions the chat's workspace, session, and agent; later messages queue
 * behind the current turn. Workspaces and sessions can be switched through the
 * command layer.
 */
export class ChatAgentManager {
  /**
   * @param {{ ctx: any, config: any, root: string, log: (level: string, message: string) => void,
   *           send: (chat: { type: string, id: string }, text: string) => Promise<unknown>,
   *           store: import('../store.js').JsonStore }} options
   */
  constructor({ ctx, config, root, log, send, store, approval }) {
    this.ctx = ctx
    this.config = config
    this.root = root
    this.log = log
    this.send = send
    this.store = store
    this.approval = approval
    this.chats = new Map()
  }

  init() {
    this.store.load()
  }

  stateFor(chat) {
    const key = `${chat.type}:${chat.id}`
    let state = this.chats.get(key)
    if (!state) {
      const saved = this.store.get(key)
      state = {
        key,
        chat,
        chain: Promise.resolve(),
        pending: 0,
        opening: undefined,
        workspaceId: saved?.workspaceId,
        workspacePath: saved?.workspacePath,
        workspaceName: saved?.workspaceName,
        sessionId: saved?.sessionId,
        sessions: saved?.sessions ?? {},
        guest: false,
        level: 'L1',
        handle: undefined,
      }
      this.chats.set(key, state)
    }
    return state
  }

  persist(state) {
    if (state.guest) return
    this.store.set(state.key, {
      workspaceId: state.workspaceId,
      workspacePath: state.workspacePath,
      workspaceName: state.workspaceName,
      sessionId: state.sessionId,
      sessions: state.sessions,
      updatedAt: Date.now(),
    })
  }

  services() {
    const workspaceRegistry = this.ctx.get('workspaceRegistry')
    const agents = this.ctx.get('agents')
    const approval = this.ctx.get('approval')
    if (!workspaceRegistry || !agents) throw new Error('DSH 服务尚未就绪，请稍后再试')
    return { workspaceRegistry, agents, approval }
  }

  agentOptions() {
    return { provider: this.config.agent.provider, model: this.config.agent.model }
  }

  /**
   * Mount the configured agent preset (tools/prompt/skills). Raw
   * `agents.create` does not select one, which leaves the agent with only
   * host-global tools such as `working_directory`.
   * @param {any} agent
   */
  async ensurePreset(agent) {
    const preset = this.config.agent.preset
    const presets = this.ctx.get('agentPresets')
    if (!preset || !presets) return
    try {
      if (presets.composedPreset?.(agent.ctx) === preset) return
      if (presets.composedPreset?.(agent.ctx) === undefined && typeof presets.recompose === 'function') {
        await presets.recompose(agent.ctx, preset)
      } else {
        await presets.select(agent, preset)
      }
      this.log('info', `agent preset ${preset} mounted for ${agent.id}`)
    } catch (error) {
      this.log('warn', `agent preset ${preset} was not applied: ${error?.message ?? error}`)
    }
  }

  async ensureWorkspace(state) {
    const { workspaceRegistry } = this.services()
    const level = state.level ?? 'L1'

    if (state.chat.type === 'group') {
      const dir = groupDir(this.root, state.chat.id)
      fs.mkdirSync(dir, { recursive: true })
      const workspace = await workspaceRegistry.create(dir, `QQ Group ${state.chat.id}`)
      state.guest = false
      state.workspaceId = workspace.id
      state.workspacePath = workspace.path
      state.workspaceName = workspace.title
      return workspace
    }

    if (level === 'L0') {
      const dir = path.join(this.root, this.config.guestWorkspaceName)
      fs.mkdirSync(dir, { recursive: true })
      const workspace = await workspaceRegistry.create(dir, 'Guest')
      state.guest = true
      state.workspaceId = workspace.id
      state.workspacePath = workspace.path
      state.workspaceName = workspace.title
      return workspace
    }

    if (state.guest) {
      state.guest = false
      state.workspaceId = undefined
      state.workspacePath = undefined
      state.workspaceName = undefined
      state.sessionId = undefined
      state.sessions = {}
      state.handle = undefined
    }

    const workspaces = workspaceRegistry.list()

    let workspace = state.workspaceId ? workspaces.find((item) => item.id === state.workspaceId) : undefined
    if (!workspace && state.workspacePath && fs.existsSync(state.workspacePath)) {
      workspace = await workspaceRegistry.create(state.workspacePath, state.workspaceName ?? `QQ ${state.chat.id}`)
    }
    if (!workspace) {
      const dir = workspacePath(userDir(this.root, state.chat.id), this.config.defaultWorkspaceName)
      fs.mkdirSync(dir, { recursive: true })
      workspace = await workspaceRegistry.create(dir, `QQ ${state.chat.id}`)
    }

    state.workspaceId = workspace.id
    state.workspacePath = workspace.path
    state.workspaceName = workspace.title
    this.persist(state)
    return workspace
  }

  async ensureSession(state) {
    if (state.handle) return state.handle
    if (state.opening) return state.opening
    state.opening = this.openSession(state).finally(() => {
      state.opening = undefined
    })
    return state.opening
  }

  async openSession(state) {
    const workspace = await this.ensureWorkspace(state)
    const { agents, approval } = this.services()

    if (state.sessionId) {
      const live = agents.get(state.sessionId)
      if (live) {
        state.handle = { agent: live }
        this.log('info', `session attached ${state.key} ${state.sessionId}`)
        return state.handle
      }
      try {
        const handle = await agents.resume({ resumeSessionId: state.sessionId, agentOptions: this.agentOptions() })
        await this.attach(workspace, state.sessionId)
        await this.ensurePreset(handle.agent)
        this.applyPolicy(handle, state.level ?? 'L1')
        this.track(state, state.sessionId)
        this.applySandboxMode(handle.agent.session, state.level ?? 'L1', state)
        state.handle = handle
        this.log('info', `session resumed ${state.key} ${state.sessionId}`)
        return handle
      } catch (error) {
        this.log('warn', `resume failed for ${state.sessionId}: ${error?.message ?? error}; creating a new session`)
        state.sessionId = undefined
      }
    }
    return this.createSession(state, workspace)
  }

  async createSession(state, workspace) {
    const { agents, approval } = this.services()
    const sessionId = `sess-qq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const handle = await agents.create({
      sessionId,
      meta: {
        cwd: workspace.path,
        ...(this.config.agent.preset ? { agentPreset: this.config.agent.preset } : {}),
      },
      agentOptions: this.agentOptions(),
    })
    await this.attach(workspace, sessionId)
    await this.ensurePreset(handle.agent)
    this.applyPolicy(handle, state.level ?? 'L1')
    this.track(state, sessionId)
    this.applySandboxMode(handle.agent.session, state.level ?? 'L1', state)

    state.sessionId = sessionId
    state.sessions[workspace.id] = sessionId
    state.handle = handle
    this.persist(state)
    this.log('info', `session ready ${state.key} ${sessionId} cwd=${workspace.path}`)
    return handle
  }

  async attach(workspace, sessionId) {
    try {
      await workspace.attachSession(sessionId)
    } catch (error) {
      this.log('warn', `attach failed for ${sessionId}: ${error?.message ?? error}`)
    }
  }

  applyPolicy(handle, level) {
    const { approval } = this.services()
    try {
      approval?.setPolicy?.(handle.agent, level === 'L0' ? 'never' : 'ask')
    } catch (error) {
      this.log('warn', `approval policy was not set: ${error?.message ?? error}`)
    }
    if (level === 'L0') this.restrictGuestTools(handle.agent)
  }

  /** Guest chats are read-only: deny write/exec tools and add a hard guard. */
  restrictGuestTools(agent) {
    const unsafe = (name) => /^(write|edit|bash|pwsh|apply_patch|job|subagent|schedule|goal)/i.test(String(name ?? ''))
    try {
      const tools = agent.ctx.tools
      if (typeof tools.restrict === 'function') {
        const schemas = typeof tools.schemas === 'function' ? tools.schemas() : []
        const deny = (schemas ?? []).map((schema) => schema?.name).filter((name) => name && unsafe(name))
        if (deny.length > 0) tools.restrict({ deny })
      }
      if (typeof tools.guard === 'function') {
        tools.guard((exec) => {
          const name = exec?.toolName ?? exec?.tool?.name ?? exec?.name
          return unsafe(name) ? '访客只读：禁止写操作或执行命令' : undefined
        })
      }
    } catch (error) {
      this.log('warn', `guest tool restriction failed: ${error?.message ?? error}`)
    }
  }

  track(state, sessionId, requester = state.chat.id) {
    if (!sessionId) return
    this.approval?.track(sessionId, {
      chat: state.chat,
      level: state.level ?? 'L1',
      requester: String(requester),
    })
  }

  /**
   * Appoint the session's sandbox mode from the level mapping. The mode lives
   * in the session log (`sandbox/mode`), so replay keeps it across restarts.
   * @param {any} session
   * @param {string} level
   * @param {any} state
   */
  applySandboxMode(session, level, state) {
    const mode = this.config.sandbox?.modeByLevel?.[level] ?? 'workspace-write'
    if (state.sandboxMode === mode) return mode
    try {
      const policy = this.ctx.get('sandboxPolicy')
      const current = policy?.overrideOf?.(session)
      if (current !== mode) session.append('sandbox/mode', { mode })
      state.sandboxMode = mode
      this.log('info', `sandbox mode ${mode} for ${state.key}`)
    } catch (error) {
      this.log('warn', `sandbox mode was not applied: ${error?.message ?? error}`)
    }
    return mode
  }

  /**
   * Explicit switch used by the `/sandbox` command.
   * @param {{ type: string, id: string }} chat
   * @param {'read-only' | 'workspace-write' | 'danger-full-access'} mode
   */
  async setSandboxMode(chat, mode) {
    const state = this.stateFor(chat)
    const handle = await this.ensureSession(state)
    handle.agent.session.append('sandbox/mode', { mode })
    state.sandboxMode = mode
    this.log('info', `sandbox mode ${mode} switched for ${state.key}`)
    return mode
  }

  async listWorkspaces(chat) {
    const { workspaceRegistry } = this.services()
    const base = userDir(this.root, chat.id)
    return workspaceRegistry
      .list()
      .filter((workspace) => isInside(base, workspace.path))
      .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
  }

  async createWorkspace(chat, name, level = 'L1') {
    const clean = validateName(name)
    const existing = (await this.listWorkspaces(chat)).find((workspace) => uniquenessKey(workspace.title) === uniquenessKey(clean))
    if (existing) throw new Error(`工作区已存在：${existing.title}`)

    const state = this.stateFor(chat)
    state.level = level
    const maxWorkspaces = this.config.limits.maxWorkspaces?.[level] ?? 0
    if (maxWorkspaces > 0 && (await this.listWorkspaces(chat)).length >= maxWorkspaces) {
      throw new Error(`${level} 最多创建 ${maxWorkspaces} 个工作区`)
    }
    const dir = workspacePath(userDir(this.root, chat.id), clean)
    fs.mkdirSync(dir, { recursive: true })
    const { workspaceRegistry } = this.services()
    const workspace = await workspaceRegistry.create(dir, clean)

    state.workspaceId = workspace.id
    state.workspacePath = workspace.path
    state.workspaceName = workspace.title
    state.sessionId = undefined
    state.handle = undefined
    this.persist(state)
    await this.ensureSession(state)
    this.log('info', `workspace created ${state.key} ${workspace.path}`)
    return workspace
  }

  async useWorkspace(chat, token, level = 'L1') {
    const workspaces = await this.listWorkspaces(chat)
    const workspace = resolveByIndexOrName(workspaces, token)
    if (!workspace) throw new Error(`找不到工作区：${token}`)

    const state = this.stateFor(chat)
    state.level = level
    state.workspaceId = workspace.id
    state.workspacePath = workspace.path
    state.workspaceName = workspace.title
    state.sessionId = state.sessions?.[workspace.id]
    state.handle = undefined
    this.persist(state)
    await this.ensureSession(state)
    this.log('info', `workspace switched ${state.key} ${workspace.path}`)
    return workspace
  }

  async renameWorkspace(chat, name) {
    const clean = validateName(name)
    const state = this.stateFor(chat)
    const workspaces = await this.listWorkspaces(chat)
    const workspace = workspaces.find((item) => item.id === state.workspaceId)
    if (!workspace) throw new Error('当前没有工作区')
    await workspace.setTitle(clean)
    state.workspaceName = clean
    this.persist(state)
    return workspace
  }

  async newSession(chat, level = 'L1') {
    const state = this.stateFor(chat)
    state.level = level
    await this.ensureWorkspace(state)
    state.sessionId = undefined
    state.handle = undefined
    this.persist(state)
    const handle = await this.ensureSession(state)
    this.log('info', `new session ${state.key} ${state.sessionId}`)
    return handle
  }

  async listSessions(chat, level = 'L1') {
    const state = this.stateFor(chat)
    state.level = level
    const workspace = await this.ensureWorkspace(state)
    return {
      workspace,
      activeSessionId: state.sessionId,
      sessionIds: [...workspace.sessionIds],
    }
  }

  async useSession(chat, token, level = 'L1') {
    const state = this.stateFor(chat)
    state.level = level
    const { sessionIds } = await this.listSessions(chat, level)
    const index = Number(token)
    let sessionId
    if (Number.isInteger(index) && index >= 1 && index <= sessionIds.length) {
      sessionId = sessionIds[index - 1]
    } else {
      sessionId = sessionIds.find((id) => id.startsWith(String(token)))
    }
    if (!sessionId) throw new Error(`找不到会话：${token}`)

    state.sessionId = sessionId
    state.sessions[state.workspaceId] = sessionId
    state.handle = undefined
    this.persist(state)
    await this.ensureSession(state)
    return state.sessionId
  }

  async listAllWorkspaces() {
    const { workspaceRegistry } = this.services()
    return workspaceRegistry.list()
  }

  async cancelCurrent(chat) {
    const state = this.stateFor(chat)
    if (!state.handle) return false
    state.handle.agent.cancel({ kind: 'user' })
    return true
  }

  sessionSummary(chat) {
    const state = this.stateFor(chat)
    return {
      chat: state.chat,
      workspaceId: state.workspaceId,
      workspacePath: state.workspacePath,
      workspaceName: state.workspaceName,
      sessionId: state.sessionId,
      sessionShort: shortId(state.sessionId),
      sandboxMode: state.sandboxMode,
      pending: state.pending,
    }
  }

  /**
   * @param {{ id: string, chat: { type: 'private' | 'group', id: string }, text: string }} message
   */
  async handle(message, { level = 'L1' } = {}) {
    const state = this.stateFor(message.chat)
    state.level = level
    if (state.pending >= this.config.agent.maxQueue) {
      await this.reply(message.chat, '[qq-bridge] 当前还有消息在处理，请稍后再发。')
      return
    }

    state.pending += 1
    state.chain = state.chain
      .then(() => this.run(state, message))
      .catch((error) => {
        this.log('error', `turn failed for ${state.key}: ${error?.stack ?? error}`)
        return this.reply(message.chat, `[qq-bridge] 处理失败：${clip(error?.message ?? error)}`)
      })
      .finally(() => {
        state.pending -= 1
      })
    return state.chain
  }

  async run(state, message) {
    const handle = await this.ensureSession(state)
    const session = handle.agent.session
    this.track(state, session?.header?.id, message.userId)
    this.applySandboxMode(session, state.level ?? 'L1', state)
    const fromSeq = session.seq

    handle.agent.followup({
      id: `qq-${state.chat.type}-${state.chat.id}-${message.id}`,
      role: 'user',
      content: [{ type: 'text', text: message.text }],
      source: { kind: 'user' },
    })

    let timedOut = false
    try {
      await this.withTimeout(handle.agent.whenIdle(), this.config.agent.turnTimeoutMs)
    } catch {
      timedOut = true
      try {
        handle.agent.cancel({ kind: 'user' })
      } catch {
        // the agent may have stopped already
      }
    }

    if (timedOut) {
      await this.reply(state.chat, '[qq-bridge] 处理超时，已中断本次任务。')
      return
    }

    const error = turnError(session, fromSeq)
    if (error) {
      if (process.env.DSH_QQ_BRIDGE_DEBUG === '1') {
        try {
          const derived = session.deriveMessages().map((item) => ({
            role: item.role ?? null,
            parts: (item.content ?? []).map((part) => part.type),
          }))
          this.log('debug', `derived=${JSON.stringify(derived)}`)
        } catch (diagnosticError) {
          this.log('warn', `diagnostics failed: ${diagnosticError?.message ?? diagnosticError}`)
        }
      }
      await this.reply(state.chat, `[qq-bridge] 处理失败：${clip(error)}`)
      return
    }

    const reply = extractReplyText(session.deriveMessages())
    if (reply === '') {
      await this.reply(state.chat, '[qq-bridge] 模型没有返回文本。')
      return
    }
    for (const chunk of splitText(reply, this.config.limits.maxChars)) {
      await this.reply(state.chat, chunk)
    }
  }

  withTimeout(promise, timeoutMs) {
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('turn timed out')), timeoutMs)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }

  async reply(chat, text) {
    try {
      await this.send(chat, text)
    } catch (error) {
      this.log('error', `reply failed: ${error?.message ?? error}`)
    }
  }

  status() {
    return {
      chats: this.chats.size,
      pending: [...this.chats.values()].reduce((sum, state) => sum + state.pending, 0),
    }
  }
}

/**
 * Resolve a workspace by 1-based index, exact title, or id prefix.
 * @param {Array<{ id: string, title: string }>} workspaces
 * @param {string} token
 */
function resolveByIndexOrName(workspaces, token) {
  const index = Number(token)
  if (Number.isInteger(index) && index >= 1 && index <= workspaces.length) return workspaces[index - 1]
  return workspaces.find((workspace) => workspace.title === token)
    ?? workspaces.find((workspace) => workspace.id.startsWith(String(token)))
}
