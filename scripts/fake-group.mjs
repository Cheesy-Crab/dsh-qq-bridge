// Group smoke test: one message without @ (must be ignored) and one with @.
// Usage: node scripts/fake-group.mjs [ws://127.0.0.1:6700/]
const url = process.argv[2] ?? 'ws://127.0.0.1:6700/'
const ws = new WebSocket(url)
const baseId = Date.now()
let replies = 0
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
  console.log(`[fake-group] connected to ${url}`)
  ws.send(JSON.stringify({
    post_type: 'message',
    message_type: 'group',
    group_id: 20001,
    user_id: 10001,
    message_id: `g-${baseId}-0`,
    message: [{ type: 'text', data: { text: '这条没有 at 应该被忽略' } }],
    time: Math.floor(Date.now() / 1000),
    self_id: 10000,
  }))
  setTimeout(() => {
    ws.send(JSON.stringify({
      post_type: 'message',
      message_type: 'group',
      group_id: 20001,
      user_id: 10001,
      message_id: `g-${baseId}-1`,
      message: [
        { type: 'at', data: { qq: '10000' } },
        { type: 'text', data: { text: ' 只回复两个字：OK' } },
      ],
      time: Math.floor(Date.now() / 1000),
      self_id: 10000,
    }))
  }, 300)
})

ws.addEventListener('message', (event) => {
  const payload = JSON.parse(event.data)
  replies += 1
  console.log(`[fake-group] reply#${replies}=${event.data}`)
  if (payload.echo !== undefined) {
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 8000 }, echo: payload.echo }))
  }
  // Give a wrongly-processed second message time to show up.
  setTimeout(() => finish(replies === 1 ? 0 : 1), 4000)
})

ws.addEventListener('error', (event) => {
  console.error('[fake-group] socket error:', event?.message ?? event)
  finish(2)
})

setTimeout(() => finish(1), 90000)
