import assert from 'node:assert/strict'
import test from 'node:test'

import { ApprovalBridge } from '../src/agent-ext/approval.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function bridgeWithHandlers(timeoutMs = 1000) {
  const handlers = []
  const sent = []
  const ctx = {
    on: (event, handler) => {
      handlers.push(handler)
      return () => {}
    },
  }
  const bridge = new ApprovalBridge({
    ctx,
    log: () => {},
    send: async (chat, text) => {
      sent.push({ chat, text })
    },
    timeoutMs,
  })
  bridge.register()
  return { bridge, handlers, sent }
}

const request = (sessionId, toolName = 'bash') => ({
  agent: { session: { header: { id: sessionId } } },
  toolName,
  reason: 'needs a shell',
})

test('untracked agents delegate to the next answerer', async () => {
  const { handlers } = bridgeWithHandlers()
  const outcome = await handlers[0](request('other'), () => 'next')
  assert.equal(outcome, 'next')
})

test('a tracked request is answered from the chat', async () => {
  const { bridge, handlers, sent } = bridgeWithHandlers()
  bridge.track('s1', { chat: { type: 'private', id: '42' }, level: 'L1', requester: '42' })

  const pending = handlers[0](request('s1'), () => 'next')
  await wait(10)
  assert.match(sent[0].text, /审批/)
  assert.match(sent[0].text, /bash/)

  assert.equal(bridge.tryAnswer({ chat: { type: 'private', id: '42' }, userId: '42', text: '1' }), true)
  assert.equal(await pending, 'allowed-once')
})

test('a rejection answer denies the request', async () => {
  const { bridge, handlers } = bridgeWithHandlers()
  bridge.track('s1', { chat: { type: 'private', id: '42' }, level: 'L1', requester: '42' })
  const pending = handlers[0](request('s1'), () => 'next')
  await wait(10)
  assert.equal(bridge.tryAnswer({ chat: { type: 'private', id: '42' }, userId: '42', text: '2' }), true)
  assert.equal(await pending, 'rejected')
})

test('only the requester can answer', async () => {
  const { bridge, handlers } = bridgeWithHandlers()
  bridge.track('s1', { chat: { type: 'private', id: '42' }, level: 'L1', requester: '42' })
  const pending = handlers[0](request('s1'), () => 'next')
  await wait(10)
  assert.equal(bridge.tryAnswer({ chat: { type: 'private', id: '42' }, userId: '99', text: '1' }), false)
  assert.equal(bridge.tryAnswer({ chat: { type: 'private', id: '42' }, userId: '42', text: '1' }), true)
  assert.equal(await pending, 'allowed-once')
})

test('guest requests fail closed without a prompt', async () => {
  const { bridge, handlers, sent } = bridgeWithHandlers()
  bridge.track('s1', { chat: { type: 'private', id: '42' }, level: 'L0', requester: '42' })
  const outcome = await handlers[0](request('s1'), () => 'next')
  assert.equal(outcome, 'rejected')
  assert.equal(sent.length, 0)
})

test('a timeout rejects the request', async () => {
  const { bridge, handlers } = bridgeWithHandlers(20)
  bridge.track('s1', { chat: { type: 'private', id: '42' }, level: 'L1', requester: '42' })
  const outcome = await handlers[0](request('s1'), () => 'next')
  assert.equal(outcome, 'rejected')
})
