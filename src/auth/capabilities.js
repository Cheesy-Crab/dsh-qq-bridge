export const CAPABILITIES = Object.freeze(['workspace', 'read', 'write', 'exec'])

/**
 * @param {unknown} input
 * @returns {string[]} deduplicated valid capabilities
 */
export function normalizeCapabilities(input) {
  if (!Array.isArray(input)) return []
  return [...new Set(input.map((value) => String(value).toLowerCase()).filter((value) => CAPABILITIES.includes(value)))]
}

/**
 * Capabilities that actually take effect. L3 is implicitly everything.
 * @param {{ level: string, capabilities?: string[] }} user
 * @returns {string[]}
 */
export function effectiveCapabilities(user) {
  if (user.level === 'L3') return [...CAPABILITIES]
  return normalizeCapabilities(user.capabilities ?? [])
}

/**
 * Whether a tool name is permitted by the granted capabilities. `exec` implies
 * the whole toolset; `write` implies read tools; `read` is read-only.
 * @param {string} toolName
 * @param {string[]} capabilities
 */
export function toolAllowed(toolName, capabilities) {
  const name = String(toolName ?? '')
  const caps = new Set(capabilities)
  if (caps.has('exec')) return true
  if (caps.has('write') && /^(write|edit|apply_patch|read|glob|grep|working_directory|list|find)/i.test(name)) return true
  if (caps.has('read') && /^(read|glob|grep|working_directory|list|find)/i.test(name)) return true
  return false
}
