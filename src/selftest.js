import fs from 'node:fs'
import path from 'node:path'
import { realpathOrSelf } from './paths.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait until every named Cordis service is registered.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string[]} names
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
async function waitForServices(ctx, names, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const missing = names.filter((name) => !ctx.get(name))
    if (missing.length === 0) return
    await sleep(250)
  }
  const missing = names.filter((name) => !ctx.get(name))
  throw new Error(`services not ready: ${missing.join(', ')}`)
}

/**
 * Exercise the four host seams this plugin depends on, without calling a model:
 * workspace registration, session/agent creation, approval policy, tool gating.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ root: string, config: any, log: (level: string, message: string) => void }} options
 * @returns {Promise<{ ok: boolean, results: Array<{ name: string, ok: boolean, error?: string }> }>}
 */
export async function runSelfTest(ctx, { root, config, log }) {
  const results = []
  const step = async (name, fn) => {
    try {
      const detail = await fn()
      results.push({ name, ok: true })
      log('info', `selftest PASS ${name}${detail ? ' - ' + detail : ''}`)
    } catch (error) {
      results.push({ name, ok: false, error: String(error?.message ?? error) })
      log('error', `selftest FAIL ${name}: ${error?.stack ?? error}`)
    }
  }

  const dir = path.join(root, '_selftest', String(Date.now()))
  let ws
  let handle
  let sessionId

  await step('services', async () => {
    await waitForServices(ctx, ['workspaceRegistry', 'agents', 'approval', 'tools'])
    return 'workspaceRegistry, agents, approval, tools'
  })

  await step('workspace.register', async () => {
    fs.mkdirSync(dir, { recursive: true })
    ws = await ctx.get('workspaceRegistry').create(dir, 'qq-selftest')
    const actual = realpathOrSelf(ws.path)
    const expected = realpathOrSelf(dir)
    if (actual !== expected) throw new Error(`workspace path mismatch: ${actual} !== ${expected}`)
    return `id=${ws.id}`
  })

  await step('agent.create', async () => {
    if (!ws) throw new Error('workspace step failed')
    sessionId = `sess-qq-selftest-${Date.now()}`
    handle = await ctx.get('agents').create({
      sessionId,
      meta: { cwd: dir },
      agentOptions: config.selfTestModel,
    })
    await ws.attachSession(sessionId)
    if (!ws.sessionIds.includes(sessionId)) throw new Error('session was not attached to workspace')
    return `session=${sessionId}`
  })

  await step('approval.policy', async () => {
    if (!handle) throw new Error('agent step failed')
    const approval = ctx.get('approval')
    approval.setPolicy(handle.agent, 'never')
    const policy = approval.effectivePolicy(handle.agent.session)
    if (policy !== 'never') throw new Error(`effective policy is ${policy}`)
    return 'never'
  })

  await step('tools.restrict', async () => {
    if (!handle) throw new Error('agent step failed')
    const dispose = handle.agent.ctx.tools.restrict({ allow: [] })
    if (typeof dispose !== 'function') throw new Error('restrict did not return a disposer')
    dispose()
    return 'allow=[]'
  })

  await step('cleanup', async () => {
    if (ws && sessionId) {
      try {
        await ws.detachSession(sessionId)
      } catch {
        // best effort: the session may already be gone with the agent
      }
    }
    if (handle) await handle.dispose()
    if (ws) await ctx.get('workspaceRegistry').delete(ws)
    fs.rmSync(dir, { recursive: true, force: true })
    try {
      fs.rmdirSync(path.dirname(dir))
    } catch {
      // keep the parent when another selftest directory is still there
    }
    return 'removed'
  })

  const ok = results.every((r) => r.ok)
  log(ok ? 'info' : 'error', `selftest ${ok ? 'PASSED' : 'FAILED'} (${results.filter((r) => r.ok).length}/${results.length})`)
  return { ok, results }
}
