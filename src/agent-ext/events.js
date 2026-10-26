import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Read a session's own events from `fromSeq` to the head.
 *
 * `snapshotEvents()` is the usual accessor, but it is surface-aware: host
 * bookkeeping events such as `deliverables/presented` may be recorded in the
 * log while never showing up there. Delivery therefore prefilters with
 * `ownEvents()` (the raw log) and falls back to `snapshotEvents()`.
 *
 * @param {any} session
 * @param {number} fromSeq
 * @returns {Array<{ type?: string, seq?: number, data?: any }>}
 */
export function sessionEventsFrom(session, fromSeq) {
  if (!session) return []
  try {
    if (typeof session.ownEvents === 'function') {
      const events = session.ownEvents()
      if (Array.isArray(events) && events.length > 0) {
        const from = Number.isFinite(fromSeq) ? fromSeq : 0
        return events.filter((event) => Number.isFinite(event?.seq) ? event.seq >= from : true)
      }
    }
  } catch {
    // fall through to the public snapshot
  }
  try {
    const events = session.snapshotEvents(fromSeq)
    return Array.isArray(events) ? events : []
  } catch {
    return []
  }
}

/**
 * Append one diagnostic line to `<DSH_HOME>/logs/agent-ext.log` when
 * `DSH_QQ_AGENT_LOG=1`. Turn-end delivery is hard to inspect from QQ, so this
 * stays silent unless the switch is on.
 * @param {string} label
 * @param {Record<string, unknown>} data
 */
export function trace(label, data) {
  if (process.env.DSH_QQ_AGENT_LOG !== '1') return
  try {
    const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
    const dir = path.join(home, 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const line = `${new Date().toISOString()} ${label} ${JSON.stringify(data)}\n`
    fs.appendFileSync(path.join(dir, 'agent-ext.log'), line)
  } catch {
    // diagnostics must never break delivery
  }
}
