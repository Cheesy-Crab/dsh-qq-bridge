import fs from 'node:fs'
import http from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'

/**
 * Extract OneBot image segments into a flat shape.
 * @param {unknown} message
 * @returns {{ file?: string, url?: string, fileId?: string, summary?: string }[]}
 */
export function imagesOf(message) {
  if (!Array.isArray(message)) return []
  return message
    .filter((segment) => segment?.type === 'image')
    .map((segment) => ({
      file: segment.data?.file,
      url: segment.data?.url,
      fileId: segment.data?.file_id ?? segment.data?.fileId,
      summary: segment.data?.summary,
    }))
}

const MAX_PAYLOAD = 2 * 1024 * 1024

/**
 * Pull the human-readable text out of an OneBot message (string or segment
 * array). Non-text segments become short placeholders; `at` segments are
 * dropped because they address the bot, not the conversation.
 * @param {unknown} message
 * @returns {string}
 */
export function textOf(message) {
  if (typeof message === 'string') return message.trim()
  if (!Array.isArray(message)) return ''
  const parts = []
  for (const segment of message) {
    switch (segment?.type) {
      case 'text':
        parts.push(segment.data?.text ?? '')
        break
      case 'image':
        parts.push('[图片]')
        break
      case 'face':
        parts.push('[表情]')
        break
      default:
        break
    }
  }
  return parts.join('').trim()
}

/**
 * Normalize a OneBot 11 message event into the bridge's internal shape.
 * @param {any} event
 * @returns {{ id: string, chat: { type: 'private' | 'group', id: string }, userId: string, groupId?: string, text: string, raw: any } | null}
 */
export function normalizeEvent(event) {
  if (!event || event.post_type !== 'message') return null
  const text = textOf(event.message) || (typeof event.raw_message === 'string' ? event.raw_message.trim() : '')
  if (event.message_type === 'private') {
    const id = event.message_id != null ? String(event.message_id) : `private:${event.user_id}:${event.time}`
    return {
      id,
      chat: { type: 'private', id: String(event.user_id) },
      userId: String(event.user_id),
      text,
      images: imagesOf(event.message),
      raw: event,
    }
  }
  if (event.message_type === 'group') {
    const id = event.message_id != null ? String(event.message_id) : `group:${event.group_id}:${event.user_id}:${event.time}`
    const segments = Array.isArray(event.message) ? event.message : []
    const atIds = segments
      .filter((segment) => segment?.type === 'at')
      .map((segment) => String(segment?.data?.qq ?? ''))
    return {
      id,
      chat: { type: 'group', id: String(event.group_id) },
      userId: String(event.user_id),
      groupId: String(event.group_id),
      mentioned: event.self_id != null && atIds.includes(String(event.self_id)),
      text,
      images: imagesOf(event.message),
      raw: event,
    }
  }
  return null
}

/**
 * OneBot 11 reverse WebSocket transport. The protocol client (NapCat /
 * LLOneBot / Lagrange) dials in; the bridge answers actions on the same socket.
 */
export class OneBotTransport {
  /**
   * @param {{ mode?: 'reverse', host?: string, port?: number, path?: string, accessTokenEnv?: string,
   *           requestTimeoutMs?: number, log?: (level: string, message: string) => void }} [options]
   */
  constructor({ mode = 'reverse', host = '127.0.0.1', port = 6700, path = '/', accessTokenEnv, requestTimeoutMs = 10000, log } = {}) {
    this.mode = mode
    this.host = host
    this.port = port
    this.path = path
    this.accessTokenEnv = accessTokenEnv
    this.requestTimeoutMs = requestTimeoutMs
    this.log = log
    this.server = undefined
    this.wss = undefined
    this.socket = undefined
    this.pending = new Map()
    this.seq = 0
    this.handlers = new Set()
    this.connected = false
    this.lastEventAt = undefined
    this.lastError = undefined
  }

  get token() {
    return this.accessTokenEnv ? process.env[this.accessTokenEnv] : undefined
  }

