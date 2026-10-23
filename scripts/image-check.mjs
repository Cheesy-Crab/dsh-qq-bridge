// Send an image to the bridge and ask the agent where it was saved.
// Usage: node scripts/image-check.mjs [ws://127.0.0.1:6700/] [userId]
const url = process.argv[2] ?? 'ws://127.0.0.1:6700/'
const userId = Number(process.argv[3] ?? 10001)
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
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
    message_id: `img-${Date.now()}`,
    message: [
      { type: 'text', data: { text: '我刚发的图片保存到哪个路径？只回复文件路径。' } },
      { type: 'image', data: { file: `base64://${PNG}`, summary: 'test' } },
    ],
    time: Math.floor(Date.now() / 1000),
    self_id: 10000,
  }))
})

ws.addEventListener('message', (event) => {
  let payload
  try {
    payload = JSON.parse(event.data)
  } catch {
    return
  }
  if (payload.echo !== undefined) {
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: payload.echo }))
  }
  const segments = payload?.params?.message ?? []
  const text = segments.map((segment) => segment?.data?.text ?? '').join('')
  if (text) {
    console.log('[image] reply:', text.replace(/\n/g, ' ').slice(0, 500))
    finish(0)
  }
})

ws.addEventListener('error', (event) => {
  console.error('[image] socket error:', event?.message ?? event)
  finish(2)
})

setTimeout(() => {
  console.error('[image] timeout')
  finish(1)
}, 120000)
