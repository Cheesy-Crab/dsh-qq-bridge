import assert from 'node:assert/strict'
import test from 'node:test'

import { qqBuiltinExtensions } from '../src/agent-ext/builtins.js'
import { forwardGeneratedImages } from '../src/agent-ext/generated-images.js'
import { AgentExtensionRegistry } from '../src/agent-ext/registry.js'

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
  assert.deepEqual(extensions.map((item) => item.name), ['qq:prompt', 'qq:visual-design', 'qq:policy', 'qq:generated-images', 'qq:present'])
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
