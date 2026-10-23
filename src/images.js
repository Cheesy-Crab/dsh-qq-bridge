import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 20 * 1024 * 1024
const TIMEOUT_MS = 20000
const EXT_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
}

/**
 * Extract OneBot image segments into a flat shape.
 * @param {unknown} message
 * @returns {{ file?: string, url?: string, fileId?: string, summary?: string }[]}
 */
export function imagesOf(message) {
  if (!Array.isArray(message)) return []
  return message
    .filter((segment) => segment?.type === 'image')
    .map((segment) => ({
      file: segment.data?.file,
      url: segment.data?.url,
      fileId: segment.data?.file_id ?? segment.data?.fileId,
      summary: segment.data?.summary,
    }))
}

function extensionOf(value, contentType) {
  if (contentType && EXT_BY_TYPE[contentType.toLowerCase()]) return EXT_BY_TYPE[contentType.toLowerCase()]
  try {
    const pathname = new URL(value).pathname
    const ext = path.extname(pathname).toLowerCase()
    if (/^\.(png|jpe?g|gif|webp|bmp)$/.test(ext)) return ext === '.jpeg' ? '.jpg' : ext
  } catch {}
  const ext = path.extname(String(value ?? '')).toLowerCase()
  if (/^\.(png|jpe?g|gif|webp|bmp)$/.test(ext)) return ext === '.jpeg' ? '.jpg' : ext
  return '.jpg'
}

async function fetchImage(url, fetchImpl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    if (!response?.ok) throw new Error(`图片下载失败：HTTP ${response?.status ?? 'unknown'}`)
    const type = response.headers?.get?.('content-type') ?? ''
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) throw new Error('图片内容为空')
    if (buffer.length > MAX_BYTES) throw new Error('图片超过 20MB')
    return { buffer, contentType: type.split(';')[0].trim().toLowerCase() }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Save one OneBot image segment into `dir`.
 * @param {{ file?: string, url?: string }} image
 * @param {string} dir
 * @param {{ fetchImpl?: typeof fetch, now?: () => number }} [options]
 * @returns {Promise<string>}
 */
export async function saveIncomingImage(image, dir, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  const candidates = [image?.url, image?.file].filter((value) => typeof value === 'string' && value !== '')
  let buffer
  let source
  let contentType = ''

  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) {
      const fetched = await fetchImage(candidate, fetchImpl)
      buffer = fetched.buffer
      contentType = fetched.contentType
      source = candidate
      break
    }
    if (candidate.startsWith('base64://')) {
      buffer = Buffer.from(candidate.slice('base64://'.length), 'base64')
      source = 'base64'
      break
    }
    const local = candidate.startsWith('file://') ? candidate.slice('file://'.length) : candidate
    if (fs.existsSync(local)) {
      const stats = fs.statSync(local)
      if (!stats.isFile()) continue
      if (stats.size > MAX_BYTES) throw new Error('图片超过 20MB')
      buffer = fs.readFileSync(local)
      source = local
      break
    }
  }
  if (!buffer || buffer.length === 0) throw new Error('找不到可下载的图片地址')

  const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).slice(2, 8)
  const ext = extensionOf(source, contentType)
  const file = path.join(dir, `qq-${stamp}-${random}${ext}`)
  fs.writeFileSync(file, buffer)
  return file
}
