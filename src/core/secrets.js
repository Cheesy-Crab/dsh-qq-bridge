import fs from 'node:fs'
import path from 'node:path'
import { defaultDshHome, expandVars } from './paths.js'

/**
 * Absolute path of the key file. Empty config means
 * `<DSH_HOME>/deepseek-key.txt`; `${DSH_HOME}` is expanded.
 * @param {string | undefined} raw
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveApiKeyFile(raw, env = process.env) {
  const value = (raw ?? '').trim()
  const template = value === '' ? '${DSH_HOME}/deepseek-key.txt' : value
  return path.resolve(expandVars(template, { DSH_HOME: defaultDshHome(env), HOME: env.HOME ?? '' }))
}

/**
 * Extract a key from plain text. Accepts either a bare key or
 * `NAME=value`, skips blank lines and `#` / `//` comments, and strips a UTF-8
 * BOM plus surrounding quotes.
 * @param {string} content
 * @param {string} envName
 * @returns {string | null}
 */
export function parseApiKey(content, envName) {
  const lines = String(content).replace(/^\uFEFF/, '').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('//')) continue
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (assignment) {
      if (assignment[1] !== envName) continue
      return cleanValue(assignment[2])
    }
    return cleanValue(line)
  }
  return null
}

function cleanValue(value) {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '').trim()
  if (trimmed === '') return null
  if (/\s/.test(trimmed)) return null
  return trimmed
}

/**
 * Load the key file and install it into the environment unless the variable is
 * already set. Never returns or logs the key itself.
 * @param {{ file?: string, envName?: string, env?: Record<string, string | undefined>,
 *           log?: (level: string, message: string) => void }} [options]
 * @returns {{ applied: boolean, file: string, envName: string, length: number, reason?: string }}
 */
export function loadApiKey({ file, envName = 'DEEPSEEK_API_KEY', env = process.env, log } = {}) {
  const resolved = resolveApiKeyFile(file, env)
  const existing = env[envName]
  if (existing !== undefined && existing !== '') {
    return { applied: false, file: resolved, envName, length: existing.length, reason: 'already set in environment' }
  }
  let content
  try {
    content = fs.readFileSync(resolved, 'utf8')
  } catch (error) {
    const reason = error?.code === 'ENOENT' ? 'file not found' : String(error?.message ?? error)
    log?.('warn', `api key file unavailable (${reason}): ${resolved}`)
    return { applied: false, file: resolved, envName, length: 0, reason }
  }
  const key = parseApiKey(content, envName)
  if (!key) {
    log?.('warn', `api key file has no usable key: ${resolved}`)
    return { applied: false, file: resolved, envName, length: 0, reason: 'no usable key in file' }
  }
  env[envName] = key
  log?.('info', `api key loaded from ${resolved} into ${envName} (length=${key.length})`)
  return { applied: true, file: resolved, envName, length: key.length }
}
