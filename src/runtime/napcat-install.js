import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { findNapcatDir } from './napcat.js'

const RELEASE_API = 'https://api.github.com/repos/NapCatQQ/NapCatQQ/releases/latest'

async function latestAsset(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(RELEASE_API, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-qq-bridge' },
  })
  if (!response.ok) throw new Error(`无法读取 NapCat Release（HTTP ${response.status}）`)
  const release = await response.json()
  const assets = release.assets ?? []
  const asset = assets.find((item) => /shell.*windows.*\.zip$/i.test(item.name))
    ?? assets.find((item) => /shell.*\.zip$/i.test(item.name))
    ?? assets.find((item) => /\.zip$/i.test(item.name))
  if (!asset) throw new Error('Release 里没有找到 Shell zip')
  return { url: asset.browser_download_url, name: asset.name, version: release.tag_name }
}

async function download(url, file, fetchImpl) {
  const response = await fetchImpl(url, { redirect: 'follow', headers: { 'user-agent': 'dsh-qq-bridge' } })
  if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file))
  return file
}

function extract(zip, dir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dir, { recursive: true })
    execFile('tar', ['-xf', zip, '-C', dir], { windowsHide: true, timeout: 600000 }, (error, _stdout, stderr) => {
      if (!error) {
        resolve()
        return
      }
      execFile('unzip', ['-o', zip, '-d', dir], { windowsHide: true, timeout: 600000 }, (unzipError, _out, unzipStderr) => {
        if (unzipError) {
          const reason = String(stderr || unzipStderr || error.message).trim()
          reject(new Error(`解压失败：${reason}`))
          return
        }
        resolve()
      })
    })
  })
}

/**
 * Install or locate a NapCat runtime.
 * `source` accepts: http(s) zip URL, local .zip, local NapCat directory, or
 * empty to resolve the latest official Windows Shell asset.
 * @param {{ source?: string, dir?: string, log?: (level: string, message: string) => void,
 *           fetchImpl?: typeof fetch, tempDir?: string }} options
 * @returns {Promise<{ cwd: string, source: string, version?: string }>}
 */
export async function installNapcat({ source = '', dir, log, fetchImpl = globalThis.fetch, tempDir } = {}) {
  const target = dir ?? path.join(os.homedir(), '.dsh', 'qq-bridge', 'napcat')
  const input = String(source ?? '').trim()

  if (input && !/^https?:\/\//i.test(input) && !/\.zip$/i.test(input)) {
    const found = findNapcatDir(input)
    if (!found) throw new Error(`目录里没有 napcat.bat：${input}`)
    log?.('info', `napcat: using local directory ${found}`)
    return { cwd: found, source: found }
  }

  let zip
  let version
  let from = input
  if (/^https?:\/\//i.test(input)) {
    zip = path.join(tempDir ?? os.tmpdir(), `napcat-${Date.now()}.zip`)
    await download(input, zip, fetchImpl)
  } else if (input) {
    if (!fs.existsSync(input)) throw new Error(`本地 zip 不存在：${input}`)
    zip = input
  } else {
    const latest = await latestAsset(fetchImpl)
    from = latest.url
    version = latest.version
    zip = path.join(tempDir ?? os.tmpdir(), `napcat-${Date.now()}.zip`)
    log?.('info', `napcat: downloading ${latest.name} ${latest.version}`)
    await download(latest.url, zip, fetchImpl)
  }

  log?.('info', `napcat: extracting ${zip} -> ${target}`)
  await extract(zip, target)
  const found = findNapcatDir(target)
  if (!found) throw new Error('解压后没有找到 napcat.bat')
  log?.('info', `napcat: installed at ${found}`)
  return { cwd: found, source: from, version }
}
