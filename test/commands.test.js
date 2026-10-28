import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { CommandDispatcher, parseCommand } from '../src/qq/commands.js'
import { normalizeConfig } from '../src/core/config.js'
import { validateName } from '@dsh/session-core/paths'

function dispatcher(overrides = {}) {
  const sent = []
  const images = []
  const manager = {
    workspacePathFor: async () => '/root/ws',
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
    renameSession: async (_chat, label) => label,
    deleteWorkspace: async (_chat, token) => ({ title: token, path: `/root/${token}` }),
    archiveSession: async () => ({ sessionId: 'sess-1', label: 'test' }),
    unarchiveSession: async () => ({ sessionId: 'sess-1', label: 'test' }),
    listSessions: async () => ({ workspace: { title: 'default' }, sessionIds: ['sess-1', 'sess-2'], activeSessionId: 'sess-1', archived: [], labels: {} }),
    useSession: async () => 'sess-2',
    cancelCurrent: async () => true,
    setSandboxMode: async (_chat, mode) => mode,
    addCapabilities: (_openid, caps) => caps,
    removeCapabilities: (_openid, caps) => caps,
    user: () => ({ level: 'L1', capabilities: ['read'] }),
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
      addCapabilities: (_openid, caps) => caps,
      removeCapabilities: (_openid, caps) => caps,
      user: () => ({ level: 'L1', capabilities: ['read'] }),
    },
    config: normalizeConfig({ transport: { kind: 'fake' } }),
    access: {
      normalizeCapabilities: (value) => value,
      normalizeLevel: (value) => value,
      atLeast: (level, minimum) => ({ L0: 0, L1: 1, L2: 2, L3: 3 }[level] ?? 0) >= ({ L0: 0, L1: 1, L2: 2, L3: 3 }[minimum] ?? 0),
      toolAllowed: () => true,
    },
    root: '/root',
    log: () => {},
    send: async (chat, text) => {
      sent.push({ chat, text })
    },
    sendImage: async (chat, file, options) => {
      images.push({ chat, file, options })
    },
    screenshot: async ({ dir }) => `${dir}/shot.jpg`,
    napcat: {
      status: async () => ({
        enabled: true,
        running: false,
        managed: false,
        external: false,
        port: 6700,
        cwd: '/vendor/napcat',
        autoStart: true,
        qrFile: undefined,
      }),
      start: async () => ({ managed: true, pid: 123 }),
      stop: async () => ({ running: false }),
      restart: async () => ({ managed: true, pid: 456 }),
    },
    status: () => ({ transport: { connected: true }, chats: { chats: 1, pending: 0 }, dedupeSize: 2 }),
  })
  const chat = { type: 'private', id: '42' }
  const ALL = ['workspace', 'read', 'write', 'exec']
  const run = (text, level = 'L3', target = chat, capabilities = ALL) =>
    commands.execute({ chat: target, text }, { level, accessGrants: capabilities })
  return { commands, sent, images, run }
}

test('parseCommand splits name and args', () => {
  assert.deepEqual(parseCommand('/ws new demo', '/'), { name: 'ws', args: ['new', 'demo'], prefix: '/' })
  assert.deepEqual(parseCommand('/', '/'), { name: 'help', args: [], prefix: '/' })
  assert.equal(parseCommand('hello', '/'), null)
})

test('parseCommand accepts multiple prefixes and prefers the longest', () => {
  assert.equal(parseCommand('!whoami', ['/', '!', '#']).name, 'whoami')
  assert.equal(parseCommand('#status', ['/', '!', '#']).name, 'status')
  assert.equal(parseCommand('!!help', ['/', '!!']).name, 'help')
  assert.equal(parseCommand('hello', ['/', '!']), null)
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

test('/new uses an optional name', async () => {
  const { run, sent } = dispatcher()
  await run('/new test')
  assert.match(sent[0].text, /已新建会话 test/)
})

test('/sessions lists session ids', async () => {
  const { run, sent } = dispatcher()
  await run('/sessions')
  assert.match(sent[0].text, /sess-1/)
  assert.match(sent[0].text, /← 当前/)
})

test('/rename names the current session', async () => {
  const { run, sent } = dispatcher()
  await run('/rename demo')
  assert.match(sent[0].text, /已将会话命名为 demo/)
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
  await run('/new', 'L1', group, ['workspace'])
  assert.match(sent[0].text, /群聊是共享会话，只有 L3 能重置/)
  await run('/ws list', 'L1', group, ['workspace'])
  assert.match(sent[1].text, /群聊里只能使用 \/ws info/)
})

test('non-L3 without workspace capability is chat-only', async () => {
  const { run, sent } = dispatcher()
  await run('/ws list', 'L1', { type: 'private', id: '42' }, [])
  assert.match(sent[0].text, /需要管理员把 workspace 加入你的白名单/)
})

test('/admin can grant and revoke capabilities', async () => {
  const { run, sent } = dispatcher()
  await run('/admin allow 42 write')
  assert.match(sent[0].text, /已更新 42 的白名单：write/)
  await run('/admin perms 42')
  assert.match(sent[1].text, /L1）：read/)
})

test('/ws delete removes the registration and reports the path', async () => {
  const { run, sent } = dispatcher()
  await run('/ws delete demo')
  assert.match(sent[0].text, /已从登记中移除工作区 demo/)
  assert.match(sent[0].text, /目录和会话历史保留/)
})

test('/sendimage sends an existing image file', async () => {
  const file = path.join(os.tmpdir(), `qq-send-${Date.now()}.png`)
  fs.writeFileSync(file, Buffer.from([1, 2, 3]))
  const { run, sent, images } = dispatcher()
  await run(`/sendimage ${file}`)
  assert.equal(images.length, 1)
  assert.match(sent[0].text, /已发送图片/)
  fs.rmSync(file, { force: true })
})

test('/napcat status reports the bundled runtime', async () => {
  const { run, sent } = dispatcher()
  await run('/napcat status')
  assert.match(sent[0].text, /NapCat：未运行/)
  assert.match(sent[0].text, /端口：6700/)
  assert.match(sent[0].text, /目录：\/vendor\/napcat/)
})

test('/screenshot captures and sends an image for L3', async () => {
  const { run, sent, images } = dispatcher()
  await run('/screenshot')
  assert.equal(images.length, 1)
  assert.match(images[0].file, /shot\.jpg$/)
  assert.match(sent[0].text, /已截屏并发送/)
})

test('/screenshot is rejected below L3', async () => {
  const { run, sent, images } = dispatcher()
  await run('/screenshot', 'L1')
  assert.equal(images.length, 0)
  assert.match(sent[0].text, /权限不足：该指令需要 L3/)
})

test('/archive and /unarchive manage archived sessions', async () => {
  const { run, sent } = dispatcher()
  await run('/archive test')
  assert.match(sent[0].text, /已归档会话 test/)
  await run('/unarchive test')
  assert.match(sent[1].text, /已恢复会话 test/)
})

test('/sandbox is L3-only and switches the mode', async () => {
  const { run, sent } = dispatcher()
  await run('/sandbox', 'L1')
  assert.match(sent[0].text, /权限不足：该指令需要 L3/)
  await run('/sandbox danger-full-access', 'L3')
  assert.match(sent[1].text, /已切换文件策略：danger-full-access/)
})



