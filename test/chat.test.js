import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ChatAgentManager } from '@dsh/session-core/manager'
import { normalizeConfig } from '../src/core/config.js'
import { forwardPresentedImages } from '../src/agent-ext/present.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-chat-'))

test.after(() => fs.rmSync(root, { recursive: true, force: true }))

function fakeEnvironment({ reply = 'pong', error, hang = false, presented = [] } = {}) {
  const created = { workspaces: [], agents: [] }
  const followups = []
  const events = []
  const sessionEvents = []
  const images = []
  let idleCalls = 0
  let seq = 3
  const emit = (type, data) => {
    seq += 1
    const event = { seq, type, data }
    sessionEvents.push(event)
    return event
  }
  const session = {
    get seq() {
      return seq
    },
    set seq(value) {
      seq = value
    },
    header: { id: 'sess-test' },
    append: (type, data) => events.push({ type, data }),
    deriveMessages: () => (reply === '' ? [] : [{ role: 'assistant', content: [{ type: 'text', text: reply }] }]),
    snapshotEvents: (from = 0) => sessionEvents.filter((event) => event.seq > from),
  }
  const agent = {
    session,
    status: 'idle',
    followup: (message) => {
      followups.push(message)
      for (const file of presented) emit('deliverables/presented', { files: [{ path: file, description: 'test' }] })
      if (error) {
        emit('turn/end', { reason: { kind: 'error', error: { message: error } } })
        return
      }
      if (reply !== '') {
        emit('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: reply }] } })
      }
      emit('turn/end', { reason: { kind: 'completed' } })
    },
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
    behavior: {
      turnEnd: (options) => forwardPresentedImages(options),
    },
  })
  return { manager, created, sent, images, session, followups, events, emit, idleCalls: () => idleCalls }
}

test('first message provisions a workspace and session, later messages reuse it', async () => {
  const { manager, created, sent, followups, events } = fakeEnvironment()

  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'hello' })
  await manager.handle({ id: 'm2', chat: { type: 'private', id: '42' }, text: 'again' })

  assert.equal(created.workspaces.length, 1)
  assert.match(created.workspaces[0].dir, /u-[0-9a-f]{8}[\\/]default-[0-9a-f]{6}$/)
  assert.equal(created.agents.length, 1)
  assert.equal(created.agents[0].agentOptions.provider, 'deepseek-account')
  assert.equal(followups[0].role, 'user')
  assert.equal(followups[0].id, 'qq-private-42-m1')
  assert.deepEqual(events.filter((event) => event.type === 'sandbox/mode').map((event) => event.data.mode), ['workspace-write'])
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
    { level: 'L1', accessGrants: ['read', 'write'] },
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

test('group replies mention the current sender, not the first session sender', async () => {
  const { manager, sent } = fakeEnvironment()
  await manager.handle({ id: 'g1', chat: { type: 'group', id: '99', mention: '111' }, text: 'hello' })
  await manager.handle({ id: 'g2', chat: { type: 'group', id: '99', mention: '222' }, text: 'hello' })
  assert.deepEqual(sent.map((item) => item.chat.mention), ['111', '222'])
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

test('archiving hides a session and unarchive restores it', async () => {  const { manager } = fakeEnvironment()
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

test('a resumed session does not replay its history on the first message', async () => {
  const { manager, sent, session } = fakeEnvironment({ reply: 'pong' })
  // Old turns already on disk, but nothing has been delivered by this process.
  session.seq = 7

  const state = manager.stateFor({ type: 'private', id: '42' })
  await manager.flushFollowUps(state, session)

  assert.deepEqual(sent, [])
})

test('sessions fall back to the DSH title when no label is set', async () => {
  const { manager, emit } = fakeEnvironment({ reply: 'ok' })
  const chat = { type: 'private', id: '42' }
  emit('session/title', { title: 'QQ图片附件处理' })

  await manager.handle({ id: 'm1', chat, text: 'hi' })
  const list = await manager.listSessions(chat, 'L1')

  assert.equal(list.labels[list.activeSessionId], undefined)
  assert.equal(list.titles[list.activeSessionId], 'QQ图片附件处理')
  assert.equal(await manager.resolveSession(chat, 'QQ图片附件处理'), list.activeSessionId)
})

test('an autonomous follow-up turn is still delivered to QQ', async () => {
  const { manager, sent, emit } = fakeEnvironment({ reply: 'first' })
  manager.config.agent.followUp = { enabled: true, pollMs: 5, idleMs: 200 }

  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'draw it' })
  assert.deepEqual(sent.map((item) => item.text), ['first'])

  // A subagent completion or background job wakes the agent after the QQ turn ended.
  emit('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: 'later' }] } })
  emit('turn/end', { reason: { kind: 'completed' } })
  await new Promise((resolve) => setTimeout(resolve, 60))

  assert.deepEqual(sent.map((item) => item.text), ['first', 'later'])
})

test('follow-up turns without text stay quiet', async () => {
  const { manager, sent, emit } = fakeEnvironment({ reply: 'first' })
  manager.config.agent.followUp = { enabled: true, pollMs: 5, idleMs: 200 }

  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'go' })
  emit('turn/end', { reason: { kind: 'completed' } })
  await new Promise((resolve) => setTimeout(resolve, 60))

  assert.deepEqual(sent.map((item) => item.text), ['first'])
})

test('a new QQ message flushes a pending follow-up turn first', async () => {
  const { manager, sent, emit } = fakeEnvironment({ reply: 'next' })
  manager.config.agent.followUp = { enabled: true, pollMs: 500, idleMs: 1000 }

  await manager.handle({ id: 'm1', chat: { type: 'private', id: '42' }, text: 'one' })
  emit('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: 'late' }] } })
  emit('turn/end', { reason: { kind: 'completed' } })

  await manager.handle({ id: 'm2', chat: { type: 'private', id: '42' }, text: 'two' })

  assert.deepEqual(sent.map((item) => item.text), ['next', 'late', 'next'])
})

test('a workspace registered through a junction moves to its canonical path', async () => {
  const { manager } = fakeEnvironment()
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-real-'))
  const link = path.join(os.tmpdir(), `qq-link-${Date.now()}`)
  fs.symlinkSync(real, link, 'junction')
  const deleted = []
  try {
    const registry = {
      list: () => [],
      create: async (dir, title) => {
        const workspace = {
          id: 'canonical-id',
          path: dir,
          title,
          sessionIds: [],
          attachSession: async (sessionId) => {
            if (!workspace.sessionIds.includes(sessionId)) workspace.sessionIds.push(sessionId)
          },
        }
        return workspace
      },
      delete: async (id) => {
        deleted.push(id)
      },
    }
    const legacy = { id: 'legacy-id', path: link, title: '工作区对接QQ', sessionIds: ['sess-old'], attachSession: async () => {} }

    const result = await manager.normalizeWorkspace(registry, legacy)

    assert.equal(result.path, fs.realpathSync(real))
    assert.deepEqual(result.sessionIds, ['sess-old'])
    assert.deepEqual(deleted, ['legacy-id'])
  } finally {
    try {
      fs.rmdirSync(link)
    } catch {
      fs.rmSync(link, { recursive: true, force: true })
    }
    fs.rmSync(real, { recursive: true, force: true })
  }
})

