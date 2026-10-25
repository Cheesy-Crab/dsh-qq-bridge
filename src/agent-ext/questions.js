/**
 * QQ answerer for `ctx.userQuestions`. The agent's ask_user_question tool blocks
 * on this waterfall; we render the options as plain text in the requesting chat
 * and translate the next message into an answer batch.
 */
export class UserQuestionBridge {
  /**
   * @param {{ ctx: any, log: (level: string, message: string) => void,
   *           send: (chat: any, text: string) => Promise<unknown>,
   *           resolveChat: (sessionId: string) => any,
   *           timeoutMs?: number }} options
   */
  constructor({ ctx, log, send, resolveChat, timeoutMs = 120000 }) {
    this.ctx = ctx
    this.log = log
    this.send = send
    this.resolveChat = resolveChat
    this.timeoutMs = timeoutMs
    this.waiters = new Map()
    this.dispose = undefined
  }

  register() {
    if (this.dispose) return
    if (typeof this.ctx?.on !== 'function') return
    this.dispose = this.ctx.on('user-questions/request', (request, next) => this.handle(request, next))
  }

  async handle(request, next) {
    const sessionId = request.agent?.session?.header?.id
    const chat = sessionId ? this.resolveChat(sessionId) : undefined
    if (!chat) return next()
    const answers = []
    for (const question of request.questions ?? []) {
      answers.push(await this.askOne(chat, question, request.signal))
      if (request.signal?.aborted) break
    }
    return { answers }
  }

  async askOne(chat, question, signal) {
    const options = question.options ?? []
    const lines = []
    if (question.header) lines.push(`【提问】${question.header}`)
    else lines.push('【提问】')
    lines.push(question.question)
    if (question.detail) lines.push(`\n${String(question.detail).slice(0, 800)}`)
    options.forEach((option, index) => {
      lines.push(`${index + 1}. ${option.label}${option.description ? ` — ${option.description}` : ''}`)
    })
    if (options.length === 0) lines.push('直接回复文字即可。')
    else if (question.multiSelect ?? question.multi_select) lines.push('多选：回复序号，用逗号分隔。')
    else lines.push('回复序号，或直接输入文字。')

    await this.send(chat, lines.join('\n'))
    const answer = await this.wait(chat, question, signal)
    if (answer === undefined) {
      return { id: question.id, selected: [], custom: '（用户超时未回复）' }
    }
    return answer
  }

  keyOf(chat) {
    return `${chat.type}:${chat.id}`
  }

  requesterOf(chat) {
    return String(chat.mention ?? chat.id)
  }

  wait(chat, question, signal) {
    return new Promise((resolve) => {
      const key = this.keyOf(chat)
      let timer
      const finish = (value) => {
        if (!this.waiters.has(key)) return
        this.waiters.delete(key)
        clearTimeout(timer)
        signal?.removeEventListener?.('abort', onAbort)
        resolve(value)
      }
      const onAbort = () => finish(undefined)
      timer = this.timeoutMs > 0 ? setTimeout(() => finish(undefined), this.timeoutMs) : undefined
      this.waiters.set(key, { requester: this.requesterOf(chat), question, finish })
      if (signal?.aborted) {
        finish(undefined)
        return
      }
      signal?.addEventListener?.('abort', onAbort, { once: true })
    })
  }

  /**
   * Consume a chat message as an answer while a question is pending.
   * @param {{ chat: any, userId: string, text: string }} message
   * @returns {boolean} true when the message was consumed
   */
  tryAnswer(message) {
    const waiter = this.waiters.get(this.keyOf(message.chat))
    if (!waiter) return false
    if (String(message.userId) !== String(waiter.requester)) return false

    const question = waiter.question
    const options = question.options ?? []
    const text = String(message.text ?? '').trim()
    if (text === '') return false

    if (options.length === 0) {
      waiter.finish({ id: question.id, selected: [], custom: text })
      return true
    }

    if (question.multiSelect ?? question.multi_select) {
      const picks = text.split(/[,，\s]+/).map((part) => Number(part))
      if (picks.every((pick) => Number.isInteger(pick) && pick >= 1 && pick <= options.length)) {
        waiter.finish({ id: question.id, selected: picks.map((pick) => options[pick - 1].label) })
        return true
      }
      return false
    }

    const direct = options.findIndex((option) => option.label === text)
    if (direct >= 0) {
      waiter.finish({ id: question.id, selected: [options[direct].label] })
      return true
    }
    const index = Number(text)
    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      waiter.finish({ id: question.id, selected: [options[index - 1].label] })
      return true
    }
    waiter.finish({ id: question.id, selected: [], custom: text })
    return true
  }
}
