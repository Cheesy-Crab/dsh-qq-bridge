import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeEvent, textOf } from '../src/transport/onebot.js'

test('textOf reads strings and text segments', () => {
  assert.equal(textOf(' hi '), 'hi')
  assert.equal(textOf([{ type: 'text', data: { text: 'a' } }, { type: 'text', data: { text: 'b' } }]), 'ab')
})

test('textOf keeps media placeholders and drops at segments', () => {
  const message = [
    { type: 'at', data: { qq: '10000' } },
    { type: 'text', data: { text: ' look' } },
    { type: 'image', data: { file: 'x.png' } },
    { type: 'face', data: { id: '1' } },
  ]
  assert.equal(textOf(message), 'look[图片][表情]')
})

test('normalizeEvent maps private and group messages', () => {
  const privateEvent = normalizeEvent({
    post_type: 'message',
    message_type: 'private',
    user_id: 42,
    message_id: 7,
    message: [{ type: 'text', data: { text: 'hello' } }],
    time: 1,
  })
  assert.deepEqual(privateEvent.chat, { type: 'private', id: '42' })
  assert.equal(privateEvent.text, 'hello')
  assert.equal(privateEvent.id, '7')

  const groupEvent = normalizeEvent({
    post_type: 'message',
    message_type: 'group',
    group_id: 99,
    user_id: 42,
    message_id: 'g-1',
    message: [{ type: 'text', data: { text: 'hi' } }],
    time: 1,
  })
  assert.deepEqual(groupEvent.chat, { type: 'group', id: '99' })
  assert.equal(groupEvent.groupId, '99')
})

test('normalizeEvent marks @ mentions in group messages', () => {
  const base = {
    post_type: 'message',
    message_type: 'group',
    group_id: 99,
    user_id: 42,
    message_id: 'g-2',
    time: 1,
    self_id: 10000,
  }
  const mentioned = normalizeEvent({
    ...base,
    message: [{ type: 'at', data: { qq: '10000' } }, { type: 'text', data: { text: ' hi' } }],
  })
  assert.equal(mentioned.mentioned, true)
  assert.equal(mentioned.text, 'hi')

  const plain = normalizeEvent({
    ...base,
    message: [{ type: 'at', data: { qq: '999' } }, { type: 'text', data: { text: 'hi' } }],
  })
  assert.equal(plain.mentioned, false)
})

test('normalizeEvent ignores non-message and unknown message types', () => {
  assert.equal(normalizeEvent({ post_type: 'meta_event' }), null)
  assert.equal(normalizeEvent({ post_type: 'message', message_type: 'guild' }), null)
})
