import assert from 'node:assert/strict'
import test from 'node:test'

import { qqBuiltinExtensions } from '../src/agent-ext/builtins.js'
import { forwardGeneratedImages } from './helpers/generated-images.js'
import { forwardPresentedImages } from '../src/agent-ext/present.js'
import { AgentExtensionRegistry } from '@dsh/platform-core'

test('extensions run in registration order for session and turn hooks', async () => {
  const calls = []
  const registry = new AgentExtensionRegistry({ log: () => {} })
  registry.register({
    name: 'first',
    onSession: () => calls.push('session:first'),
    onTurnEnd: () => calls.push('turn:first'),
  })
  registry.register({
    name: 'second',
    onSession: () => calls.push('session:second'),
    onTurnEnd: () => calls.push('turn:second'),
  })

  await registry.sessionReady({})
  await registry.turnEnd({})
  assert.deepEqual(calls, ['session:first', 'session:second', 'turn:first', 'turn:second'])
})

test('a failing extension does not block the others', async () => {
  const calls = []
  const registry = new AgentExtensionRegistry({ log: () => {} })
  registry.register({
    name: 'bad',
    onTurnEnd: () => {
      throw new Error('boom')
    },
  })
  registry.register({ name: 'good', onTurnEnd: () => calls.push('good') })

  await registry.turnEnd({})
  assert.deepEqual(calls, ['good'])
})

test('duplicate names and empty names are rejected', () => {
  const registry = new AgentExtensionRegistry()
  registry.register({ name: 'one' })
  assert.throws(() => registry.register({ name: 'one' }), /already registered/)
  assert.throws(() => registry.register({ name: '' }), /non-empty name/)
})

test('disposer removes an extension', async () => {
  const calls = []
  const registry = new AgentExtensionRegistry()
  const dispose = registry.register({ name: 'temp', onSession: () => calls.push('temp') })
  dispose()
  await registry.sessionReady({})
  assert.deepEqual(calls, [])
})

test('QQ built-ins are ordinary registrations', () => {
  const extensions = qqBuiltinExtensions({ approval: {}, log: () => {} })
  assert.deepEqual(extensions.map((item) => item.name), ['qq:group', 'qq:prompt', 'qq:policy', 'qq:present', 'qq:generated-images'])
})

test('presented images are read from the raw event log, not just the surface', async () => {
  // `deliverables/presented` is host bookkeeping: snapshotEvents() may hide it.
  const section = { type: 'deliverables/presented', seq: 7, data: { files: [{ path: '/ws/shot.png' }] } }
  const session = {
    header: { id: 'sess-test' },
    seq: 9,
    ownEvents: () => [{ type: 'turn/start', seq: 5 }, section, { type: 'turn/end', seq: 8 }],
    snapshotEvents: () => [{ type: 'turn/start', seq: 5 }, { type: 'turn/end', seq: 8 }],
  }
  const sent = []
  await forwardPresentedImages({
    sendImage: async (_chat, file) => sent.push(file),
    chat: {},
    session,
    state: {},
    fromSeq: 5,
    log: () => {},
  })
  assert.deepEqual(sent, [section.data.files[0].path])
})

test('image-gen results are forwarded once and skipped when already presented', async () => {
  const events = [
    { type: 'tool/result', data: { meta: { kind: 'dsh-image-gen', savedTo: '/ws/a.png' } } },
    { type: 'deliverables/presented', data: { files: [{ path: '/ws/b.png' }] } },
    { type: 'tool/result', data: { meta: { kind: 'dsh-image-gen', savedTo: '/ws/b.png' } } },
    { type: 'tool/result', data: { meta: { kind: 'dsh-image-gen-batch', images: [{ savedTo: '/ws/c.jpg' }] } } },
  ]
  const session = { snapshotEvents: () => events }
  const sent = []
  await forwardGeneratedImages({
    sendImage: async (_chat, file) => sent.push(file),
    chat: {},
    session,
    fromSeq: 0,
    log: () => {},
  })
  assert.deepEqual(sent, ['/ws/a.png', '/ws/c.jpg'])
})

test('generated image cost is charged once and reported as remaining quota', async () => {
  const events = [
    { type: 'tool/result', data: { meta: { kind: 'dsh-image-gen', savedTo: '/ws/a.png', cost: { total: 4, base: 3 } } } },
    { type: 'deliverables/presented', data: { files: [{ path: '/ws/a.png' }] } },
  ]
  const session = { snapshotEvents: () => events }
  const charges = []
  const texts = []
  await forwardGeneratedImages({
    sendImage: async () => {},
    sendText: async (_chat, text) => texts.push(text),
    charge: async ({ cost }) => {
      charges.push(cost)
      return { spent: cost, remaining: 6, overdraw: false }
    },
    chat: {},
    session,
    fromSeq: 0,
    log: () => {},
  })
  assert.deepEqual(charges, [4])
  assert.match(texts[0], /消耗 4 Buzz，剩余额度 6 Buzz/)
})
