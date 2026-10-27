import fs from 'node:fs'
import path from 'node:path'

import { defaultDshHome, expandVars } from './home.js'

/**
 * Absolute state file. Empty config means
 * `<DSH_HOME>/storages/qq-bridge/state.json`.
 * @param {string | undefined} raw
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveStateFile(raw, env = process.env) {
  const value = (raw ?? '').trim()
  const template = value === '' ? '${DSH_HOME}/storages/qq-bridge/state.json' : value
  return path.resolve(expandVars(template, { DSH_HOME: defaultDshHome(env) }))
}

/**
 * Tiny JSON store for chat → workspace/session mappings. Writes atomically
 * (temp sibling + rename) and falls back to the in-memory state on a corrupt
 * file instead of taking the plugin down.
 */
export class JsonStore {
  /**
   * @param {{ file: string, log?: (level: string, message: string) => void }} options
   */
  constructor({ file, log }) {
    this.file = file
    this.log = log
    this.state = { version: 1, chats: {} }
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (parsed?.version !== 1 || typeof parsed.chats !== 'object' || parsed.chats === null) {
        throw new Error('unexpected state shape')
      }
      this.state = parsed
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.log?.('warn', `state file ignored (${error?.message ?? error}): ${this.file}`)
      }
    }
    return this.state
  }

  get(key) {
    return this.state.chats[key]
  }

  set(key, value) {
    this.state.chats[key] = value
    this.save()
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = `${this.file}.${process.pid}.tmp`
    const payload = `${JSON.stringify(this.state, null, 2)}\n`
    fs.writeFileSync(temp, payload, 'utf8')
    try {
      fs.renameSync(temp, this.file)
    } catch {
      fs.writeFileSync(this.file, payload, 'utf8')
      fs.rmSync(temp, { force: true })
    }
  }
}

