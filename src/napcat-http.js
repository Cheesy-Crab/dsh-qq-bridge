import fs from 'node:fs'

const PREFIX = '/qq-bridge'

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(body)
}

function sendPng(res, file) {
  const data = fs.readFileSync(file)
  res.writeHead(200, {
    'content-type': 'image/png',
    'content-length': data.length,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  })
  res.end(data)
}

/**
 * Expose the NapCat supervisor to the DSH settings page over HTTP.
 * The listener is loopback-only, and the actions are limited to start/stop.
 * @param {{ register?: Function } | undefined} webServer
 * @param {any} napcat
 * @param {(level: string, message: string) => void} log
 * @returns {() => void}
 */
export function registerNapCatHttp(webServer, napcat, log) {
  if (!webServer?.register) {
    log?.('warn', 'webServer unavailable; NapCat settings buttons will not work')
    return () => {}
  }
  return webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const route = url.pathname.slice(PREFIX.length) || '/'
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        })
        res.end()
        return
      }
      try {
        if (route === '/napcat/status' && req.method === 'GET') {
          sendJson(res, 200, await napcat.status())
          return
        }
        if (route === '/napcat/qr' && req.method === 'GET') {
          const status = await napcat.status()
          if (!status.qrFile) {
            sendJson(res, 404, { error: '没有可用的二维码文件' })
            return
          }
          sendPng(res, status.qrFile)
          return
        }
        const action = /^\/napcat\/(start|stop|restart)$/.exec(route)?.[1]
        if (action && req.method === 'POST') {
          if (action === 'start') sendJson(res, 200, await napcat.start())
          else if (action === 'stop') sendJson(res, 200, await napcat.stop())
          else sendJson(res, 200, await napcat.restart())
          return
        }
        sendJson(res, 404, { error: 'not found' })
      } catch (error) {
        log?.('warn', `napcat http failed: ${error?.message ?? error}`)
        sendJson(res, 500, { error: String(error?.message ?? error) })
      }
    },
  })
}
