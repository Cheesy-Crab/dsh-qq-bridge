import { presentedImages } from './present.js'

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i

/**
 * Collect `savedTo` paths from image-gen tool results. `generate_image`,
 * `generate_images` and `edit_image` all put their workspace path in `meta`.
 * @param {unknown} value
 * @param {Set<string>} files
 */
function collectSavedTo(value, files) {
  if (value === null || typeof value !== 'object') return
  if (typeof value.savedTo === 'string' && IMAGE_RE.test(value.savedTo)) files.add(value.savedTo)
  for (const child of Object.values(value)) collectSavedTo(child, files)
}

/**
 * Images generated through the dsh-image-gen tools in this turn.
 * @param {any} session
 * @param {number} fromSeq
 * @param {(level: string, message: string) => void} log
 * @returns {string[]}
 */
export function generatedImages(session, fromSeq, log) {
  const files = new Set()
  try {
    for (const event of session.snapshotEvents(fromSeq)) {
      if (event?.type !== 'tool/result') continue
      collectSavedTo(event.data?.meta, files)
    }
  } catch (error) {
    log?.('warn', `could not read generated images: ${error?.message ?? error}`)
  }
  return [...files]
}

/**
 * Send image-gen results to QQ without requiring an extra `present` call.
 * If the agent already presented the same path, `qq:present` owns it and this
 * extension skips it to avoid duplicates.
 * @param {{ sendImage?: Function, chat: any, session: any, fromSeq: number,
 *           log: (level: string, message: string) => void }} options
 * @returns {Promise<string[]>}
 */
export async function forwardGeneratedImages({ sendImage, chat, session, fromSeq, log }) {
  const files = generatedImages(session, fromSeq, log)
  const presented = new Set(presentedImages(session, fromSeq, log))
  const sent = []
  for (const file of files) {
    if (presented.has(file)) continue
    try {
      const options = chat.mention ? { mention: chat.mention } : {}
      await sendImage?.(chat, file, options)
      sent.push(file)
    } catch (error) {
      log?.('warn', `could not forward generated image ${file}: ${error?.message ?? error}`)
    }
  }
  return sent
}
