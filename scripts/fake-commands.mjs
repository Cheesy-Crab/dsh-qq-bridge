// Sequential command smoke test for the QQ bridge.
// Usage: node scripts/fake-commands.mjs [ws://127.0.0.1:6700/] ["/ws list;/whoami"] [userId]
const url = process.argv[2] ?? 'ws://127.0.0.1:6700/'
const userId = Number(process.argv[4] ?? 10001)
const steps = process.argv[3]
  ? process.argv[3].split(';').map((step) => step.trim()).filter(Boolean)
  : [
      '/ws list',
      '/whoami',
      '/new',
      '/sessions',
      '/use 1',
      '只回复两个字：OK',
    ]

const ws = new WebSocket(url)
let pending = null
let settled = false
const baseId = Date.now()

const finish = (code) => {
  if (settled) return
  settled = true
  try {
    ws.close()
  } catch {}
  process.exit(code)
}

function waitReply(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = null
      reject(new Error('timeout waiting for a reply'))
    }, timeoutMs)
    pending = () => {
      clearTimeout(timer)
      pending = null
      resolve()
    }
  })
}

ws.addEventListener('message', (event) => {
  let payload
  try {
    payload = JSON.parse(event.data)
  } catch {
    console.log(`[fake-commands] non-json action=${event.data}`)
    return
  }
  const text = payload?.params?.message?.[0]?.data?.text ?? ''
  console.log(`[fake-commands] reply: ${text.replace(/\n/g, ' | ')}`)
  if (payload.echo !== undefined) {
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 9000 }, echo: payload.echo }))
  }
  if (pending) pending()
})

ws.addEventListener('open', async () => {
  console.log(`[fake-commands] connected to ${url}`)
  try {
    for (const [index, text] of steps.entries()) {
      const wait = waitReply()
      ws.send(JSON.stringify({
        post_type: 'message',
        message_type: 'private',
        user_id: userId,
        message_id: `cmd-${baseId}-${index}`,
        message: [{ type: 'text', data: { text } }],
        time: Math.floor(Date.now() / 1000),
        self_id: 10000,
      }))
      await wait
    }
    finish(0)
  } catch (error) {
    console.error('[fake-commands] failed:', error?.message ?? error)
    finish(1)
  }
})

ws.addEventListener('error', (event) => {
  console.error('[fake-commands] socket error:', event?.message ?? event)
  finish(2)
})
