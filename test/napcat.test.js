import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { isPortOpen, NapCatSupervisor } from '../src/napcat.js'

const config = (overrides = {}) => ({
  enabled: true,
  autoStart: false,
  command: '',
  cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'napcat-')),
  args: [],
  restart: false,
  restartDelayMs: 0,
  ...overrides,
})

test('isPortOpen sees a listening port and a closed one', async () => {
  const server = net.createServer().listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const port = server.address().port
  assert.equal(await isPortOpen(port), true)
  await new Promise((resolve) => server.close(resolve))
  assert.equal(await isPortOpen(port), false)
})

test('status reports not running when the port is closed', async () => {
  const server = net.createServer().listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))

  const supervisor = new NapCatSupervisor({ config: config(), log: () => {}, port })
  const status = await supervisor.status()
  assert.equal(status.running, false)
  assert.equal(status.managed, false)
  assert.equal(status.external, false)
})

test('an external OneBot client is reported and never started over', async () => {
  const supervisor = new NapCatSupervisor({
    config: config(),
    log: () => {},
    port: 6700,
    isConnected: () => true,
  })
  const status = await supervisor.status()
  assert.equal(status.running, true)
  assert.equal(status.external, true)
  assert.equal(status.managed, false)
  const started = await supervisor.start()
  assert.equal(started.external, true)
  assert.equal(started.managed, false)
})

test('start fails fast when the bundled directory is missing', async () => {
  const supervisor = new NapCatSupervisor({
    config: config({ cwd: path.join(os.tmpdir(), 'missing-napcat-dir') }),
    log: () => {},
    port: 1,
  })
  await assert.rejects(() => supervisor.start(), /NapCat 目录不存在/)
})
