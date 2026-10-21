import assert from 'node:assert/strict'
import test from 'node:test'

import { UserQuestionBridge } from '../src/questions.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function setup({ timeoutMs = 1000 } = {}) {
  const handlers = []
  const sent = []
  const chat = { type: 'private', id: '42' }
  const ctx = {
    on: (event, handler) => {
      handlers.push(handler)
      return () => {}
    },
  }
  const bridge = new UserQuestionBridge({
    ctx,
    log: () => {},
    send: async (target, text) => sent.push({ target, text }),
    resolveChat: () => chat,
    timeoutMs,
  })
  bridge.register()
  return { bridge, handlers, sent, chat }
}

const request = (questions) => ({
  agent: { session: { header: { id: 's1' } } },
  questions,
})

test('untracked sessions delegate to the next answerer', async () => {
  const handlers = []
  const bridge = new UserQuestionBridge({
    ctx: { on: (_event, handler) => handlers.push(handler) },
    log: () => {},
    send: async () => {},
    resolveChat: () => undefined,
  })
  bridge.register()
  assert.equal(await handlers[0](request([{ id: 'q', question: 'hi' }]), () => 'next'), 'next')
})

test('option index answers with the option label', async () => {
  const { bridge, handlers, sent, chat } = setup()
  const pending = handlers[0](request([{
    id: 'q',
    header: '选择',
    question: '选哪个？',
    options: [{ label: '甲' }, { label: '乙', description: '第二个' }],
  }]), () => 'next')
  await wait(10)
  assert.match(sent[0].text, /1\. 甲/)
  assert.match(sent[0].text, /2\. 乙 — 第二个/)

  assert.equal(bridge.tryAnswer({ chat, userId: '42', text: '2' }), true)
  assert.deepEqual(await pending, { answers: [{ id: 'q', selected: ['乙'] }] })
})

test('free text becomes a custom answer', async () => {
  const { bridge, handlers, chat } = setup()
  const pending = handlers[0](request([{ id: 'q', question: '名字？' }]), () => 'next')
  await wait(10)
  assert.equal(bridge.tryAnswer({ chat, userId: '42', text: '我的项目' }), true)
  assert.deepEqual(await pending, { answers: [{ id: 'q', selected: [], custom: '我的项目' }] })
})

test('multi select accepts comma-separated indexes', async () => {
  const { bridge, handlers, chat } = setup()
  const pending = handlers[0](request([{
    id: 'q',
    question: '选多个',
    multi_select: true,
    options: [{ label: '一' }, { label: '二' }, { label: '三' }],
  }]), () => 'next')
  await wait(10)
  assert.equal(bridge.tryAnswer({ chat, userId: '42', text: '1,3' }), true)
  assert.deepEqual(await pending, { answers: [{ id: 'q', selected: ['一', '三'] }] })
})

test('only the requester can answer', async () => {
  const { bridge, handlers, chat } = setup({ timeoutMs: 30 })
  const pending = handlers[0](request([{ id: 'q', question: 'hi' }]), () => 'next')
  await wait(10)
  assert.equal(bridge.tryAnswer({ chat, userId: '99', text: 'x' }), false)
  const outcome = await pending
  assert.match(outcome.answers[0].custom, /超时/)
})

test('a timeout yields an unanswered custom answer', async () => {
  const { handlers } = setup({ timeoutMs: 20 })
  const outcome = await handlers[0](request([{ id: 'q', question: 'hi' }]), () => 'next')
  assert.deepEqual(outcome.answers, [{ id: 'q', selected: [], custom: '（用户超时未回复）' }])
})
