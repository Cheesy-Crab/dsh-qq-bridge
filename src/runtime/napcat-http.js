import fs from 'node:fs'

const PREFIX = '/qq-bridge'
const CONTROL_HEADER = 'x-qq-bridge-control'

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendPng(res, file) {
  const data = fs.readFileSync(file)
  res.writeHead(200, {
    'content-type': 'image/png',
    'content-length': data.length,
    'cache-control': 'no-store',
  })
  res.end(data)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? {} : JSON.parse(text)
}

/**
 * Expose the NapCat supervisor and one-time setup over HTTP.
 * `setup` is optional; without it only the NapCat controls are available.
 * @param {{ register?: Function } | undefined} webServer
 * @param {any} napcat
 * @param {(level: string, message: string) => void} log
 * @param {{ status?: Function, install?: Function, setApiKey?: Function, setAdmin?: Function,
 *           bridgeStatus?: Function } | undefined} [setup]
 * @returns {() => void}
 */
export function registerNapCatHttp(webServer, napcat, log, setup) {
  if (!webServer?.register) {
    log?.('warn', 'webServer unavailable; QQ Bridge settings buttons will not work')
    return () => {}
  }
  return webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const route = url.pathname.slice(PREFIX.length) || '/'
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      // Mutations must carry a custom header. A cross-origin page cannot set
      // it without a CORS preflight, and this route no longer grants CORS.
      if (req.method !== 'GET' && req.headers?.[CONTROL_HEADER] !== '1') {
        sendJson(res, 403, { error: 'missing control header' })
        return
      }
      try {
        if (route === '/setup/status' && req.method === 'GET') {
          if (!setup?.status) throw new Error('部署接口不可用')
          sendJson(res, 200, await setup.status())
          return
        }
        if (route === '/setup/install' && req.method === 'POST') {
          if (!setup?.install) throw new Error('部署接口不可用')
          const body = await readJson(req)
          sendJson(res, 200, await setup.install(String(body.source ?? '')))
          return
        }
        if (route === '/setup/browse' && req.method === 'POST') {
          if (!setup?.browse) throw new Error('部署接口不可用')
          sendJson(res, 200, { path: await setup.browse() })
          return
        }
        if (route === '/setup/napcat-path' && req.method === 'POST') {
          if (!setup?.useNapcat) throw new Error('部署接口不可用')
          const body = await readJson(req)
          sendJson(res, 200, await setup.useNapcat(String(body.path ?? '')))
          return
        }
        if (route === '/setup/api-key' && req.method === 'POST') {
          if (!setup?.setApiKey) throw new Error('部署接口不可用')
          const body = await readJson(req)
          sendJson(res, 200, await setup.setApiKey(String(body.key ?? '')))
          return
        }
        if (route === '/setup/admin' && req.method === 'POST') {
          if (!setup?.setAdmin) throw new Error('部署接口不可用')
          const body = await readJson(req)
          sendJson(res, 200, await setup.setAdmin(String(body.openid ?? '')))
          return
        }
        if (route === '/napcat/qr/refresh' && req.method === 'POST') {
          await napcat.stop()
          sendJson(res, 200, await napcat.start(true))
          return
        }
        if (route === '/bridge/status' && req.method === 'GET') {
          if (!setup?.bridgeStatus) throw new Error('部署接口不可用')
          sendJson(res, 200, await setup.bridgeStatus())
          return
        }
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
