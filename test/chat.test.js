import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ChatAgentManager } from '../src/agent/chat.js'
import { normalizeConfig } from '../src/config.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-chat-'))

test.after(() => fs.rmSync(root, { recursive: true, force: true }))

function fakeEnvironment({ reply = 'pong', error, hang = false, presented = [] } = {}) {
  const created = { workspaces: [], agents: [] }
  const followups = []
  const events = []
  const images = []
  let idleCalls = 0
  const presentedEvents = presented.map((file) => ({
    type: 'deliverables/presented',
    data: { files: [{ path: file, description: 'test' }] },
  }))
  const session = {
    seq: 3,
    header: { id: 'sess-test' },
    append: (type, data) => events.push({ type, data }),
    deriveMessages: () => (reply === '' ? [] : [{ role: 'assistant', content: [{ type: 'text', text: reply }] }]),
    snapshotEvents: () => [
      ...(error ? [{ type: 'turn/end', data: { reason: { kind: 'error', error: { message: error } } } }] : []),
      ...presentedEvents,
    ],
  }
  const agent = {
    session,
    status: 'idle',
    followup: (message) => followups.push(message),
    whenIdle: () => {
      idleCalls += 1
      return hang ? new Promise(() => {}) : Promise.resolve()
    },
    cancel: () => {},
  }
  const handle = { agent, dispose: async () => {} }
  const workspaces = new Map()
  const services = {
    workspaceRegistry: {
      list: () => [...workspaces.values()],
      create: async (dir, title) => {
        let workspace = workspaces.get(dir)
        if (!workspace) {
          workspace = {
            id: dir,
            path: dir,
            title,
            sessionIds: [],
            attachSession: async (id) => {
              if (!workspace.sessionIds.includes(id)) workspace.sessionIds.push(id)
            },
          }
          workspaces.set(dir, workspace)
          created.workspaces.push({ dir, title })
        }
        return workspace
      },
      archiveSession: async () => {},
      unarchiveSession: async () => {},
      delete: async (id) => {
        workspaces.delete(id)
      },
    },
    agents: {
      get: () => undefined,
      resume: async () => handle,
      create: async (options) => {
        created.agents.push(options)
        return handle
      },
    },
    approval: { setPolicy: () => {} },
  }
  const ctx = { get: (name) => services[name] }
  const sent = []
  const manager = new ChatAgentManager({
    ctx,
    config: normalizeConfig({ transport: { kind: 'fake' }, agent: { turnTimeoutMs: 30 } }),
    root,
    log: () => {},
    send: async (chat, text) => {
      sent.push({ chat, text })
    },
    sendImage: async (chat, file, options) => {
      images.push({ chat, file, options })
    },
    store: { load: () => {}, get: () => undefined, set: () => {} },
  })
  return { manager, created, sent, images, session, followups, events, idleCalls: () => idleCalls }
}

test('first message provisions a workspace and session, later messages reuse it', async () => {
  const { manager, created, sent, followups, events } = fakeEnvironment()

  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'hello' })
  await manager.handle({ id: 'm2', chat: { type: 'private', id: '42' }, text: 'again' })

  assert.equal(created.workspaces.length, 1)
  assert.match(created.workspaces[0].dir, /u-[0-9a-f]{8}[\\/]default-[0-9a-f]{6}$/)
  assert.equal(created.agents.length, 1)
  assert.equal(created.agents[0].agentOptions.provider, 'deepseek-official')
  assert.equal(followups[0].role, 'user')
  assert.equal(followups[0].id, 'qq-private-42-m1')
  assert.deepEqual(events.filter((event) => event.type === 'sandbox/mode').map((event) => event.data.mode), ['read-only'])
  assert.deepEqual(sent, [
    { chat: { type: 'private', id: '42' }, text: 'pong' },
    { chat: { type: 'private', id: '42' }, text: 'pong' },
  ])
})

test('L3 sessions get danger-full-access', async () => {
  const { manager, events } = fakeEnvironment()
  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'hello' }, { level: 'L3' })
  assert.deepEqual(events.filter((event) => event.type === 'sandbox/mode').map((event) => event.data.mode), ['danger-full-access'])
})

