import assert from 'node:assert/strict'
import test from 'node:test'

import { installGroupPrompt } from '../src/agent-ext/prompts/group.prompt.js'
import { groupMessageText, groupPrincipal, quotaOwner } from '../src/qq/bridge.js'

test('group messages carry the sender QQ id; private messages do not', () => {
  assert.equal(groupMessageText({ chat: { type: 'group', id: '99' }, userId: '42', text: '你好' }), '[QQ:42] 你好')
  assert.equal(groupMessageText({ chat: { type: 'private', id: '42' }, userId: '42', text: '你好' }), '你好')
})

test('a group uses one principal for permission and quota', () => {
  assert.equal(groupPrincipal({ type: 'group', id: '99' }), 'qq-group:99')
  assert.equal(groupPrincipal({ type: 'private', id: '42' }), 'qq:42')
  assert.equal(quotaOwner({ type: 'group', id: '99', mention: '42' }), 'qq-group:99')
  assert.equal(quotaOwner({ type: 'private', id: '42' }), 'qq:42')
})

test('group prompt is only installed for group chats', () => {
  const sections = []
  const agent = { ctx: { systemPrompt: { section: (value) => sections.push(value) } } }
  const state = {}
  installGroupPrompt(agent, { type: 'private', id: '42' }, state, () => {})
  assert.equal(sections.length, 0)
  installGroupPrompt(agent, { type: 'group', id: '99' }, state, () => {})
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'qq-bridge:group')
  assert.match(sections[0].text, /不需要 \/bind/)
  assert.match(sections[0].text, /\[QQ:<QQ号>\]/)
  installGroupPrompt(agent, { type: 'group', id: '99' }, state, () => {})
  assert.equal(sections.length, 1)
})
