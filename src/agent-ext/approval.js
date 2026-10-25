/**
 * QQ-side approval answerer. Tool calls that need approval are forwarded to
 * the requesting chat as a 1/2 prompt; only that user can answer, and a timeout
 * fails closed. Requests from untracked agents delegate to the next answerer.
 */
export class ApprovalBridge {
  /**
   * @param {{ ctx: any, log: (level: string, message: string) => void,
   *           send: (chat: any, text: string) => Promise<unknown>, timeoutMs?: number }} options
   */
  constructor({ ctx, log, send, timeoutMs = 120000 }) {
    this.ctx = ctx
    this.log = log
    this.send = send
    this.timeoutMs = timeoutMs
    this.sessions = new Map()
    this.waiters = new Map()
    this.dispose = undefined
  }

  register() {
    if (this.dispose) return
    if (typeof this.ctx?.on !== 'function') return
    this.dispose = this.ctx.on('approval/request', (req, next) => this.onRequest(req, next))
  }

  /**
   * @param {string} sessionId
   * @param {{ chat: any, level: string, requester: string }} info
   */
  track(sessionId, info) {
    this.sessions.set(sessionId, info)
  }

  forget(sessionId) {
    this.sessions.delete(sessionId)
  }

  async onRequest(req, next) {
    const sessionId = req.agent?.session?.header?.id
    const info = sessionId ? this.sessions.get(sessionId) : undefined
    if (!info) return next()
    if (info.level === 'L0') return 'rejected'

    const chatKey = `${info.chat.type}:${info.chat.id}`
    if (this.waiters.has(chatKey)) return 'rejected'

    const reason = req.reason ? `\n原因：${req.reason}` : ''
    try {
      await this.send(info.chat, `【审批】工具 ${req.toolName}${reason}\n回复 1 允许，2 拒绝（${Math.round(this.timeoutMs / 1000)} 秒）`)
    } catch {
      return 'rejected'
    }

    const answer = await this.wait(chatKey, String(info.requester), req.signal)
    return answer === '1' ? 'allowed-once' : 'rejected'
  }

  wait(chatKey, requester, signal) {
    return new Promise((resolve) => {
      let timer
      const finish = (value) => {
        if (!this.waiters.has(chatKey)) return
        this.waiters.delete(chatKey)
        clearTimeout(timer)
        signal?.removeEventListener?.('abort', onAbort)
        resolve(value)
      }
      const onAbort = () => finish('cancelled')
      timer = setTimeout(() => finish('timeout'), this.timeoutMs)
      this.waiters.set(chatKey, { requester, finish })
      if (signal?.aborted) {
        finish('cancelled')
        return
      }
      signal?.addEventListener?.('abort', onAbort, { once: true })
    })
  }

  /**
   * Consume a chat message as an approval answer when one is pending.
   * @param {{ chat: any, userId: string, text: string }} message
   * @returns {boolean} true when the message was consumed
   */
  tryAnswer(message) {
    const chatKey = `${message.chat.type}:${message.chat.id}`
    const waiter = this.waiters.get(chatKey)
    if (!waiter) return false
    if (String(message.userId) !== String(waiter.requester)) return false
    const text = String(message.text ?? '').trim().toLowerCase()
    if (['1', 'y', 'yes', '允许', '同意'].includes(text)) {
      waiter.finish('1')
      return true
    }
    if (['2', 'n', 'no', '拒绝', '不同意'].includes(text)) {
      waiter.finish('2')
      return true
    }
    return false
  }
}