  async start() {
    if (this.mode !== 'reverse') throw new Error(`onebot transport mode "${this.mode}" is not implemented yet`)
    if (this.server) return
    this.server = http.createServer((_req, res) => {
      res.writeHead(426, { 'content-type': 'text/plain' })
      res.end('this endpoint accepts websocket upgrades only')
    })
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false })

    this.server.on('upgrade', (req, socket, head) => {
      let url
      try {
        url = new URL(req.url ?? '/', 'http://127.0.0.1')
      } catch {
        socket.destroy()
        return
      }
      if (this.path && this.path !== '/' && url.pathname !== this.path) {
        socket.destroy()
        return
      }
      if (!this.authorized(req, url)) {
        this.lastError = 'unauthorized websocket connection'
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        this.log?.('warn', 'onebot: rejected a connection with a bad or missing access token')
        return
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.adopt(ws))
    })

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        this.server.off('error', onError)
        resolve()
      }
      this.server.once('error', onError)
      this.server.once('listening', onListening)
      this.server.listen(this.port, this.host)
    })
    this.port = this.server.address().port
    this.log?.('info', `onebot reverse ws listening on ws://${this.host}:${this.port}${this.path === '/' ? '/' : this.path}`)
  }

  authorized(req, url) {
    const token = this.token
    if (!token) return true
    if (url.searchParams.get('access_token') === token) return true
    const header = req.headers.authorization
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7) === token
    }
    return false
  }

  adopt(socket) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.close(1000, 'replaced by a newer connection')
      } catch {
        // the old socket is already unusable
      }
    }
    this.socket = socket
    this.connected = true
    this.lastError = undefined
    this.log?.('info', 'onebot client connected')

    socket.on('message', (data) => this.handleMessage(data))
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = undefined
      this.connected = false
      this.rejectPending('onebot client disconnected')
      this.log?.('info', 'onebot client disconnected')
    })
    socket.on('error', (error) => {
      this.lastError = error?.message ?? String(error)
      this.log?.('error', `onebot socket error: ${this.lastError}`)
    })
  }

  handleMessage(data) {
    let payload
    try {
      payload = JSON.parse(data.toString())
    } catch {
      this.log?.('error', 'onebot: dropped a non-JSON frame')
      return
    }
    if (payload && payload.echo !== undefined) {
      this.settle(payload)
      return
    }
    if (payload?.post_type === 'message') {
      this.lastEventAt = Date.now()
      const message = normalizeEvent(payload)
      if (!message) return
      for (const handler of this.handlers) {
        try {
          handler(message)
        } catch (error) {
          this.log?.('error', `onebot message handler failed: ${error?.stack ?? error}`)
        }
      }
    }
  }

  settle(payload) {
    const entry = this.pending.get(payload.echo)
    if (!entry) return
    this.pending.delete(payload.echo)
    clearTimeout(entry.timer)
    if (payload.status === 'ok' || payload.retcode === 0) entry.resolve(payload.data ?? {})
    else entry.reject(new Error(`onebot action failed: status=${payload.status} retcode=${payload.retcode} ${payload.wording ?? ''}`.trim()))
  }

  /** Fail every in-flight action; used when the socket or transport goes away. */
  rejectPending(reason) {
    for (const [echo, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(reason))
      this.pending.delete(echo)
    }
  }

  /** @param {(message: any) => void} handler */
  onMessage(handler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /**
   * @param {{ type: 'private' | 'group', id: string }} chat
   * @param {string} text
   * @param {{ mention?: string }} [options]
   */
  async sendText(chat, text, options = {}) {
    const mention = chat.type === 'group' && options.mention
      ? [{ type: 'at', data: { qq: String(options.mention) } }, { type: 'text', data: { text: ` ${text}` } }]
      : [{ type: 'text', data: { text } }]
    if (chat.type === 'group') {
      return this.action('send_group_msg', { group_id: Number(chat.id), message: mention })
    }
    return this.action('send_private_msg', { user_id: Number(chat.id), message: mention })
  }

  /**
   * Send a local image file as an image message segment.
   * @param {{ type: 'private' | 'group', id: string }} chat
   * @param {string} file
   * @param {{ mention?: string }} [options]
   */
  async sendImage(chat, file, options = {}) {
    const data = fs.readFileSync(file)
    const image = { type: 'image', data: { file: `base64://${data.toString('base64')}` } }
    const message = chat.type === 'group' && options.mention
      ? [{ type: 'at', data: { qq: String(options.mention) } }, image]
      : [image]
    if (chat.type === 'group') {
      return this.action('send_group_msg', { group_id: Number(chat.id), message })
    }
    return this.action('send_private_msg', { user_id: Number(chat.id), message })
  }

  action(action, params) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error('onebot client is not connected'))
        return
      }
      const echo = `qqbridge-${Date.now()}-${++this.seq}`
      const timer = setTimeout(() => {
        this.pending.delete(echo)
        reject(new Error(`onebot action timed out: ${action}`))
      }, this.requestTimeoutMs)
      this.pending.set(echo, { resolve, reject, timer })
      try {
        this.socket.send(JSON.stringify({ action, params, echo }))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(echo)
        reject(error)
      }
    })
  }

  status() {
    return {
      connected: this.connected,
      clients: this.connected ? 1 : 0,
      lastEventAt: this.lastEventAt,
      lastError: this.lastError,
    }
  }

  async stop() {
    this.rejectPending('transport stopped')
    if (this.socket) {
      try {
        this.socket.close(1000, 'shutdown')
      } catch {
        // already closed
      }
      this.socket = undefined
    }
    this.connected = false
    if (this.wss) {
      for (const client of this.wss.clients) {
        try {
          client.terminate()
        } catch {
          // already gone
        }
      }
      await new Promise((resolve) => this.wss.close(() => resolve()))
      this.wss = undefined
    }
    if (this.server) {
      await new Promise((resolve) => this.server.close(() => resolve()))
      this.server = undefined
    }
  }
}
