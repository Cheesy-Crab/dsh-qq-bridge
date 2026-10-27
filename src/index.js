import fs from 'node:fs'
import path from 'node:path'

import { QqBridge } from './qq/bridge.js'
import { CommandRegistry } from './qq/command-registry.js'
import { normalizeConfig } from './core/config.js'
import { ensureCredential } from './core/credentials.js'
import { pickDirectory } from './runtime/browse.js'
import { installNapcat } from './runtime/napcat-install.js'
import { findNapcatDir, NapCatSupervisor } from './runtime/napcat.js'
import { registerNapCatHttp } from './runtime/napcat-http.js'
import { resolveApiKeyFile } from './core/secrets.js'
import { runSelfTest } from './core/selftest.js'

export const name = 'dsh-qq-bridge'

/**
 * Cordis entry point: runs on the Host inside the profile process.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} rawConfig
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)

  const debug = process.env.DSH_QQ_BRIDGE_DEBUG === '1'
  const log = (level, message) => {
    const line = `[qq-bridge] ${message}`
    try {
      const logger = ctx.logger
      const write = logger?.[level]
      if (typeof write === 'function') write.call(logger, line)
    } catch {
      // fall through to the debug mirror
    }
    if (debug) console.log(line)
  }

  log('info', `loaded platform=${process.platform} node=${process.version}`)
  if (config.agent.provider !== 'deepseek-account') {
    ensureCredential(ctx, { file: config.apiKeyFile, envName: config.apiKeyEnv, log }).catch((error) => {
      log('warn', `credential import failed: ${error?.stack ?? error}`)
    })
  }

  let adapterHost
  try {
    adapterHost = ctx.get('adapterHost')
  } catch {
    adapterHost = undefined
  }
  if (!adapterHost?.mount) {
    throw new Error('adapterHost is not available; load @dsh/platform-core before dsh-qq-bridge')
  }
  const root = adapterHost.resolveWorkspacesRoot(config.workspacesRoot)
  log('info', `workspaces root=${root}`)

  let bridge
  const commandRegistry = new CommandRegistry()
  try {
    ctx.provide('qqCommands', commandRegistry)
  } catch (error) {
    log('warn', `could not provide qqCommands: ${error?.message ?? error}`)
  }
  const napcat = new NapCatSupervisor({
    config: config.napcat,
    log,
    port: config.transport.onebot.port,
    isConnected: () => bridge?.transport?.connected === true,
  })

  const adapter = {
    id: 'qq',
    mount(host) {
      bridge = new QqBridge({ ctx, config, root, log, napcat, host, commandRegistry })
      return bridge
    },
  }
  bridge = adapterHost.mount(adapter, { config, root })

  let credentials
  ctx.inject(['credentials'], (credCtx) => {
    credentials = credCtx.get('credentials')
    return () => {
      credentials = undefined
    }
  })

  const setup = {
    status: async () => {
      const keyFile = resolveApiKeyFile(config.apiKeyFile)
      return {
        napcat: await napcat.status(),
        bridge: bridge.status?.() ?? {},
        provider: config.agent.provider,
        apiKey: { file: keyFile, configured: fs.existsSync(keyFile) },
        admins: (bridge.users?.list?.() ?? []).filter((user) => user.level === 'L3').map((user) => user.openid),
        setupDir: napcat.dataDir(),
      }
    },
    install: async (source) => {
      const result = await installNapcat({ source, dir: napcat.dataDir(), log })
      napcat.setCwd(result.cwd)
      return result
    },
    browse: async () => {
      const path = await pickDirectory({ log })
      return path
    },
    useNapcat: async (input) => {
      const found = findNapcatDir(String(input ?? '').trim())
      if (!found) throw new Error('该目录里没有 napcat.bat，请选择 NapCat Shell 目录')
      napcat.setCwd(found)
      return { cwd: found }
    },
    setApiKey: async (key) => {
      const value = String(key ?? '').trim()
      if (!/^sk-[A-Za-z0-9_-]{10,}$/.test(value)) throw new Error('API Key 格式不对（应以 sk- 开头）')
      const file = resolveApiKeyFile(config.apiKeyFile)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${value}\n`, { mode: 0o600 })
      process.env[config.apiKeyEnv] = value
      if (credentials) await credentials.set(config.apiKeyEnv, value)
      else await ensureCredential(ctx, { file, envName: config.apiKeyEnv, log })
      return { configured: true, file }
    },
    setAdmin: async (openid) => {
      const id = String(openid ?? '').trim()
      if (!/^\d{5,12}$/.test(id)) throw new Error('QQ 号应为 5–12 位数字')
      if (!bridge.users) throw new Error('bridge 尚未启动')
      bridge.users.setLevel(id, 'L3')
      return { openid: id, level: 'L3' }
    },
    bridgeStatus: () => bridge.status(),
  }

  ctx.inject(['webServer'], (webCtx) => {
    const dispose = registerNapCatHttp(webCtx.get('webServer'), napcat, log, setup)
    return () => dispose?.()
  })
  bridge.start().then(async () => {
    if (config.napcat.enabled && config.napcat.autoStart) {
      await napcat.start()
    }
  }).catch((error) => {
    log('error', `bridge start failed: ${error?.stack ?? error}`)
  })
  ctx.effect(() => () => {
    napcat.stop().catch((error) => log('warn', `napcat stop failed: ${error?.message ?? error}`))
    return bridge.stop()
  })

  const selfTest = config.selfTest || process.env.DSH_QQ_SELFTEST === '1'
  if (selfTest) {
    ctx.effect(() => {
      const timer = setTimeout(() => {
        runSelfTest(ctx, { root, config, log }).catch((error) => {
          log('error', `selftest crashed: ${error?.stack ?? error}`)
        })
      }, 3000)
      return () => clearTimeout(timer)
    })
  }
}
