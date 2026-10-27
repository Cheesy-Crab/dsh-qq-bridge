// Compatibility shim. Platform delivery lives in src/platform/delivery.js.
import { forwardMediaOutputs } from '../platform/delivery.js'
import { presentedImages } from './present.js'
import { archiveSessionImage } from './session-images.js'

export { forwardMediaOutputs, generatedImageRecords, generatedImages } from '../platform/delivery.js'

/**
 * Legacy QQ callers expect present dedupe and session archiving by default.
 * New platform callers should use forwardMediaOutputs and pass these explicitly.
 */
export async function forwardGeneratedImages(options) {
  return forwardMediaOutputs({
    ...options,
    presentedFor: options.presentedFor ?? presentedImages,
    archive: options.archive ?? archiveSessionImage,
  })
}
