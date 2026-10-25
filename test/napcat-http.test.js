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
