import path from 'node:path'

import { ApprovalBridge } from '../agent-ext/approval.js'
import { qqGroupPrincipal, qqPrincipal } from './identity.js'
import { CommandDispatcher, parseCommand } from './commands.js'
import { saveIncomingImage } from '../agent-ext/images.js'
import { qqBuiltinExtensions } from '../agent-ext/builtins.js'
import { UserQuestionBridge } from '../agent-ext/questions.js'
import { JsonStore, resolveStateFile } from '../core/store.js'
import { ConversationRouter } from './router.js'
import { DedupeStore } from '../transport/dedupe.js'
import { FakeTransport } from '../transport/fake.js'
import { OneBotTransport } from '../transport/onebot.js'

/**
 * Prefix group messages with the sender's QQ id so a shared group session can
 * tell members apart. Private messages are returned unchanged.
 * @param {{ chat: { type: string, id: string }, userId: string, text?: string }} message
 * @returns {string}
 */
export function groupMessageText(message) {
  const text = String(message.text ?? '')
  if (message.chat?.type !== 'group') return text
  return `[QQ:${message.userId}] ${text}`
}

/**
 * A group is one permission subject: group:<id> owns the level, capabilities
 * and image quota. Private chats use the sender id directly.
 * @param {{ type: string, id: string }} chat
 * @returns {string}
 */
export function groupPrincipal(chat) {
  if (chat?.type === 'group') return qqGroupPrincipal(chat.id)
  return qqPrincipal(chat?.id)
}

/**
 * Image quota belongs to the group principal, not to individual members.
 * @param {{ type: string, id: string }} chat
 * @returns {string}
 */
export function quotaOwner(chat) {
  return groupPrincipal(chat)
}

/**
 * Lifecycle owner for the QQ bridge: owns the transport, deduplicates inbound
 * messages, and (for M1) echoes each text message back to its chat.
 */
export class QqBridge {
  /**
   * @param {{ ctx: any, config: any, root: string, log: (level: string, message: string) => void, napcat?: any }} options
   */
  constructor({ ctx, config, root, log, napcat, host }) {
    this.ctx = ctx
    this.config = config
    this.root = root
    this.log = log
    this.napcat = napcat
    this.host = host
    this.extensionsRegistered = false
    this.credentials = undefined
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
    if (!this.host?.createUserStore) throw new Error('adapter host is missing createUserStore')
    this.users = this.host.createUserStore({
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
    this.router = new ConversationRouter()

    if (!this.extensionsRegistered) {
      const chargeImage = ({ chat, state, cost }) => {
        const openid = quotaOwner(chat)
        if (!openid) throw new Error('群聊缺少发送者 QQ 号，无法扣除生图额度')
        const billing = this.users.chargeImageQuota(openid, cost)
        if (state) state.imageQuota = billing.remaining
        return billing
      }
      this.host.registerExtensions(qqBuiltinExtensions({
        approval: this.approval,
        chargeImage,
        forwardMedia: this.host.forwardMediaOutputs,
        toolAllowed: this.host.access?.toolAllowed,
        log: this.log,
      }))
      this.extensionsRegistered = true
    }

    const behavior = {
      sessionReady: (context) => this.host.extensions.sessionReady(context),
      turnEnd: (context) => this.host.extensions.turnEnd(context),
    }

    if (!this.host?.createSessionManager) throw new Error('adapter host is missing createSessionManager')
    this.chat = this.host.createSessionManager({
      ctx: this.ctx,
      config: this.config,
      root: this.root,
      log: this.log,
      send,
      sendImage: (chat, file, options) => this.transport.sendImage(chat, file, options),
      store: new JsonStore({ file: stateFile, log: this.log }),
      approval: this.approval,
      bindSession: (sessionId, chat) => this.router.bind(sessionId, chat),
      resolveChat: (sessionId) => this.router.chatForSession(sessionId),
      behavior,
    })
    this.chat.init()

    this.questions = new UserQuestionBridge({
      ctx: this.ctx,
      log: this.log,
      send,
      resolveChat: (sessionId) => this.router.chatForSession(sessionId),
      timeoutMs: this.config.questions.timeoutSec * 1000,
    })
    this.questions.register()
    if (typeof this.ctx.inject === 'function') {
      this.ctx.inject(['credentials'], (scoped) => {
        this.credentials = scoped.credentials
      })
    }
    this.commands = new CommandDispatcher({
      manager: this.chat,
      users: this.users,
      config: this.config,
      root: this.root,
      log: this.log,
      send,
      sendImage: (chat, file, options) => this.transport.sendImage(chat, file, options),
      status: () => this.status(),
      access: this.host.access,
      napcat: this.napcat,
      credentials: () => this.credentials,
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

    const principal = groupPrincipal(message.chat)
    const record = this.users.user(principal)
    if (record.status === 'frozen') {
      await this.transport.sendText(message.chat, '[qq-bridge] 该账号已被冻结。')
      return
    }
    const senderLevel = this.users.levelOf(message.userId)
    const senderCapabilities = this.users.capabilitiesOf(message.userId, senderLevel)
    const level = message.chat.type === 'group' ? this.users.levelOf(principal) : senderLevel
    const capabilities = message.chat.type === 'group'
      ? this.users.capabilitiesOf(principal, level)
      : senderCapabilities
    const imageQuota = this.users.imageQuotaOf(principal)

    if (message.chat.type === 'group') {
      if (!message.mentioned) {
        if (parseCommand(message.text, this.commands.prefixes())) {
          await this.transport.sendText(
            message.chat,
            '[qq-bridge] 群里发指令请先 @机器人。',
            { mention: message.userId },
          )
        }
        this.log('debug', `group message ignored (no mention): ${message.chat.id}`)
        return
      }
      message.chat.mention = message.userId
    }

    // Slash commands win over a pending approval/question. Otherwise a user
    // answering a question with /help has it consumed as a custom answer.
    if (await this.commands.execute(message, { level: senderLevel, capabilities: senderCapabilities })) return

    if (this.approval.tryAnswer(message)) return
    if (this.questions.tryAnswer(message)) return

    if (this.config.transport.echo) {
      await this.transport.sendText(message.chat, `[qq-bridge] 收到：${message.text}`)
      this.log('info', `echoed ${message.chat.type}:${message.chat.id} (${message.id})`)
      return
    }

    const saved = await this.saveIncomingImages(message)
    if (saved.length > 0) {
      message.text = [message.text, ...saved.map((file) => `[图片已保存] ${file}`)].filter(Boolean).join('\n')
    } else if (message.images?.length) {
      message.text = [message.text, '[图片下载失败]'].filter(Boolean).join('\n')
    }

    if (message.chat.type === 'group') {
      message.text = groupMessageText(message)
    }

    const quota = this.users.recordTurn(principal, this.config.limits.dailyTurns[level] ?? 0)
    if (!quota.allowed) {
      await this.transport.sendText(message.chat, `[qq-bridge] 今日额度已用完（${quota.used}/${quota.limit}）。`)
      return
    }
    await this.chat.handle(message, { level, capabilities, imageQuota })
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

