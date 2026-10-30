import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { saveIncomingImage } from '../src/agent-ext/images.js'
import { QqBridge } from '../src/qq/bridge.js'
import { imagesOf } from '../src/transport/onebot.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-images-'))

test('imagesOf extracts OneBot image segments', () => {
  const images = imagesOf([
    { type: 'text', data: { text: '看图' } },
    { type: 'image', data: { file: 'a.jpg', url: 'https://example.test/a.jpg', file_id: 'f1' } },
  ])
  assert.deepEqual(images, [{ file: 'a.jpg', url: 'https://example.test/a.jpg', fileId: 'f1', summary: undefined }])
})

test('saveIncomingImage decodes base64 segments', async () => {
  const file = await saveIncomingImage({ file: `base64://${Buffer.from([1, 2, 3]).toString('base64')}` }, dir)
  assert.equal(path.extname(file), '.jpg')
  assert.deepEqual([...fs.readFileSync(file)], [1, 2, 3])
})

test('saveIncomingImage copies local files and keeps the extension', async () => {
  const source = path.join(dir, 'source.png')
  fs.writeFileSync(source, Buffer.from([9, 8, 7]))
  const file = await saveIncomingImage({ file: source }, path.join(dir, 'local'))
  assert.equal(path.extname(file), '.png')
  assert.deepEqual([...fs.readFileSync(file)], [9, 8, 7])
})

test('saveIncomingImage downloads http images with a content type', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'image/png; charset=binary' },
    arrayBuffer: async () => Buffer.from([5, 4, 3]),
  })
  const file = await saveIncomingImage({ url: 'https://example.test/x' }, path.join(dir, 'http'), { fetchImpl })
  assert.equal(path.extname(file), '.png')
  assert.deepEqual([...fs.readFileSync(file)], [5, 4, 3])
})

test('saveIncomingImage rejects segments without a source', async () => {
  await assert.rejects(() => saveIncomingImage({}, dir), /找不到可下载的图片地址/)
})

test('image download falls back to NapCat get_image for file ids', async () => {
  const source = path.join(dir, 'resolved.jpg')
  fs.writeFileSync(source, Buffer.from([7, 8, 9]))
  const bridge = Object.create(QqBridge.prototype)
  bridge.transport = {
    action: async (action, params) => {
      assert.equal(action, 'get_image')
      assert.equal(params.file_id, 'file-id')
      return { file: source }
    },
  }
  const file = await bridge.resolveIncomingImage({ fileId: 'file-id' }, path.join(dir, 'resolved'))
  assert.equal(path.extname(file), '.jpg')
  assert.deepEqual([...fs.readFileSync(file)], [7, 8, 9])
})
