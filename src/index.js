import { QqBridge } from './bridge.js'
import { normalizeConfig } from './config.js'
import { ensureCredential } from './credentials.js'
import { NapCatSupervisor } from './napcat.js'
import { resolveWorkspacesRoot } from './paths.js'
import { runSelfTest } from './selftest.js'

export const name = 'dsh-qq-bridge'

/**
 * Cordis entry point: runs on the Host inside the profile process.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} rawConfig
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const root = resolveWorkspacesRoot(config.workspacesRoot)

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

  log('info', `loaded platform=${process.platform} node=${process.version} root=${root}`)
  ensureCredential(ctx, { file: config.apiKeyFile, envName: config.apiKeyEnv, log }).catch((error) => {
    log('warn', `credential import failed: ${error?.stack ?? error}`)
  })

  const napcat = new NapCatSupervisor({
    config: config.napcat,
    log,
    port: config.transport.onebot.port,
    isConnected: () => bridge.transport?.connected === true,
  })

  const bridge = new QqBridge({ ctx, config, root, log, napcat })
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
