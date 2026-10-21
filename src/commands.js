import { atLeast, normalizeLevel } from './auth/levels.js'

const clip = (value, limit = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
const shortId = (id) => {
  const text = String(id ?? '')
  return text.length <= 10 ? text : `…${text.slice(-10)}`
}

/**
 * Parse `<prefix>name args...`.
 * @param {string} text
 * @param {string} prefix
 * @returns {{ name: string, args: string[] } | null}
 */
export function parseCommand(text, prefix = '/') {
  const trimmed = String(text ?? '').trim()
  if (!trimmed.startsWith(prefix)) return null
  const body = trimmed.slice(prefix.length).trim()
  if (body === '') return { name: 'help', args: [] }
  const [name, ...args] = body.split(/\s+/)
  return { name: name.toLowerCase(), args }
}

/**
 * Slash-command layer. Commands are registered with usage and description so
 * `/help` stays in sync with what is actually available.
 */
export class CommandDispatcher {
  /**
   * @param {{ manager: any, config: any, root: string,
   *           log: (level: string, message: string) => void,
   *           send: (chat: any, text: string) => Promise<unknown>,
   *           status: () => any }} options
   */
  constructor({ manager, users, config, root, log, send, status }) {
    this.manager = manager
    this.users = users
    this.config = config
    this.root = root
    this.log = log
    this.send = send
    this.status = status
    this.commands = new Map()
    this.registerBuiltins()
  }

  register(name, { usage, description, handler, minLevel = 'L0', aliases = [] }) {
    this.commands.set(name, { usage, description, handler, minLevel })
    for (const alias of aliases) this.commands.set(alias, this.commands.get(name))
  }

  prefix() {
    return this.config.commandPrefix
  }

  /**
   * @param {{ chat: any, text: string }} message
   * @param {{ level?: string }} [options]
   * @returns {Promise<boolean>} whether the message was a command
   */
  async execute(message, { level = 'L0' } = {}) {
    const parsed = parseCommand(message.text, this.prefix())
    if (!parsed) return false
    const command = this.commands.get(parsed.name)
    if (!command) {
      await this.reply(message.chat, `未知指令 ${this.prefix()}${parsed.name}，发 ${this.prefix()}help 查看可用指令。`)
      return true
    }
    if (!atLeast(level, command.minLevel)) {
      await this.reply(message.chat, `权限不足：该指令需要 ${command.minLevel}，你当前是 ${level}。`)
      return true
    }
    try {
      const result = await command.handler({ message, args: parsed.args, command, level })
      const lines = Array.isArray(result) ? result : result === undefined ? [] : [result]
      const text = lines
        .filter((line) => line !== undefined && line !== null && String(line) !== '')
        .map((line) => String(line))
        .join('\n')
      if (text !== '') await this.reply(message.chat, text)
    } catch (error) {
      this.log('warn', `command ${parsed.name} failed: ${error?.message ?? error}`)
      await this.reply(message.chat, `[qq-bridge] 指令失败：${clip(error?.message ?? error)}`)
    }
    return true
  }

  async reply(chat, text) {
    try {
      await this.send(chat, text)
    } catch (error) {
      this.log('error', `command reply failed: ${error?.message ?? error}`)
    }
  }

  registerBuiltins() {
    this.register('help', {
      usage: 'help',
      description: '显示可用指令',
      handler: () => this.helpText(),
    })

    this.register('whoami', {
      usage: 'whoami',
      description: '我的工作区与会话',
      handler: async ({ message, level }) => {
        const summary = this.manager.sessionSummary(message.chat)
        let { workspaceName, workspacePath } = summary
        if (!summary.workspaceId) {
          const workspaces = await this.manager.listWorkspaces(message.chat)
          if (workspaces.length > 0) {
            workspaceName = `${workspaces[0].title}（未激活）`
            workspacePath = workspaces[0].path
          }
        }
        return [
          `QQ：${message.chat.id}`,
          `等级：${level}`,
          `工作区：${workspaceName ?? '（未创建）'}`,
          `路径：${workspacePath ?? '（无）'}`,
          `会话：${summary.sessionShort || '（未创建）'}`,
          `文件策略：${summary.sandboxMode ?? '默认'}`,
          `排队：${summary.pending}`,
        ]
      },
    })

    this.register('status', {
      usage: 'status',
      description: '连接与队列状态',
      handler: () => {
        const status = this.status()
        const transport = status.transport ?? {}
        return [
          `连接：${transport.connected ? '已连接' : '未连接'}`,
          `聊天：${status.chats?.chats ?? 0}，排队：${status.chats?.pending ?? 0}`,
          `去重表：${status.dedupeSize ?? 0}`,
          `根目录：${this.root}`,
        ]
      },
    })

    this.register('new', {
      usage: 'new',
      description: '在当前工作区新开会话',
      minLevel: 'L1',
      handler: async ({ message, level }) => {
        if (message.chat.type === 'group' && level !== 'L3') throw new Error('群聊是共享会话，只有 L3 能重置')
        const handle = await this.manager.newSession(message.chat, level)
        return `已新建会话 ${shortId(handle.agent.session.header.id)}。`
      },
    })

    this.register('reset', {
      usage: 'reset',
      description: '重置当前会话（等同 /new）',
      minLevel: 'L1',
      handler: async ({ message, level }) => {
        if (message.chat.type === 'group' && level !== 'L3') throw new Error('群聊是共享会话，只有 L3 能重置')
        const handle = await this.manager.newSession(message.chat, level)
        return `已重置为新会话 ${shortId(handle.agent.session.header.id)}。`
      },
    })

    this.register('sessions', {
      usage: 'sessions',
      description: '当前工作区的会话列表',
      minLevel: 'L1',
      handler: async ({ message, level }) => {
        if (message.chat.type === 'group') throw new Error('群聊使用共享会话，没有会话列表')
        const { workspace, sessionIds, activeSessionId } = await this.manager.listSessions(message.chat, level)
        if (sessionIds.length === 0) return [`工作区 ${workspace.title} 还没有会话。`]
        const lines = [`工作区 ${workspace.title} 的会话：`]
        sessionIds.forEach((id, index) => {
          lines.push(`${index + 1}. ${shortId(id)}${id === activeSessionId ? '  ← 当前' : ''}`)
        })
        return lines
      },
    })

    this.register('use', {
      usage: 'use <序号>',
      description: '切换会话',
      minLevel: 'L1',
      handler: async ({ message, args, level }) => {
        if (message.chat.type === 'group') throw new Error('群聊使用共享会话，无需切换')
        if (args.length === 0) throw new Error('用法：/use <序号>')
        const sessionId = await this.manager.useSession(message.chat, args[0], level)
        return `已切换到会话 ${shortId(sessionId)}。`
      },
    })

    this.register('stop', {
      usage: 'stop',
      description: '中断当前回合',
      handler: async ({ message }) => {
        const stopped = await this.manager.cancelCurrent(message.chat)
        return stopped ? '已请求中断当前回合。' : '当前没有运行中的回合。'
      },
    })

    this.register('ws', {
      usage: 'ws list|new|use|info|rename',
      description: '工作区管理',
      minLevel: 'L1',
      handler: ({ message, args, level }) => this.handleWorkspace(message, args, level),
    })

    this.register('sandbox', {
      usage: 'sandbox [read-only|workspace-write|danger-full-access]',
      description: '查看或切换当前会话的文件沙箱模式（L3）',
      minLevel: 'L3',
      handler: async ({ message, args }) => {
        const modes = ['read-only', 'workspace-write', 'danger-full-access']
        if (args.length === 0) {
          const summary = this.manager.sessionSummary(message.chat)
          return `当前文件策略：${summary.sandboxMode ?? '默认'}`
        }
        const mode = String(args[0]).toLowerCase()
        if (!modes.includes(mode)) throw new Error(`用法：${this.prefix()}sandbox ${modes.join('|')}`)
        await this.manager.setSandboxMode(message.chat, mode)
        return `已切换文件策略：${mode}`
      },
    })

    this.register('bind', {
      usage: 'bind <配对码>',
      description: '用配对码绑定账号',
      handler: ({ message, args }) => {
        if (args.length === 0) throw new Error('用法：/bind <配对码>')
        const result = this.users.bind(String(message.userId), args[0])
        if (!result.ok) return `绑定失败：${result.reason}`
        return `绑定成功，当前等级：${result.level}`
      },
    })

    this.register('admin', {
      usage: 'admin ...',
      description: '管理员指令（L3）',
      minLevel: 'L3',
      handler: ({ args }) => this.handleAdmin(args),
    })
  }

  async handleAdmin(args) {
    const sub = args[0]
    if (sub === 'users' || sub === undefined) {
      const users = this.users.list()
      if (users.length === 0) return ['还没有用户。']
      return ['用户列表：', ...users.map((user) => `${user.openid}  ${user.level}  ${user.status}  今日 ${user.turns} 轮`)]
    }
    if (sub === 'invite') {
      const level = normalizeLevel(args[1] ?? 'L1')
      const minutes = this.config.access.bindCodeTtlMinutes
      const code = this.users.invite(level, minutes * 60 * 1000)
      return `配对码：${code}\n等级：${level}\n有效期：${minutes} 分钟`
    }
    if (sub === 'level') {
      if (args.length < 3) throw new Error('用法：/admin level <openid> <L0-L3>')
      this.users.setLevel(args[1], args[2])
      return `已把 ${args[1]} 设为 ${normalizeLevel(args[2])}。`
    }
    if (sub === 'freeze' || sub === 'unfreeze') {
      if (args.length < 2) throw new Error(`用法：/admin ${sub} <openid>`)
      this.users.freeze(args[1], sub === 'freeze')
      return `已${sub === 'freeze' ? '冻结' : '解冻'} ${args[1]}。`
    }
    if (sub === 'ws' && args[1] === 'list') {
      const workspaces = await this.manager.listAllWorkspaces()
      if (workspaces.length === 0) return ['还没有工作区。']
      return ['全部工作区：', ...workspaces.map((workspace) => `${workspace.title}  ${workspace.path}`)]
    }
    throw new Error('用法：/admin users|invite|level|freeze|unfreeze|ws list')
  }

  async handleWorkspace(message, args, level = 'L1') {
    const sub = args[0]
    const rest = args.slice(1).join(' ').trim()
    if (message.chat.type === 'group' && sub !== 'info' && sub !== undefined) {
      throw new Error('群聊里只能使用 /ws info')
    }
    if (sub === 'list' || sub === undefined) {
      const workspaces = await this.manager.listWorkspaces(message.chat)
      const summary = this.manager.sessionSummary(message.chat)
      if (workspaces.length === 0) return ['还没有工作区，发 /ws new <名称> 创建一个。']
      const lines = ['我的工作区：']
      workspaces.forEach((workspace, index) => {
        lines.push(`${index + 1}. ${workspace.title}（${shortId(workspace.id)}）${workspace.id === summary.workspaceId ? '  ← 当前' : ''}`)
      })
      return lines
    }
    if (sub === 'new') {
      if (rest === '') throw new Error('用法：/ws new <名称>')
      const workspace = await this.manager.createWorkspace(message.chat, rest, level)
      return `已创建工作区 ${workspace.title}：${workspace.path}`
    }
    if (sub === 'use') {
      if (rest === '') throw new Error('用法：/ws use <序号|名称>')
      const workspace = await this.manager.useWorkspace(message.chat, rest, level)
      return `已切换到工作区 ${workspace.title}：${workspace.path}`
    }
    if (sub === 'info') {
      const summary = this.manager.sessionSummary(message.chat)
      if (!summary.workspaceId) return ['当前还没有工作区。']
      const { sessionIds } = await this.manager.listSessions(message.chat, level)
      return [
        `工作区：${summary.workspaceName}`,
        `路径：${summary.workspacePath}`,
        `ID：${summary.workspaceId}`,
        `会话数：${sessionIds.length}`,
        `当前会话：${summary.sessionShort || '（无）'}`,
      ]
    }
    if (sub === 'rename') {
      if (rest === '') throw new Error('用法：/ws rename <名称>')
      const workspace = await this.manager.renameWorkspace(message.chat, rest)
      return `已重命名工作区为 ${workspace.title}（目录不变）。`
    }
    throw new Error('用法：/ws list|new|use|info|rename')
  }

  helpText() {
    const lines = ['可用指令：']
    const seen = new Set()
    for (const [name, command] of this.commands) {
      if (seen.has(command)) continue
      seen.add(command)
      lines.push(`${this.prefix()}${command.usage} — ${command.description}`)
      if (name === 'ws') {
        lines.push(`  ${this.prefix()}ws list — 工作区列表`)
        lines.push(`  ${this.prefix()}ws new <名称> — 新建工作区`)
        lines.push(`  ${this.prefix()}ws use <序号|名称> — 切换工作区`)
        lines.push(`  ${this.prefix()}ws info — 当前工作区信息`)
        lines.push(`  ${this.prefix()}ws rename <名称> — 重命名当前工作区`)
      }
    }
    return lines
  }
}
