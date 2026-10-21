// Minimal OneBot 11 client that impersonates NapCat for local verification.
// Usage: node scripts/fake-napcat.mjs [ws://127.0.0.1:6700/] ["message text"] [waitMs] [turns]
const url = process.argv[2] ?? 'ws://127.0.0.1:6700/'
const text = process.argv[3] ?? '只回复两个字：OK'
const waitMs = Number(process.argv[4] ?? 120000)
const turns = Math.max(1, Number(process.argv[5] ?? 1))

const ws = new WebSocket(url)
const baseId = Date.now()
let echoes = 0
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
  console.log(`[fake-napcat] connected to ${url} (turns=${turns})`)
  for (let index = 0; index < turns; index += 1) {
    const suffix = turns > 1 ? `（第${index + 1}条）` : ''
    ws.send(JSON.stringify({
      post_type: 'message',
      message_type: 'private',
      user_id: 10001,
      message_id: `demo-${baseId}-${index}`,
      message: [{ type: 'text', data: { text: text + suffix } }],
      time: Math.floor(Date.now() / 1000),
      self_id: 10000,
    }))
  }
})

ws.addEventListener('message', (event) => {
  let payload
  try {
    payload = JSON.parse(event.data)
  } catch {
    console.log(`[fake-napcat] non-json action=${event.data}`)
    return
  }
  echoes += 1
  console.log(`[fake-napcat] action#${echoes}=${event.data}`)
  // Answer the action so the bridge does not wait for its timeout.
  if (payload.echo !== undefined) {
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 8000 + echoes }, echo: payload.echo }))
  }
  if (echoes >= turns) setTimeout(() => finish(0), 50)
})

ws.addEventListener('error', (event) => {
  console.error('[fake-napcat] socket error:', event?.message ?? event)
  finish(2)
})

setTimeout(() => finish(echoes >= turns ? 0 : 1), waitMs)
