import { forwardMediaOutputs } from '@dsh/platform-core/delivery'
import { presentedImages } from '../../src/agent-ext/present.js'
import { archiveSessionImage } from '../../src/agent-ext/session-images.js'

export async function forwardGeneratedImages(options) {
  return forwardMediaOutputs({
    ...options,
    presentedFor: options.presentedFor ?? presentedImages,
    archive: options.archive ?? archiveSessionImage,
  })
}
