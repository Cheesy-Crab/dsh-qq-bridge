import assert from 'node:assert/strict'
import test from 'node:test'

import { CommandDispatcher, parseCommand } from '../src/commands.js'
import { normalizeConfig } from '../src/config.js'
import { validateName } from '../src/paths.js'

function dispatcher(overrides = {}) {
  const sent = []
  const manager = {
    sessionSummary: () => ({
      workspaceId: 'ws-1',
      workspaceName: 'default',
      workspacePath: '/root/default',
      sessionShort: 'sess-1',
      pending: 0,
    }),
    listWorkspaces: async () => [
      { id: 'ws-1', title: 'default', path: '/root/default', createdAt: 1 },
      { id: 'ws-2', title: 'demo', path: '/root/demo', createdAt: 2 },
    ],
    createWorkspace: async (_chat, name) => {
      validateName(name)
      return { id: 'ws-3', title: name, path: `/root/${name}` }
    },
    newSession: async () => ({ agent: { session: { header: { id: 'sess-new' } } } }),
    listSessions: async () => ({ workspace: { title: 'default' }, sessionIds: ['sess-1', 'sess-2'], activeSessionId: 'sess-1' }),
    useSession: async () => 'sess-2',
    cancelCurrent: async () => true,
    ...overrides,
  }
  const commands = new CommandDispatcher({
    manager,
    users: {
      bind: () => ({ ok: true, level: 'L1' }),
      list: () => [{ openid: '42', level: 'L3', status: 'active', turns: 1 }],
      invite: () => '123456',
      setLevel: () => {},
      freeze: () => {},
    },
    config: normalizeConfig({ transport: { kind: 'fake' } }),
    root: '/root',
    log: () => {},
    send: async (chat, text) => {
      sent.push({ chat, text })
    },
    status: () => ({ transport: { connected: true }, chats: { chats: 1, pending: 0 }, dedupeSize: 2 }),
  })
  const chat = { type: 'private', id: '42' }
  const run = (text, level = 'L3', target = chat) => commands.execute({ chat: target, text }, { level })
  return { commands, sent, run }
}

test('parseCommand splits name and args', () => {
  assert.deepEqual(parseCommand('/ws new demo', '/'), { name: 'ws', args: ['new', 'demo'] })
  assert.deepEqual(parseCommand('/', '/'), { name: 'help', args: [] })
  assert.equal(parseCommand('hello', '/'), null)
})

test('non-command text is not handled', async () => {
  const { run, sent } = dispatcher()
  assert.equal(await run('hello'), false)
  assert.equal(sent.length, 0)
})

test('/help lists commands', async () => {
  const { run, sent } = dispatcher()
  await run('/help')
  assert.equal(sent.length, 1)
  assert.match(sent[0].text, /\/whoami/)
  assert.match(sent[0].text, /\/ws use <序号\|名称>/)
})

test('/whoami reports workspace and session', async () => {
  const { run, sent } = dispatcher()
  await run('/whoami')
  assert.match(sent[0].text, /工作区：default/)
  assert.match(sent[0].text, /等级：L3/)
  assert.match(sent[0].text, /会话：sess-1/)
})

test('/status reports transport state', async () => {
  const { run, sent } = dispatcher()
  await run('/status')
  assert.match(sent[0].text, /连接：已连接/)
  assert.match(sent[0].text, /根目录：\/root/)
})

test('/ws list marks the current workspace', async () => {
  const { run, sent } = dispatcher()
  await run('/ws list')
  assert.match(sent[0].text, /1\. default/)
  assert.match(sent[0].text, /← 当前/)
})

test('/ws new validates a name and reports the path', async () => {
  const { run, sent } = dispatcher()
  await run('/ws new demo')
  assert.match(sent[0].text, /已创建工作区 demo：\/root\/demo/)
})

test('/ws new rejects an invalid name', async () => {
  const { run, sent } = dispatcher()
  await run('/ws new a/b')
  assert.match(sent[0].text, /指令失败/)
})

test('unknown commands get a hint', async () => {
  const { run, sent } = dispatcher()
  await run('/nope')
  assert.match(sent[0].text, /未知指令/)
})

test('/use switches session by index', async () => {
  const { run, sent } = dispatcher()
  await run('/use 2')
  assert.match(sent[0].text, /已切换到会话 sess-2/)
})

test('L0 cannot run workspace commands', async () => {
  const { run, sent } = dispatcher()
  await run('/ws list', 'L0')
  assert.match(sent[0].text, /权限不足：该指令需要 L1/)
})

test('/bind consumes a code', async () => {
  const { run, sent } = dispatcher()
  await run('/bind 123456')
  assert.match(sent[0].text, /绑定成功，当前等级：L1/)
})

test('/admin users lists accounts for L3', async () => {
  const { run, sent } = dispatcher()
  await run('/admin users')
  assert.match(sent[0].text, /42  L3  active/)
})

test('/admin is rejected below L3', async () => {
  const { run, sent } = dispatcher()
  await run('/admin users', 'L1')
  assert.match(sent[0].text, /权限不足：该指令需要 L3/)
})

test('groups share one session and only L3 can reset it', async () => {
  const { run, sent } = dispatcher()
  const group = { type: 'group', id: '99' }
  await run('/new', 'L1', group)
  assert.match(sent[0].text, /群聊是共享会话，只有 L3 能重置/)
  await run('/ws list', 'L1', group)
  assert.match(sent[1].text, /群聊里只能使用 \/ws info/)
})
