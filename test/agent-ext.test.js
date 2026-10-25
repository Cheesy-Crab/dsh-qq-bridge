import assert from 'node:assert/strict'
import test from 'node:test'

import { qqBuiltinExtensions } from '../src/agent-ext/builtins.js'
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
  assert.deepEqual(extensions.map((item) => item.name), ['qq:prompt', 'qq:visual-design', 'qq:policy', 'qq:present'])
})
