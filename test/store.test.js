import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { JsonStore, resolveStateFile } from '../src/core/store.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-store-'))

test.after(() => fs.rmSync(dir, { recursive: true, force: true }))

test('state file defaults under DSH_HOME', () => {
  assert.equal(
    resolveStateFile(undefined, { DSH_HOME: path.join(dir, 'home') }),
    path.join(dir, 'home', 'storages', 'qq-bridge', 'state.json'),
  )
})

test('store persists chat mappings across instances', () => {
  const file = path.join(dir, 'state.json')
  const first = new JsonStore({ file })
  first.load()
  first.set('private:42', { workspaceId: 'w1', sessionId: 's1' })

  const second = new JsonStore({ file })
  second.load()
  assert.deepEqual(second.get('private:42'), { workspaceId: 'w1', sessionId: 's1' })
})

test('store ignores a corrupt file instead of throwing', () => {
  const file = path.join(dir, 'broken.json')
  fs.writeFileSync(file, '{not json')
  const store = new JsonStore({ file, log: () => {} })
  store.load()
  assert.equal(store.get('private:1'), undefined)
})

test('store ignores an unexpected shape', () => {
  const file = path.join(dir, 'shape.json')
  fs.writeFileSync(file, JSON.stringify({ version: 99, chats: [] }))
  const store = new JsonStore({ file, log: () => {} })
  store.load()
  assert.equal(store.get('private:1'), undefined)
})
