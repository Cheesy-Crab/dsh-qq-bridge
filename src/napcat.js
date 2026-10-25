import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Locate a NapCat shell directory (the one containing napcat.bat/sh), including
 * archives that unpack into a single top-level folder.
 * @param {string} root
 * @returns {string | undefined}
 */
export function findNapcatDir(root) {
  if (!root || !fs.existsSync(root)) return undefined
  const script = process.platform === 'win32' ? 'napcat.bat' : 'napcat.sh'
  if (fs.existsSync(path.join(root, script))) return root
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(root, entry.name)
    if (fs.existsSync(path.join(candidate, script))) return candidate
  }
  return undefined
}

/**
 * Probe whether something already listens on the OneBot port.
 * @param {number} port
 * @param {number} [timeoutMs]
 */
export function isPortOpen(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (value) => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/**
 * Supervises a NapCat installation that ships inside `vendor/napcat`.
 * It never kills an externally started NapCat occupying the same port.
 */
export class NapCatSupervisor {
  /**
   * @param {{ config: any, log: (level: string, message: string) => void, port: number,
   *           isConnected?: () => boolean }} options
   */
  constructor({ config, log, port, isConnected = () => false, settingsFile }) {
    this.config = config
    this.log = log
    this.port = port
    this.isConnected = isConnected
    this.settingsPath = settingsFile
    this.child = undefined
    this.stopping = false
    this.external = false
    this.lastExit = undefined
    this.restartTimer = undefined
    this.installedCwd = undefined
    this.loadSettings()
  }

  settingsFile() {
    return this.settingsPath ?? path.join(os.homedir(), '.dsh', 'qq-bridge', 'settings.json')
  }

  loadSettings() {
    try {
      const value = JSON.parse(fs.readFileSync(this.settingsFile(), 'utf8'))
      if (typeof value?.napcatCwd === 'string' && findNapcatDir(value.napcatCwd)) {
        this.installedCwd = value.napcatCwd
      }
    } catch {}
  }

  dataDir() {
    return path.join(os.homedir(), '.dsh', 'qq-bridge', 'napcat')
  }

  /** Remember a directory produced by the setup installer or picked by the user. */
  setCwd(dir) {
    this.installedCwd = dir
    try {
      fs.mkdirSync(path.dirname(this.settingsFile()), { recursive: true })
      fs.writeFileSync(this.settingsFile(), `${JSON.stringify({ napcatCwd: dir }, null, 2)}\n`)
    } catch {}
  }

  cwd() {
    if (this.installedCwd) return this.installedCwd
    if (this.config.cwd) return this.config.cwd
    const candidates = [
      path.join(PLUGIN_DIR, 'vendor', 'napcat'),
      this.dataDir(),
    ]
    for (const candidate of candidates) {
      const found = findNapcatDir(candidate)
      if (found) return found
    }
    return this.dataDir()
  }

  command() {
    if (this.config.command) return this.config.command
    return path.join(this.cwd(), process.platform === 'win32' ? 'napcat.bat' : 'napcat.sh')
  }

  qrFile() {
    return path.join(this.cwd(), 'napcat', 'cache', 'qrcode.png')
  }

  async status() {
    const connected = this.isConnected()
    const qrFile = this.qrFile()
    let qrMtime
    try {
      qrMtime = fs.statSync(qrFile).mtimeMs
    } catch {}
    return {
      enabled: this.config.enabled,
      autoStart: this.config.autoStart,
      running: Boolean(this.child) || connected,
      managed: Boolean(this.child),
      external: !this.child && connected,
      pid: this.child?.pid,
      port: this.port,
      cwd: this.cwd(),
      dataDir: this.dataDir(),
      installed: Boolean(findNapcatDir(this.cwd())),
      command: this.command(),
      lastExit: this.lastExit,
      qrFile: fs.existsSync(qrFile) ? qrFile : undefined,
      qrMtime,
    }
  }

  async start() {
    if (this.child) return this.status()
    if (this.isConnected()) {
      this.external = true
      this.log('info', 'napcat: an external OneBot client is already connected; leaving it alone')
      return this.status()
    }
    try {
      fs.rmSync(this.qrFile(), { force: true })
    } catch {}
    const cwd = this.cwd()
    if (!fs.existsSync(cwd)) throw new Error(`NapCat 目录不存在：${cwd}`)
    const command = this.command()
    if (!fs.existsSync(command) && !this.config.command) throw new Error(`NapCat 启动脚本不存在：${command}`)

    this.stopping = false
    this.external = false
    const isBatch = /\.(bat|cmd)$/i.test(command)
    const file = isBatch ? process.env.ComSpec ?? 'cmd.exe' : command
    const args = isBatch ? ['/c', command, ...(this.config.args ?? [])] : [...(this.config.args ?? [])]
    this.log('info', `napcat: starting ${command} (cwd=${cwd})`)

    const child = spawn(file, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    const logLine = (stream) => (chunk) => {
      const text = String(chunk).trimEnd()
      if (text) this.log('info', `napcat[${stream}]: ${text.slice(0, 500)}`)
    }
    child.stdout?.on('data', logLine('out'))
    child.stderr?.on('data', logLine('err'))
    child.once('error', (error) => {
      this.log('error', `napcat: failed to start: ${error?.message ?? error}`)
      this.child = undefined
    })
    child.once('exit', (code, signal) => {
      this.child = undefined
      this.lastExit = { code, signal, at: Date.now() }
      this.log('warn', `napcat: exited code=${code} signal=${signal}`)
      if (!this.stopping && this.config.restart) {
        this.restartTimer = setTimeout(() => {
          this.start().catch((error) => this.log('error', `napcat: restart failed: ${error?.message ?? error}`))
        }, this.config.restartDelayMs)
      }
    })
    return this.status()
  }

  async stop() {
    this.stopping = true
    clearTimeout(this.restartTimer)
    this.restartTimer = undefined
    if (!this.child) {
      if (this.isConnected()) {
        this.log('warn', 'napcat: an external OneBot client is connected; not killing it')
      }
      return this.status()
    }
    const child = this.child
    const pid = child.pid
    this.log('info', `napcat: stopping pid=${pid}`)
    await new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      child.once('exit', done)
      if (process.platform === 'win32') {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {})
      } else {
        child.kill('SIGTERM')
      }
      setTimeout(done, 5000)
    })
    this.child = undefined
    return this.status()
  }

  async restart() {
    await this.stop()
    this.stopping = false
    return this.start()
  }
}
