import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { forwardGeneratedImages } from './helpers/generated-images.js'
import { archiveSessionImage } from '../src/agent-ext/session-images.js'

test('generated images are archived under their session directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-session-images-'))
  test.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sourceDir = path.join(root, 'dsh-image-gen')
  fs.mkdirSync(sourceDir, { recursive: true })
  const source = path.join(sourceDir, 'image-abc12345.jpg')
  fs.writeFileSync(source, 'image-bytes')

  const session = { header: { id: 'sess-qq-test123' } }
  const target = await archiveSessionImage(source, { session })
  assert.equal(target, path.join(sourceDir, 'sessions', 'sess-qq-test123', 'image-abc12345.jpg'))
  assert.equal(fs.readFileSync(target, 'utf8'), 'image-bytes')

  // Archiving again is idempotent and keeps the canonical file intact.
  assert.equal(await archiveSessionImage(source, { session }), target)
  assert.equal(fs.existsSync(source), true)

  const sent = []
  const fakeSession = {
    header: { id: 'sess-qq-test123' },
    snapshotEvents: () => [{ type: 'tool/result', data: { meta: { kind: 'dsh-image-gen', savedTo: source } } }],
  }
  await forwardGeneratedImages({
    sendImage: async (_chat, file) => sent.push(file),
    chat: {},
    session: fakeSession,
    fromSeq: 0,
    log: () => {},
  })
  assert.deepEqual(sent, [target])
})
