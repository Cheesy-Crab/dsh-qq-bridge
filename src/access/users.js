import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { normalizeCapabilities } from './capabilities.js'
import { normalizeLevel } from './levels.js'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Persistent user registry: level, frozen status, daily turn counter, and
 * one-time bind codes. Writes atomically; a corrupt file falls back to empty
 * state instead of taking the bridge down.
 */
export class UserStore {
  /**
   * @param {{ file: string, admins?: string[], log?: (level: string, message: string) => void, now?: () => number }} options
   */
  constructor({ file, admins = [], log, now = Date.now }) {
    this.file = file
    this.admins = admins
    this.log = log
    this.now = now
    this.state = { version: 1, users: {}, codes: {} }
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (parsed?.version !== 1 || typeof parsed.users !== 'object' || parsed.users === null) {
        throw new Error('unexpected user store shape')
      }
      this.state = { version: 1, users: parsed.users, codes: parsed.codes ?? {} }
    } catch (error) {
      if (error?.code !== 'ENOENT') this.log?.('warn', `user store ignored (${error?.message ?? error}): ${this.file}`)
    }
    return this.state
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

  ensureAdmins() {
    let changed = false
    for (const openid of this.admins) {
      const user = this.ensure(openid)
      if (user.level !== 'L3') {
        user.level = 'L3'
        changed = true
      }
      user.status = 'active'
    }
    if (changed) this.save()
  }

  ensure(openid) {
    let user = this.state.users[openid]
    if (!user) {
      user = { level: 'L0', status: 'active', capabilities: [], createdAt: this.now(), daily: { date: today(), turns: 0 } }
      this.state.users[openid] = user
    }
    user.capabilities ??= []
    user.daily ??= { date: today(), turns: 0 }
    return user
  }

  /**
   * @param {string} openid
   * @returns {{ level: string, status: string, daily: { date: string, turns: number } }}
   */
  user(openid) {
    return this.state.users[openid] ?? { level: 'L0', status: 'active', capabilities: [], daily: { date: today(), turns: 0 } }
  }

  /**
   * Capabilities that take effect for this user. L3 is implicitly everything.
   * @param {string} openid
   * @param {string} level
   * @returns {string[]}
   */
  capabilitiesOf(openid, level) {
    if (level === 'L3') return ['workspace', 'read', 'write', 'exec']
    return normalizeCapabilities(this.user(openid).capabilities ?? [])
  }

  setCapabilities(openid, capabilities) {
    const user = this.ensure(openid)
    user.capabilities = normalizeCapabilities(capabilities)
    this.save()
    return user.capabilities
  }

  addCapabilities(openid, capabilities) {
    const user = this.ensure(openid)
    user.capabilities = normalizeCapabilities([...(user.capabilities ?? []), ...capabilities])
    this.save()
    return user.capabilities
  }

  removeCapabilities(openid, capabilities) {
    const user = this.ensure(openid)
    const remove = new Set(normalizeCapabilities(capabilities))
    user.capabilities = normalizeCapabilities((user.capabilities ?? []).filter((capability) => !remove.has(capability)))
    this.save()
    return user.capabilities
  }

  /**
   * Merge the deployment whitelist into stored users.
   * @param {Record<string, string[]>} whitelist
   */
  applyWhitelist(whitelist = {}) {
    let changed = false
    for (const [openid, capabilities] of Object.entries(whitelist)) {
      const user = this.ensure(openid)
      const merged = normalizeCapabilities([...(user.capabilities ?? []), ...capabilities])
      if (merged.length !== user.capabilities.length) {
        user.capabilities = merged
        changed = true
      }
    }
    if (changed) this.save()
  }

  levelOf(openid) {
    const user = this.state.users[openid]
    if (!user || user.status === 'frozen') return 'L0'
    return normalizeLevel(user.level)
  }

  setLevel(openid, level) {
    const user = this.ensure(openid)
    user.level = normalizeLevel(level)
    this.save()
    return user
  }

  freeze(openid, frozen = true) {
    const user = this.ensure(openid)
    user.status = frozen ? 'frozen' : 'active'
    this.save()
    return user
  }

  /**
   * @param {string} level
   * @param {number} ttlMs
   * @returns {string} six-digit code
   */
  invite(level, ttlMs) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    this.state.codes[code] = { level: normalizeLevel(level), expiresAt: this.now() + ttlMs }
    this.save()
    return code
  }

  /**
   * @param {string} openid
   * @param {string} code
   */
  bind(openid, code) {
    const entry = this.state.codes[code]
    if (!entry) return { ok: false, reason: '配对码无效' }
    if (entry.expiresAt < this.now()) {
      delete this.state.codes[code]
      this.save()
      return { ok: false, reason: '配对码已过期' }
    }
    const user = this.ensure(openid)
    user.level = entry.level
    user.status = 'active'
    delete this.state.codes[code]
    this.save()
    return { ok: true, level: user.level }
  }

  /**
   * Count one model turn against the level's daily limit.
   * @param {string} openid
   * @param {number} limit 0 means unlimited
   */
  recordTurn(openid, limit) {
    const user = this.ensure(openid)
    const date = today()
    if (user.daily.date !== date) user.daily = { date, turns: 0 }
    if (limit > 0 && user.daily.turns >= limit) {
      return { allowed: false, used: user.daily.turns, limit }
    }
    user.daily.turns += 1
    this.save()
    return { allowed: true, used: user.daily.turns, limit }
  }

  list() {
    return Object.entries(this.state.users).map(([openid, user]) => ({
      openid,
      level: normalizeLevel(user.level),
      status: user.status ?? 'active',
      capabilities: normalizeCapabilities(user.capabilities ?? []),
      turns: user.daily?.date === today() ? user.daily.turns : 0,
    }))
  }
}
