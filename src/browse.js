import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: false, timeout: 120000 }, (error, stdout) => {
      if (error) {
        resolve(undefined)
        return
      }
      resolve(String(stdout).trim() || undefined)
    })
  })
}

/**
 * Open the OS folder picker and return the selected absolute path.
 * Uses Electron's native dialog when the Host runs inside Desktop, otherwise
 * falls back to PowerShell / zenity / osascript.
 * @param {{ platform?: NodeJS.Platform, log?: (level: string, message: string) => void }} [options]
 * @returns {Promise<string | undefined>}
 */
export async function pickDirectory({ platform = process.platform, log } = {}) {
  try {
    const electron = require('electron')
    if (electron?.dialog?.showOpenDialog) {
      const result = await electron.dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (!result.canceled && result.filePaths?.[0]) return result.filePaths[0]
      return undefined
    }
  } catch {
    // not running inside Electron
  }

  if (platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$d.Description = '选择 NapCat 目录'",
      "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }",
    ].join('; ')
    return run('powershell.exe', ['-NoProfile', '-Sta', '-Command', script])
  }
  if (platform === 'darwin') {
    return run('osascript', ['-e', 'POSIX path of (choose folder with prompt "选择 NapCat 目录")'])
  }
  return run('zenity', ['--file-selection', '--directory', '--title=选择 NapCat 目录'])
}
