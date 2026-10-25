import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchCivitaiBalance } from '../src/core/civitai-account.js'

test('Civitai balance reads blue/green/yellow and sums total', async () => {
  const calls = []
  const credentials = { resolve: async () => ({ value: 'secret-token' }) }
  const balance = await fetchCivitaiBalance(credentials, {
    fetch: async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization })
      return new Response(JSON.stringify({ result: { data: { json: { blue: 1, green: 2, yellow: 3 } } } }), { status: 200 })
    },
  })
  assert.deepEqual(balance, { blue: 1, green: 2, yellow: 3, total: 6 })
  assert.equal(calls[0].url, 'https://civitai.com/api/trpc/buzz.getBuzzAccount')
  assert.equal(calls[0].auth, 'Bearer secret-token')
})

test('Civitai balance reports a missing token and scope failure', async () => {
  await assert.rejects(
    fetchCivitaiBalance({ resolve: async () => undefined }),
    /未配置 Civitai API Token/,
  )
  await assert.rejects(
    fetchCivitaiBalance(
      { resolve: async () => ({ value: 'token' }) },
      { fetch: async () => new Response('{}', { status: 403 }) },
    ),
    /BuzzRead 权限/,
  )
})
