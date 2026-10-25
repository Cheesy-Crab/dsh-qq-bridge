import assert from 'node:assert/strict'
import test from 'node:test'

import { CAPABILITIES, normalizeCapabilities, toolAllowed } from '../src/access/capabilities.js'

test('image capability allows generation and presentation tools only', () => {
  assert.ok(CAPABILITIES.includes('image'))
  assert.deepEqual(normalizeCapabilities(['image', 'IMAGE', 'nope']), ['image'])
  for (const tool of ['generate_image', 'generate_images', 'edit_image', 'estimate_image_cost', 'enhance_prompt', 'present', 'read_image', 'skill']) {
    assert.equal(toolAllowed(tool, ['image']), true, tool)
  }
  assert.equal(toolAllowed('pwsh', ['image']), false)
  assert.equal(toolAllowed('write', ['image']), false)
})

test('exec still implies the whole toolset', () => {
  assert.equal(toolAllowed('generate_image', ['exec']), true)
  assert.equal(toolAllowed('pwsh', ['exec']), true)
})
