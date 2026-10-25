import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { loadApiKey, parseApiKey, resolveApiKeyFile } from '../src/core/secrets.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-secrets-'))
const keyFile = path.join(tmp, 'key.txt')

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))

test('parse accepts a bare key', () => {
  assert.equal(parseApiKey('sk-abc123', 'DEEPSEEK_API_KEY'), 'sk-abc123')
  assert.equal(parseApiKey('\uFEFFsk-abc123\n', 'DEEPSEEK_API_KEY'), 'sk-abc123')
  assert.equal(parseApiKey('  "sk-quoted"  ', 'DEEPSEEK_API_KEY'), 'sk-quoted')
})

test('parse accepts NAME=value, comments and blank lines', () => {
  const content = [
    '# my key',
    '// another comment',
    '',
    'OTHER=ignored',
    'DEEPSEEK_API_KEY = sk-from-assignment',
  ].join('\n')
  assert.equal(parseApiKey(content, 'DEEPSEEK_API_KEY'), 'sk-from-assignment')
})

test('parse rejects empty, comment-only and whitespace keys', () => {
  assert.equal(parseApiKey('', 'DEEPSEEK_API_KEY'), null)
  assert.equal(parseApiKey('# only a comment\n', 'DEEPSEEK_API_KEY'), null)
  assert.equal(parseApiKey('sk-with space', 'DEEPSEEK_API_KEY'), null)
  assert.equal(parseApiKey('OTHER=sk-abc', 'DEEPSEEK_API_KEY'), null)
})

test('resolveApiKeyFile defaults under DSH_HOME and expands placeholders', () => {
  const home = path.join(tmp, 'home')
  assert.equal(
    resolveApiKeyFile(undefined, { DSH_HOME: home }),
    path.resolve(home, 'deepseek-key.txt'),
  )
  assert.equal(
    resolveApiKeyFile('${DSH_HOME}/custom/key', { DSH_HOME: home }),
    path.resolve(home, 'custom/key'),
  )
})

test('loadApiKey installs the key and never logs it', () => {
  fs.writeFileSync(keyFile, 'DEEPSEEK_API_KEY=sk-super-secret\n')
  const env = {}
  const lines = []
  const result = loadApiKey({ file: keyFile, envName: 'DEEPSEEK_API_KEY', env, log: (_l, m) => lines.push(m) })

  assert.equal(result.applied, true)
  assert.equal(env.DEEPSEEK_API_KEY, 'sk-super-secret')
  assert.equal(lines.some((line) => line.includes('sk-super-secret')), false)
})

test('loadApiKey does not override an existing environment value', () => {
  fs.writeFileSync(keyFile, 'sk-from-file\n')
  const env = { DEEPSEEK_API_KEY: 'sk-from-env' }
  const result = loadApiKey({ file: keyFile, envName: 'DEEPSEEK_API_KEY', env, log: () => {} })
  assert.equal(result.applied, false)
  assert.equal(env.DEEPSEEK_API_KEY, 'sk-from-env')
})

test('loadApiKey tolerates a missing file', () => {
  const env = {}
  const lines = []
  const result = loadApiKey({ file: path.join(tmp, 'nope.txt'), envName: 'DEEPSEEK_API_KEY', env, log: (_l, m) => lines.push(m) })
  assert.equal(result.applied, false)
  assert.equal(env.DEEPSEEK_API_KEY, undefined)
  assert.match(lines[0], /file unavailable/)
})
