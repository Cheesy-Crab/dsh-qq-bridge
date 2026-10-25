import path from 'node:path'

import { ChatAgentManager } from './agent/chat.js'
import { ApprovalBridge } from './approval.js'
import { UserStore } from './auth/users.js'
import { CommandDispatcher } from './commands.js'
import { saveIncomingImage } from './images.js'
import { UserQuestionBridge } from './questions.js'
import { JsonStore, resolveStateFile } from './store.js'
import { DedupeStore } from './transport/dedupe.js'
import { FakeTransport } from './transport/fake.js'
import { OneBotTransport } from './transport/onebot.js'

/**
 * Lifecycle owner for the QQ bridge: owns the transport, deduplicates inbound
 * messages, and (for M1) echoes each text message back to its chat.
 */
export class QqBridge {
  /**
   * @param {{ ctx: any, config: any, root: string, log: (level: string, message: string) => void, napcat?: any }} options
   */
  constructor({ ctx, config, root, log, napcat }) {
    this.ctx = ctx
    this.config = config
    this.root = root
    this.log = log
    this.napcat = napcat
    this.transport = undefined
    this.dedupe = new DedupeStore()
    this.chat = undefined
    this.commands = undefined
    this.store = undefined
    this.users = undefined
    this.approval = undefined
    this.questions = undefined
    this.startedAt = undefined
  }

  async start() {
    this.startedAt = Date.now()
    try {
      this.transport = this.createTransport()
    } catch (error) {
      this.log('error', `transport unavailable: ${error?.message ?? error}`)
      return
    }
    this.transport.onMessage((message) => {
      this.handleMessage(message).catch((error) => {
        this.log('error', `message handling failed: ${error?.stack ?? error}`)
      })
    })
    const stateFile = resolveStateFile(this.config.stateFile)
    this.users = new UserStore({
      file: path.join(path.dirname(stateFile), 'users.json'),
      admins: this.config.access.admins,
      log: this.log,
    })
    this.users.load()
    this.users.ensureAdmins()
    this.users.applyWhitelist(this.config.access.whitelist)

    const send = (chat, text) => this.transport.sendText(chat, text, chat?.mention ? { mention: chat.mention } : {})

    this.approval = new ApprovalBridge({
      ctx: this.ctx,
      log: this.log,
      send,
      timeoutMs: this.config.approval.timeoutSec * 1000,
    })
    this.approval.register()

    this.chat = new ChatAgentManager({
      ctx: this.ctx,
      config: this.config,
      root: this.root,
      log: this.log,
      send,
      sendImage: (chat, file, options) => this.transport.sendImage(chat, file, options),
      store: new JsonStore({ file: stateFile, log: this.log }),
      approval: this.approval,
    })
    this.chat.init()

    this.questions = new UserQuestionBridge({
      ctx: this.ctx,
      log: this.log,
      send,
      resolveChat: (sessionId) => this.chat.chatForSession(sessionId),
      timeoutMs: this.config.questions.timeoutSec * 1000,
    })
    this.questions.register()
    this.commands = new CommandDispatcher({
      manager: this.chat,
      users: this.users,
      config: this.config,
      root: this.root,
      log: this.log,
      send,
      sendImage: (chat, file, options) => this.transport.sendImage(chat, file, options),
      status: () => this.status(),
      napcat: this.napcat,
    })
    try {
      await this.transport.start()
      this.log('info', `bridge started root=${this.root} transport=${this.config.transport.kind}`)
    } catch (error) {
      this.log('error', `transport failed to start: ${error?.stack ?? error}`)
    }
  }

  createTransport() {
    const { kind } = this.config.transport
    if (kind === 'fake') return new FakeTransport({ log: this.log })
    if (kind === 'onebot') {
      return new OneBotTransport({ ...this.config.transport.onebot, log: this.log })
    }
    throw new Error(`transport kind "${kind}" is not implemented yet`)
  }

  /** @param {{ id: string, chat: { type: string, id: string }, text: string }} message */
  async handleMessage(message) {
    if (!message) return
    if (this.dedupe.seen(message.id)) {
      this.log('debug', `duplicate message skipped: ${message.id}`)
      return
    }
    if (!message.text && !(message.images?.length)) return

    const record = this.users.user(message.userId)
    if (record.status === 'frozen') {
      await this.transport.sendText(message.chat, '[qq-bridge] 该账号已被冻结。')
      return
    }
    const level = this.users.levelOf(message.userId)
    const capabilities = this.users.capabilitiesOf(message.userId, level)

    if (this.approval.tryAnswer(message)) return
    if (this.questions.tryAnswer(message)) return

    if (this.config.transport.echo) {
      await this.transport.sendText(message.chat, `[qq-bridge] 收到：${message.text}`)
      this.log('info', `echoed ${message.chat.type}:${message.chat.id} (${message.id})`)
      return
    }

    if (message.chat.type === 'group') {
      if (!message.mentioned) {
        this.log('debug', `group message ignored (no mention): ${message.chat.id}`)
        return
      }
      message.chat.mention = message.userId
    }

    const saved = await this.saveIncomingImages(message)
    if (saved.length > 0) {
      message.text = [message.text, ...saved.map((file) => `[图片已保存] ${file}`)].filter(Boolean).join('\n')
    } else if (message.images?.length) {
      message.text = [message.text, '[图片下载失败]'].filter(Boolean).join('\n')
    }

    if (await this.commands.execute(message, { level, capabilities })) return

    if (message.chat.type === 'group' && level === 'L0') {
      await this.transport.sendText(message.chat, '[qq-bridge] 群聊里需要先 /bind 绑定账号。', { mention: message.userId })
      return
    }

    const quota = this.users.recordTurn(message.userId, this.config.limits.dailyTurns[level] ?? 0)
    if (!quota.allowed) {
      await this.transport.sendText(message.chat, `[qq-bridge] 今日额度已用完（${quota.used}/${quota.limit}）。`)
      return
    }
    await this.chat.handle(message, { level, capabilities })
  }

  /**
   * Download every image segment into the chat's workspace so the agent can
   * read it by path. Failures are logged and surfaced as text.
   * @param {{ chat: any, images?: any[] }} message
   * @returns {Promise<string[]>}
   */
  async saveIncomingImages(message) {
    const images = message.images ?? []
    if (images.length === 0) return []
    const workspace = await this.chat.workspacePathFor(message.chat)
    const dir = path.join(workspace, 'attachments', 'incoming')
    const saved = []
    for (const image of images) {
      try {
        const file = await saveIncomingImage(image, dir)
        saved.push(file)
        this.log('info', `image saved ${message.chat.type}:${message.chat.id} ${file}`)
      } catch (error) {
        this.log('warn', `image save failed: ${error?.message ?? error}`)
      }
    }
    return saved
  }

  async stop() {
    try {
      await this.transport?.stop()
    } finally {
      this.log('info', 'bridge stopped')
    }
  }

  status() {
    return {
      startedAt: this.startedAt,
      transport: this.transport?.status?.() ?? { connected: false, clients: 0 },
      dedupeSize: this.dedupe.size,
      chats: this.chat?.status?.() ?? { chats: 0, pending: 0 },
    }
  }
}
