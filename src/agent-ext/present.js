import { archiveSessionImage } from './session-images.js'

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i

function eventsFrom(session, fromSeq) {
  const start = Number.isFinite(Number(fromSeq)) ? Number(fromSeq) : 0
  try {
    if (typeof session?.ownEvents === 'function') {
      const events = session.ownEvents()
      if (Array.isArray(events) && events.length > 0) {
        return events.filter((event) => Number.isFinite(event?.seq) ? event.seq >= start : true)
      }
    }
  } catch {
    // fall through to the snapshots
  }
  try {
    const events = session?.snapshotEvents?.(start)
    return Array.isArray(events) ? events : []
  } catch {
    return []
  }
}

function trace(name, data) {
  if (process.env.DSH_PLATFORM_TRACE === '1') {
    console.log(`[qq-trace] ${name}`, JSON.stringify(data))
  }
}

/**
 * Images the agent declared via `present` during this turn.
 * @param {any} session
 * @param {number} fromSeq
 * @param {(level: string, message: string) => void} log
 * @returns {string[]}
 */
export function presentedImages(session, fromSeq, log) {
  const files = []
  try {
    const events = eventsFrom(session, fromSeq)
    for (const event of events) {
      if (event?.type !== 'deliverables/presented') continue
      for (const file of event.data?.files ?? []) {
        if (typeof file?.path === 'string' && IMAGE_RE.test(file.path)) files.push(file.path)
      }
    }
    trace('present', {
      sessionId: session?.header?.id,
      fromSeq,
      events: events.length,
      types: [...new Set(events.map((event) => event?.type))].slice(0, 40),
      files,
    })
  } catch (error) {
    log?.('warn', `could not read presented deliverables: ${error?.message ?? error}`)
  }
  return [...new Set(files)]
}

/**
 * Send this turn's presented images to the QQ chat.
 * @param {{ sendImage?: Function, chat: any, session: any, state?: any, fromSeq: number,
 *           log: (level: string, message: string) => void }} options
 * @returns {Promise<string[]>}
 */
export async function forwardPresentedImages({ sendImage, chat, session, state, fromSeq, log }) {
  const files = presentedImages(session, fromSeq, log)
  const sent = []
  for (const file of files) {
    try {
      const archived = await archiveSessionImage(file, { session, state, log })
      const options = chat.mention ? { mention: chat.mention } : {}
      await sendImage?.(chat, archived, options)
      sent.push(archived)
    } catch (error) {
      log?.('warn', `could not forward presented image ${file}: ${error?.message ?? error}`)
    }
  }
  return sent
}
