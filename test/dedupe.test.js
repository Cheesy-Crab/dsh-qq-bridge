import assert from 'node:assert/strict'
import test from 'node:test'

import { DedupeStore } from '../src/transport/dedupe.js'

test('dedupe marks the first sighting and rejects repeats', () => {
  const dedupe = new DedupeStore()
  assert.equal(dedupe.seen('a'), false)
  assert.equal(dedupe.seen('a'), true)
  assert.equal(dedupe.seen('b'), false)
})

test('dedupe expires entries after the ttl', () => {
  let now = 1000
  const dedupe = new DedupeStore({ ttlMs: 500, now: () => now })
  assert.equal(dedupe.seen('a'), false)
  now = 1400
  assert.equal(dedupe.seen('a'), true)
  now = 1600
  assert.equal(dedupe.seen('a'), false)
})

test('dedupe drops the oldest entries at capacity', () => {
  const dedupe = new DedupeStore({ max: 2 })
  dedupe.seen('a')
  dedupe.seen('b')
  dedupe.seen('c')
  assert.equal(dedupe.size, 2)
  assert.equal(dedupe.seen('a'), false)
})
