import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SCRIPT = [
  'import sys',
  'from PIL import ImageGrab',
  "im = ImageGrab.grab(all_screens=True).convert('RGB')",
  'im.save(sys.argv[1], quality=int(sys.argv[2]))',
  'print(im.size[0], im.size[1])',
].join('\n')

/**
 * Locate a Python with Pillow. Preference: explicit config, env override, the
 * Python bundled with DSH next to the host executable, then PATH.
 * @param {string} [configured]
 */
export function resolvePython(configured) {
  const candidates = [
    configured,
    process.env.DSH_QQ_PYTHON,
    process.env.DSH_PYTHON,
    path.join(path.dirname(process.execPath), 'resources', 'runtime', 'primary-runtime', 'dependencies', 'python', 'python.exe'),
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return 'python'
}

/**
 * Run the capture script and resolve its stdout.
 * @param {string} python
 * @param {string} file
 * @param {number} quality
 * @returns {Promise<string>}
 */
export function runPythonCapture(python, file, quality) {
  return new Promise((resolve, reject) => {
    execFile(python, ['-c', SCRIPT, file, String(quality)], { windowsHide: true, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message).trim()))
        return
      }
      resolve(stdout)
    })
  })
}

/**
 * Capture all screens into `dir` and return the JPEG path.
 * @param {{ dir: string, quality?: number, pythonPath?: string,
 *           runner?: (python: string, file: string, quality: number) => Promise<string>,
 *           now?: () => number }} options
 * @returns {Promise<string>}
 */
export async function captureScreen({ dir, quality = 70, pythonPath, runner = runPythonCapture, now = Date.now }) {
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `screenshot-${stamp}.jpg`)
  await runner(resolvePython(pythonPath), file, quality)
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error('screenshot was not written; is an interactive desktop available?')
  }
  return file
}
