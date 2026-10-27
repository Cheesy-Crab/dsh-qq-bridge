import { sessionEventsFrom } from './events.js'
import { presentedImages } from './present.js'
import { archiveSessionImage } from './session-images.js'
import { adaptToolResult } from '../platform/plugin-adapter.js'

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i

/**
 * Collect images and provider cost from any tool result.
 * Native `meta.dsh.outputs` / `meta.dsh.cost` are preferred; legacy
 * `savedTo` / `cost.total` shapes are adapted during migration.
 * @param {unknown} value
 * @param {Map<string, { total?: number, base?: number }>} records
 */
function collectRecords(value, records) {
  const adapted = adaptToolResult(value)
  for (const output of adapted.outputs) {
    if (output.kind !== 'image' || typeof output.path !== 'string' || !IMAGE_RE.test(output.path)) continue
    const cost = adapted.cost
    const recordCost = cost !== undefined
      && typeof cost.amount === 'number'
      && (cost.unit === undefined || cost.unit === 'buzz')
      ? {
          total: cost.amount,
          ...(typeof cost.base === 'number' ? { base: cost.base } : {}),
        }
      : undefined
    if (recordCost !== undefined) records.set(output.path, recordCost)
    else if (!records.has(output.path)) records.set(output.path, {})
  }
}

/**
 * Image-gen results in this turn, with the provider cost when available.
 * @param {any} session
 * @param {number} fromSeq
 * @param {(level: string, message: string) => void} log
 * @returns {{ file: string, cost?: { total?: number, base?: number } }[]}
 */
export function generatedImageRecords(session, fromSeq, log) {
  const records = new Map()
  try {
    for (const event of sessionEventsFrom(session, fromSeq)) {
      if (event?.type !== 'tool/result') continue
      collectRecords(event.data?.meta, records)
    }
  } catch (error) {
    log?.('warn', `could not read generated images: ${error?.message ?? error}`)
  }
  return [...records].map(([file, cost]) => ({ file, cost }))
}

/**
 * Images generated through the dsh-image-gen tools in this turn.
 * @param {any} session
 * @param {number} fromSeq
 * @param {(level: string, message: string) => void} log
 * @returns {string[]}
 */
export function generatedImages(session, fromSeq, log) {
  return generatedImageRecords(session, fromSeq, log).map((record) => record.file)
}

function buzz(value) {
  if (value === undefined) return '?'
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

/**
 * Send image-gen results to QQ without requiring an extra `present` call.
 * Billing is per unique image and happens even when `present` owns delivery.
 * @param {{ sendImage?: Function, sendText?: Function, charge?: Function,
 *           chat: any, session: any, state?: any, fromSeq: number,
 *           log: (level: string, message: string) => void }} options
 * @returns {Promise<string[]>}
 */
export async function forwardGeneratedImages({ sendImage, sendText, charge, chat, session, state, fromSeq, log }) {
  const records = generatedImageRecords(session, fromSeq, log)
  const presented = new Set(presentedImages(session, fromSeq, log))
  const sent = []
  for (const record of records) {
    let billing
    const cost = record.cost?.total
    if (typeof cost === 'number' && cost > 0 && charge) {
      try {
        billing = await charge({ chat, state, cost })
      } catch (error) {
        log?.('warn', `could not charge image quota: ${error?.message ?? error}`)
      }
    }
    if (!presented.has(record.file)) {
      try {
        const archived = await archiveSessionImage(record.file, { session, state, log })
        const options = chat.mention ? { mention: chat.mention } : {}
        await sendImage?.(chat, archived, options)
        sent.push(archived)
      } catch (error) {
        log?.('warn', `could not forward generated image ${record.file}: ${error?.message ?? error}`)
      }
    }
    if (billing && sendText) {
      const suffix = billing.overdraw ? '（额度已用尽）' : ''
      const text = `本次生图消耗 ${buzz(billing.spent)} Buzz，剩余额度 ${buzz(billing.remaining)} Buzz${suffix}`
      try {
        await sendText(chat, text, chat.mention ? { mention: chat.mention } : {})
      } catch (error) {
        log?.('warn', `could not send image quota: ${error?.message ?? error}`)
      }
    }
  }
  return sent
}
