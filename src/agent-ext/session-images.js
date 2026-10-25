import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

function sessionSlug(session, state) {
  const id = String(session?.header?.id ?? state?.sessionId ?? '').trim()
  if (id === '') return ''
  return id.replace(/[^A-Za-z0-9._-]/g, '-').slice(-24)
}

function isArchived(file) {
  const parent = path.basename(path.dirname(file))
  const grand = path.basename(path.dirname(path.dirname(file)))
  return parent !== '' && grand === 'sessions'
}

/**
 * Give each DSH session its own image directory without changing the canonical
 * `savedTo` file that edits reference:
 *
 *   <workspace>/dsh-image-gen/image-abc.jpg                  canonical
 *   <workspace>/dsh-image-gen/sessions/<session>/image-abc.jpg archived
 *
 * Uses a hard link when possible, then a copy; failures fall back to the
 * canonical path so QQ delivery never stops because archiving failed.
 * @param {string} file
 * @param {{ session?: any, state?: any, log?: (level: string, message: string) => void }} options
 * @returns {Promise<string>}
 */
export async function archiveSessionImage(file, { session, state, log } = {}) {
  if (typeof file !== 'string' || file === '' || !fs.existsSync(file) || isArchived(file)) return file
  const slug = sessionSlug(session, state)
  if (slug === '') return file
  const dir = path.join(path.dirname(file), 'sessions', slug)
  const target = path.join(dir, path.basename(file))
  try {
    await fsp.mkdir(dir, { recursive: true })
    if (!fs.existsSync(target)) {
      try {
        await fsp.link(file, target)
      } catch {
        await fsp.copyFile(file, target)
      }
    }
    return target
  } catch (error) {
    log?.('warn', `could not archive image for session ${slug}: ${error?.message ?? error}`)
    return file
  }
}
