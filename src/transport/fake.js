/**
 * In-memory transport used by tests and by `transport.kind: fake`.
 * It records outbound messages instead of talking to QQ.
 */
export class FakeTransport {
  /** @param {{ log?: (level: string, message: string) => void }} [options] */
  constructor({ log } = {}) {
    this.log = log
    this.handlers = new Set()
    this.sent = []
    this.connected = false
  }

  async start() {
    this.connected = true
  }

  async stop() {
    this.connected = false
    this.handlers.clear()
  }

  /**
   * @param {(message: any) => void} handler
   * @returns {() => void} unsubscribe
   */
  onMessage(handler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /** Push one normalized inbound message as if it came from QQ. */
  inject(message) {
    for (const handler of this.handlers) handler(message)
  }

  /**
   * @param {{ type: 'private' | 'group', id: string }} chat
   * @param {string} text
   * @param {{ mention?: string }} [options]
   */
  async sendText(chat, text, options = {}) {
    this.sent.push({ chat, text, options })
    return { messageId: `fake-${this.sent.length}` }
  }

  status() {
    return { connected: this.connected, clients: this.connected ? 1 : 0, sent: this.sent.length }
  }
}