test('whitelisted write capability upgrades the sandbox to workspace-write', async () => {
  const { manager, events } = fakeEnvironment()
  await manager.handle(
    { id: 'm1', chat: { type: 'private', id: '42' }, text: 'hello' },
    { level: 'L1', capabilities: ['read', 'write'] },
  )
  assert.deepEqual(events.filter((event) => event.type === 'sandbox/mode').map((event) => event.data.mode), ['workspace-write'])
})

test('failed turns are reported to the chat', async () => {
  const { manager, sent } = fakeEnvironment({ error: 'no API key' })
  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'hello' })
  assert.equal(sent.length, 1)
  assert.match(sent[0].text, /处理失败：no API key/)
})

test('a hung turn times out and cancels', async () => {
  const { manager, sent } = fakeEnvironment({ hang: true })
  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'hello' })
  assert.equal(sent.length, 1)
  assert.match(sent[0].text, /超时/)
})

test('long replies are split into QQ-sized chunks', async () => {
  const { manager, sent } = fakeEnvironment({ reply: 'abcd' })
  manager.config.limits.maxChars = 2
  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'hello' })
  assert.deepEqual(sent.map((item) => item.text), ['ab', 'cd'])
})

test('group chats provision one workspace under g-<hash>', async () => {
  const { manager, created } = fakeEnvironment()
  await manager.handle({ id: 'g1', chat: { type: 'group', id: '999' }, text: 'hello' }, { level: 'L1' })
  assert.equal(created.workspaces.length, 1)
  assert.match(created.workspaces[0].dir, /g-[0-9a-f]{8}$/)
  assert.equal(created.workspaces[0].title, 'QQ Group 999')
})

test('named sessions persist labels and can be selected by name', async () => {
  const { manager } = fakeEnvironment()
  const chat = { type: 'private', id: '42' }

  await manager.newSession(chat, 'L1', 'test')
  let list = await manager.listSessions(chat, 'L1')
  assert.equal(list.labels[list.activeSessionId], 'test')

  await manager.newSession(chat, 'L1', 'other')
  list = await manager.listSessions(chat, 'L1')
  assert.equal(list.labels[list.activeSessionId], 'other')

  await manager.useSession(chat, 'test', 'L1')
  list = await manager.listSessions(chat, 'L1')
  assert.equal(list.labels[list.activeSessionId], 'test')

  assert.equal(await manager.renameSession(chat, 'renamed'), 'renamed')
  list = await manager.listSessions(chat, 'L1')
  assert.equal(list.labels[list.activeSessionId], 'renamed')
})

test('deleting a workspace removes the registration but keeps the path', async () => {
  const { manager } = fakeEnvironment()
  const chat = { type: 'private', id: '42' }
  await manager.newSession(chat, 'L1', 'test')

  const before = await manager.listWorkspaces(chat)
  assert.equal(before.length, 1)
  const removed = await manager.deleteWorkspace(chat, before[0].title, 'L1')
  assert.match(removed.path, /u-[0-9a-f]{8}/)
  assert.equal((await manager.listWorkspaces(chat)).length, 0)
})

test('presented images are forwarded to the QQ chat', async () => {
  const { manager, images } = fakeEnvironment({ presented: ['E:\\ws\\a.png', 'E:\\ws\\b.jpg'] })
  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'show me' })
  assert.deepEqual(images.map((item) => item.file), ['E:\\ws\\a.png', 'E:\\ws\\b.jpg'])
  assert.deepEqual(images[0].chat, { type: 'private', id: '42' })
})

test('presented non-image files are ignored', async () => {
  const { manager, images } = fakeEnvironment({ presented: ['E:\\ws\\report.pdf'] })
  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'show me' })
  assert.equal(images.length, 0)
})

test('archiving hides a session and unarchive restores it', async () => {
  const { manager } = fakeEnvironment()
  const chat = { type: 'private', id: '42' }

  await manager.newSession(chat, 'L1', 'test')
  await manager.archiveSession(chat)
  let list = await manager.listSessions(chat, 'L1')
  assert.equal(list.sessionIds.length, 0)
  assert.equal(list.archived.length, 1)

  await manager.unarchiveSession(chat, 'test')
  list = await manager.listSessions(chat, 'L1')
  assert.equal(list.sessionIds.length, 1)
  assert.equal(list.archived.length, 0)
})
