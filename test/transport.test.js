import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { QqBridge } from '../src/qq/bridge.js'
import { normalizeConfig } from '../src/core/config.js'
import { OneBotTransport } from '../src/transport/onebot.js'
import { ChatAgentManager } from '../src/workspace/chat.js'
import { UserStore } from '../src/access/users.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function testHost() {
  return {
    createUserStore: (options) => new UserStore(options),
    createSessionManager: (options) => new ChatAgentManager(options),
    registerExtensions: () => {},
    extensions: { sessionReady: () => {}, turnEnd: () => {} },
    access: { normalizeCapabilities: (v) => v, normalizeLevel: (v) => v, atLeast: () => true, toolAllowed: () => true },
    forwardMediaOutputs: () => {},
  }
}

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await wait(25)
  }
  return predicate()
}

async function openClient(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  return ws
}

test('reverse websocket receives events and answers actions', async () => {
  const transport = new OneBotTransport({ host: '127.0.0.1', port: 0, log: () => {} })
  await transport.start()
  const ws = await openClient(`ws://127.0.0.1:${transport.port}/`)

  const actions = []
  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    actions.push(payload)
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 9000 + actions.length }, echo: payload.echo }))
  })

  const received = []
  const off = transport.onMessage((message) => received.push(message))
  ws.send(JSON.stringify({
    post_type: 'message',
    message_type: 'private',
    user_id: 42,
    message_id: 'm-1',
    message: [{ type: 'text', data: { text: 'hello' } }],
    time: 1,
    self_id: 10000,
  }))
  assert.equal(await waitFor(() => received.length === 1), true)
  assert.equal(received[0].text, 'hello')

  assert.deepEqual(await transport.sendText({ type: 'private', id: '42' }, 'pong'), { message_id: 9001 })
  assert.deepEqual(await transport.sendText({ type: 'group', id: '99' }, 'group pong'), { message_id: 9002 })

  assert.equal(actions[0].action, 'send_private_msg')
  assert.equal(actions[0].params.user_id, 42)
  assert.equal(actions[1].action, 'send_group_msg')
  assert.equal(actions[1].params.group_id, 99)

  off()
  ws.close()
  await wait(50)
  await transport.stop()
})

test('transport adopts a reconnecting client', async () => {
  const transport = new OneBotTransport({ host: '127.0.0.1', port: 0, log: () => {} })
  await transport.start()
  const url = `ws://127.0.0.1:${transport.port}/`

  const first = await openClient(url)
  assert.equal(transport.status().connected, true)
  first.close()
  assert.equal(await waitFor(() => transport.status().connected === false), true)

  const second = await openClient(url)
  assert.equal(transport.status().connected, true)
  second.close()
  assert.equal(await waitFor(() => transport.status().connected === false), true)

  await transport.stop()
})

test('sendImage posts a base64 image segment', async () => {
  const transport = new OneBotTransport({ host: '127.0.0.1', port: 0, log: () => {} })
  await transport.start()
  const ws = await openClient(`ws://127.0.0.1:${transport.port}/`)
  const actions = []
  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    actions.push(payload)
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: payload.echo }))
  })

  const file = path.join(os.tmpdir(), `qq-shot-${Date.now()}.jpg`)
  fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  await transport.sendImage({ type: 'private', id: '42' }, file)
  assert.equal(actions[0].action, 'send_private_msg')
  assert.equal(actions[0].params.message[0].type, 'image')
  assert.match(actions[0].params.message[0].data.file, /^base64:\/\//)
  fs.rmSync(file, { force: true })

  ws.close()
  await wait(50)
  await transport.stop()
})

test('pending actions reject when the client disconnects', async () => {
  const transport = new OneBotTransport({ host: '127.0.0.1', port: 0, log: () => {} })
  await transport.start()
  const ws = await openClient(`ws://127.0.0.1:${transport.port}/`)

  const outcome = transport.sendText({ type: 'private', id: '7' }, 'hello').then(
    () => 'resolved',
    (error) => error.message,
  )
  await wait(50)
  ws.close()
  assert.match(await outcome, /disconnected/)
  await transport.stop()
})

test('group messages require a mention and replies carry an at', async () => {
  const config = normalizeConfig({
    transport: { kind: 'fake' },
    stateFile: path.join(os.tmpdir(), `qq-bridge-group-${Date.now()}`, 'state.json'),
  })
  const bridge = new QqBridge({ ctx: {}, config, root: '/tmp/qq', log: () => {}, host: testHost() })
  await bridge.start()

  bridge.transport.inject({ id: 'g0', chat: { type: 'group', id: '99' }, userId: '42', text: '/help', mentioned: false })
  await wait(20)
  assert.equal(bridge.transport.sent.length, 1)
  assert.match(bridge.transport.sent[0].text, /先 @机器人/)
  assert.equal(bridge.transport.sent[0].options.mention, '42')

  bridge.transport.inject({ id: 'g1', chat: { type: 'group', id: '99' }, userId: '42', text: 'hello', mentioned: false })
  await wait(20)
  assert.equal(bridge.transport.sent.length, 1)

  bridge.transport.inject({ id: 'g2', chat: { type: 'group', id: '99' }, userId: '42', text: '/help', mentioned: true })
  await wait(30)
  assert.equal(bridge.transport.sent.length, 2)
  assert.equal(bridge.transport.sent[1].options.mention, '42')
  assert.match(bridge.transport.sent[1].text, /可用指令/)

  await bridge.stop()
})

test('bridge echoes once and deduplicates repeated ids', async () => {
  const config = normalizeConfig({
    transport: { kind: 'fake', echo: true },
    stateFile: path.join(os.tmpdir(), `qq-bridge-test-${Date.now()}`, 'state.json'),
  })
  const bridge = new QqBridge({ ctx: {}, config, root: '/tmp/qq', log: () => {}, host: testHost() })
  await bridge.start()

  const message = { id: 'm-1', chat: { type: 'private', id: '42' }, text: 'hi' }
  bridge.transport.inject(message)
  bridge.transport.inject(message)
  await wait(50)

  assert.equal(bridge.transport.sent.length, 1)
  assert.match(bridge.transport.sent[0].text, /收到：hi/)
  assert.deepEqual(bridge.transport.sent[0].chat, { type: 'private', id: '42' })

  bridge.transport.inject({ id: 'm-2', chat: { type: 'group', id: '99' }, userId: '42', text: 'hello group', mentioned: true })
  await wait(50)
  assert.equal(bridge.transport.sent.length, 2)
  assert.deepEqual(bridge.transport.sent[1].chat, { type: 'group', id: '99', mention: '42' })

  await bridge.stop()
})


