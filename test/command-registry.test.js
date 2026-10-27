import assert from 'node:assert/strict'
import test from 'node:test'

import { CommandRegistry } from '../src/qq/command-registry.js'

test('dynamic qq commands can be added and removed', () => {
  const registry = new CommandRegistry()
  const dispose = registry.register({ name: 'demo', handler: async () => 'ok' })
  assert.equal(registry.get('demo').handler instanceof Function, true)
  assert.equal(registry.list().length, 1)
  dispose()
  assert.equal(registry.get('demo'), undefined)
})
