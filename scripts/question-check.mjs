// Ask the agent to use ask_user_question, answer it from the QQ side, and wait
// for the follow-up text. Verifies the user-questions bridge end to end.
// Usage: node scripts/question-check.mjs [ws://127.0.0.1:6700/] [userId]
const url = process.argv[2] ?? 'ws://127.0.0.1:6700/'
const userId = Number(process.argv[3] ?? 10001)
const ws = new WebSocket(url)
let answered = false
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
    message_id: `q-${Date.now()}`,
    message: [{ type: 'text', data: { text: '请用 ask_user_question 工具问我一个选择题：选 A 还是 B。等我回答后再继续，最后回复我你的选择结果。' } }],
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
  if (!text) return

  if (!answered && text.includes('【提问】')) {
    answered = true
    console.log('[question] got prompt:\n' + text)
    ws.send(JSON.stringify({
      post_type: 'message',
      message_type: 'private',
      user_id: userId,
      message_id: `qa-${Date.now()}`,
      message: [{ type: 'text', data: { text: '1' } }],
      time: Math.floor(Date.now() / 1000),
      self_id: 10000,
    }))
    return
  }
  if (answered) {
    console.log('[question] follow-up:', text.replace(/\n/g, ' ').slice(0, 300))
    finish(0)
  }
})

ws.addEventListener('error', (event) => {
  console.error('[question] socket error:', event?.message ?? event)
  finish(2)
})

setTimeout(() => {
  console.error('[question] timeout')
  finish(1)
}, 150000)
