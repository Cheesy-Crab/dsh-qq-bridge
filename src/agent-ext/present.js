import { archiveSessionImage } from './session-images.js'

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i

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
    for (const event of session.snapshotEvents(fromSeq)) {
      if (event?.type !== 'deliverables/presented') continue
      for (const file of event.data?.files ?? []) {
        if (typeof file?.path === 'string' && IMAGE_RE.test(file.path)) files.push(file.path)
      }
    }
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
