// Verify /screenshot returns an image segment without printing the base64 body.
// Usage: node scripts/test-screenshot.mjs [ws://127.0.0.1:6700/] [userId]
const url = process.argv[2] ?? 'ws://127.0.0.1:6700/'
const userId = Number(process.argv[3] ?? 10001)
const ws = new WebSocket(url)
let settled = false

const finish = (code) => {
  if (settled) return
  settled = true
  try {
    ws.close()
  } catch {}
  process.exit(code)
}

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    post_type: 'message',
    message_type: 'private',
    user_id: userId,
    message_id: `shot-${Date.now()}`,
    message: [{ type: 'text', data: { text: '/screenshot' } }],
    time: Math.floor(Date.now() / 1000),
    self_id: 10000,
  }))
})

ws.addEventListener('message', (event) => {
  let payload
  try {
    payload = JSON.parse(event.data)
  } catch {
    console.log('[shot] non-json:', String(event.data).slice(0, 120))
    return
  }
  if (payload.echo !== undefined) {
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: payload.echo }))
  }
  const segments = payload?.params?.message ?? []
  const image = segments.find((segment) => segment.type === 'image')
  if (image) {
    console.log(`[shot] OK image segment bytes=${image.data.file.length} action=${payload.action}`)
    finish(0)
    return
  }
  const text = segments.map((segment) => segment?.data?.text ?? '').join('')
  if (text) console.log('[shot] text reply:', text)
})

ws.addEventListener('error', (event) => {
  console.error('[shot] socket error:', event?.message ?? event)
  finish(2)
})

setTimeout(() => {
  console.error('[shot] timeout waiting for image segment')
  finish(1)
}, 90000)
