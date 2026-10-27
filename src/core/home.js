import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function defaultDshHome(env = process.env, platform = process.platform) {
  const impl = platform === 'win32' ? path.win32 : path.posix
  return env.DSH_HOME ? impl.resolve(env.DSH_HOME) : impl.join(os.homedir(), '.dsh')
}

export function expandVars(template, vars) {
  return template.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => vars[key] ?? '')
}

export function realpathOrSelf(value) {
  try {
    return fs.realpathSync.native(value)
  } catch {
    return value
  }
}
