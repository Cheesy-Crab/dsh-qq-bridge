import { loadApiKey } from './secrets.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait until a Cordis service is registered.
 * @param {any} ctx
 * @param {string} name
 * @param {number} timeoutMs
 */
async function waitForService(ctx, name, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const service = ctx.get(name)
    if (service) return service
    await sleep(200)
  }
  return undefined
}

/**
 * Read the key file and import it into the DSH credentials service, which is
 * what the provider adapters resolve against. Environment alone is not enough:
 * with the credentials service composed, its stored value wins and the launch
 * environment was already snapshotted before this plugin ran.
 *
 * A key found in the file always wins, so editing the file and restarting is
 * the documented way to rotate. A missing file and an already-exported
 * environment variable leave the stored credentials untouched.
 *
 * @param {any} ctx
 * @param {{ file?: string, envName?: string, log: (level: string, message: string) => void, timeoutMs?: number }} options
 */
export async function ensureCredential(ctx, { file, envName = 'DEEPSEEK_API_KEY', log, timeoutMs = 20000 }) {
  const loaded = loadApiKey({ file, envName, log })
  if (!loaded.applied) return { mode: 'untouched', loaded }

  const credentials = await waitForService(ctx, 'credentials', timeoutMs)
  if (!credentials) {
    log('warn', 'credentials service is not available; the key stays in the process environment only')
    return { mode: 'env', loaded }
  }

  try {
    await credentials.set(envName, process.env[envName])
    log('info', `credential ${envName} imported into the DSH credential store (source=${loaded.file})`)
    return { mode: 'stored', loaded }
  } catch (error) {
    log('warn', `failed to store ${envName} in the credentials service: ${error?.message ?? error}`)
    return { mode: 'env', loaded, error }
  }
}
