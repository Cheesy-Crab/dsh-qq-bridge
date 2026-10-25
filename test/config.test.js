import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeConfig } from '../src/core/config.js'

test('config fills nested onebot defaults', () => {
  const config = normalizeConfig({ transport: { onebot: { port: 0 } } })
  assert.equal(config.transport.kind, 'onebot')
  assert.equal(config.transport.echo, false)
  assert.equal(config.transport.onebot.host, '127.0.0.1')
  assert.equal(config.transport.onebot.port, 0)
  assert.equal(config.transport.onebot.mode, 'reverse')
})

test('config rejects bad transport values', () => {
  assert.throws(() => normalizeConfig({ transport: { kind: 'carrier-pigeon' } }), /transport.kind/)
  assert.throws(() => normalizeConfig({ transport: { onebot: { port: 70000 } } }), /port/)
  assert.throws(() => normalizeConfig({ transport: { onebot: { mode: 'forward' } } }), /mode/)
  assert.throws(() => normalizeConfig({ transport: { onebot: { path: 'ws' } } }), /path/)
  assert.throws(() => normalizeConfig({ transport: { echo: 'yes' } }), /echo/)
})

test('config keeps group and limit defaults', () => {
  const config = normalizeConfig({})
  assert.equal(config.group.sessionScope, 'shared')
  assert.equal(config.limits.maxChars, 1800)
  assert.equal(config.workspacesRoot, '')
  assert.equal(config.sandbox.modeByLevel.L1, 'read-only')
  assert.equal(config.sandbox.modeByLevel.L3, 'danger-full-access')
  assert.deepEqual(config.access.whitelist, {})
  assert.deepEqual(config.commandPrefix, ['/', '!', '#'])
  assert.equal(config.questions.timeoutSec, 1800)
  assert.equal(config.napcat.enabled, false)
  assert.equal(config.napcat.autoStart, false)
})

test('config accepts a custom prefix list', () => {
  const config = normalizeConfig({ commandPrefix: ['!', '。'] })
  assert.deepEqual(config.commandPrefix, ['!', '。'])
  assert.throws(() => normalizeConfig({ commandPrefix: [] }), /commandPrefix/)
})

test('config validates the capability whitelist', () => {
  const config = normalizeConfig({ access: { whitelist: { '42': ['workspace', 'write'] } } })
  assert.deepEqual(config.access.whitelist['42'], ['workspace', 'write'])
  assert.throws(
    () => normalizeConfig({ access: { whitelist: { '42': ['root'] } } }),
    /unknown capability/,
  )
})

test('config rejects an unknown sandbox mode', () => {
  assert.throws(
    () => normalizeConfig({ sandbox: { modeByLevel: { L3: 'root' } } }),
    /sandbox.modeByLevel.L3/,
  )
})
