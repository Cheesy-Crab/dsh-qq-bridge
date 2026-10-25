import assert from 'node:assert/strict'
import test from 'node:test'

import { registerNapCatHttp } from '../src/napcat-http.js'

function fakeServer() {
  let route
  return {
    register: (value) => {
      route = value
      return () => {}
    },
    route: () => route,
  }
}

function fakeResponse() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body = '') {
      this.body += String(body)
    },
  }
}

test('napcat http exposes status and actions', async () => {
  const server = fakeServer()
  const calls = []
  const napcat = {
    status: async () => ({ running: true, port: 6700, managed: true, external: false }),
    start: async () => {
      calls.push('start')
      return { managed: true }
    },
    stop: async () => ({ running: false }),
    restart: async () => ({ managed: true }),
  }
  registerNapCatHttp(server, napcat, () => {})
  const route = server.route()
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, '/qq-bridge')

  const status = fakeResponse()
  await route.handler({ url: '/qq-bridge/napcat/status', method: 'GET' }, status)
  assert.equal(status.status, 200)
  assert.equal(JSON.parse(status.body).running, true)

  const started = fakeResponse()
  await route.handler({ url: '/qq-bridge/napcat/start', method: 'POST' }, started)
  assert.deepEqual(JSON.parse(started.body), { managed: true })
  assert.deepEqual(calls, ['start'])

  const missing = fakeResponse()
  await route.handler({ url: '/qq-bridge/nope', method: 'GET' }, missing)
  assert.equal(missing.status, 404)
})

test('napcat http reports a missing QR file', async () => {
  const server = fakeServer()
  registerNapCatHttp(server, { status: async () => ({ qrFile: undefined }) }, () => {})
  const response = fakeResponse()
  await server.route().handler({ url: '/qq-bridge/napcat/qr', method: 'GET' }, response)
  assert.equal(response.status, 404)
})

function setupRequest(url, method = 'GET', body) {
  return {
    url,
    method,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  }
}

test('setup routes expose status and run install/API key/admin actions', async () => {
  const server = fakeServer()
  const calls = []
  const setup = {
    status: async () => ({ installed: true }),
    install: async (source) => {
      calls.push(['install', source])
      return { cwd: '/napcat', source }
    },
    setApiKey: async (key) => {
      calls.push(['key', key])
      return { configured: true }
    },
    setAdmin: async (openid) => {
      calls.push(['admin', openid])
      return { openid }
    },
    bridgeStatus: async () => ({ connected: true }),
  }
  registerNapCatHttp(server, { status: async () => ({}) }, () => {}, setup)
  const route = server.route()

  const status = fakeResponse()
  await route.handler(setupRequest('/qq-bridge/setup/status'), status)
  assert.equal(status.status, 200)
  assert.equal(JSON.parse(status.body).installed, true)

  const install = fakeResponse()
  await route.handler(setupRequest('/qq-bridge/setup/install', 'POST', { source: '' }), install)
  assert.equal(install.status, 200)

  const key = fakeResponse()
  await route.handler(setupRequest('/qq-bridge/setup/api-key', 'POST', { key: 'sk-test' }), key)
  assert.equal(key.status, 200)

  const admin = fakeResponse()
  await route.handler(setupRequest('/qq-bridge/setup/admin', 'POST', { openid: '12345' }), admin)
  assert.equal(admin.status, 200)
  assert.deepEqual(calls, [['install', ''], ['key', 'sk-test'], ['admin', '12345']])
})
