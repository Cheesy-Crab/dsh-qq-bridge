/**
 * Defaults are deliberately platform-neutral: every path is derived at runtime.
 * Windows users override `workspacesRoot` in their profile patch.
 */
export const DEFAULTS = Object.freeze({
  workspacesRoot: '',
  defaultWorkspaceName: 'default',
  stateFile: '',
  commandPrefix: '/',
  guestWorkspaceName: '_guest',
  apiKeyFile: '',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  registerToDsh: true,
  selfTest: false,
  selfTestModel: Object.freeze({ provider: 'deepseek-official', model: 'deepseek-flash' }),
  agent: Object.freeze({
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    preset: 'standard',
    turnTimeoutMs: 300000,
    maxQueue: 3,
  }),
  access: Object.freeze({
    admins: Object.freeze([]),
    bindCodeTtlMinutes: 5,
    whitelist: Object.freeze({}),
  }),
  approval: Object.freeze({
    timeoutSec: 120,
  }),
  sandbox: Object.freeze({
    modeByLevel: Object.freeze({
      L0: 'read-only',
      L1: 'read-only',
      L2: 'read-only',
      L3: 'danger-full-access',
    }),
  }),
  transport: Object.freeze({
    kind: 'onebot',
    echo: false,
    onebot: Object.freeze({
      mode: 'reverse',
      host: '127.0.0.1',
      port: 6700,
      path: '/',
      accessTokenEnv: 'QQ_ONEBOT_TOKEN',
      requestTimeoutMs: 10000,
    }),
  }),
  limits: Object.freeze({
    maxChars: 1800,
    maxWorkspaces: Object.freeze({ L1: 3, L2: 10, L3: 0 }),
    dailyTurns: Object.freeze({ L0: 20, L1: 200, L2: 1000, L3: 0 }),
  }),
  group: Object.freeze({
    enabled: true,
    sessionScope: 'shared',
    allowChat: true,
    replyWithMention: true,
  }),
})

const TRANSPORT_KINDS = new Set(['onebot', 'official', 'fake'])
const GROUP_SCOPES = new Set(['shared', 'per-sender'])

/**
 * Validate and normalize the plugin config row.
 * @param {unknown} raw
 * @returns {typeof DEFAULTS}
 * @throws {Error} with `.code = 'INVALID_CONFIG'`
 */
export function normalizeConfig(raw) {
  const fail = (message) => {
    const error = new Error(`invalid qq-bridge config: ${message}`)
    error.code = 'INVALID_CONFIG'
    throw error
  }
  if (raw !== undefined && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) {
    fail('config must be an object')
  }
  const input = raw ?? {}
  if (input.workspacesRoot !== undefined && typeof input.workspacesRoot !== 'string') {
    fail('workspacesRoot must be a string')
  }
  if (input.guestWorkspaceName !== undefined && (typeof input.guestWorkspaceName !== 'string' || input.guestWorkspaceName === '')) {
    fail('guestWorkspaceName must be a non-empty string')
  }
  if (input.apiKeyFile !== undefined && typeof input.apiKeyFile !== 'string') {
    fail('apiKeyFile must be a string')
  }
  if (input.apiKeyEnv !== undefined && (typeof input.apiKeyEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.apiKeyEnv))) {
    fail('apiKeyEnv must be an environment variable name')
  }
  if (input.stateFile !== undefined && typeof input.stateFile !== 'string') {
    fail('stateFile must be a string')
  }
  if (input.commandPrefix !== undefined && (typeof input.commandPrefix !== 'string' || input.commandPrefix.trim() === '')) {
    fail('commandPrefix must be a non-empty string')
  }
  const rawTransport = input.transport ?? {}
  const transport = {
    ...DEFAULTS.transport,
    ...rawTransport,
    onebot: { ...DEFAULTS.transport.onebot, ...(rawTransport.onebot ?? {}) },
  }
  if (!TRANSPORT_KINDS.has(transport.kind)) {
    fail(`transport.kind must be one of ${[...TRANSPORT_KINDS].join(', ')}`)
  }
  if (typeof transport.echo !== 'boolean') {
    fail('transport.echo must be a boolean')
  }
  if (!['reverse'].includes(transport.onebot.mode)) {
    fail('transport.onebot.mode must be "reverse" for now')
  }
  if (typeof transport.onebot.host !== 'string' || transport.onebot.host === '') {
    fail('transport.onebot.host must be a non-empty string')
  }
  if (!Number.isInteger(transport.onebot.port) || transport.onebot.port < 0 || transport.onebot.port > 65535) {
    fail('transport.onebot.port must be an integer in 0..65535')
  }
  if (typeof transport.onebot.path !== 'string' || !transport.onebot.path.startsWith('/')) {
    fail('transport.onebot.path must start with "/"')
  }
  if (transport.onebot.accessTokenEnv !== undefined && typeof transport.onebot.accessTokenEnv !== 'string') {
    fail('transport.onebot.accessTokenEnv must be a string when set')
  }
  if (!Number.isInteger(transport.onebot.requestTimeoutMs) || transport.onebot.requestTimeoutMs <= 0) {
    fail('transport.onebot.requestTimeoutMs must be a positive integer')
  }
  const group = { ...DEFAULTS.group, ...(input.group ?? {}) }
  if (!GROUP_SCOPES.has(group.sessionScope)) {
    fail(`group.sessionScope must be one of ${[...GROUP_SCOPES].join(', ')}`)
  }
  const rawLimits = input.limits ?? {}
  const limits = {
    ...DEFAULTS.limits,
    ...rawLimits,
    maxWorkspaces: { ...DEFAULTS.limits.maxWorkspaces, ...(rawLimits.maxWorkspaces ?? {}) },
    dailyTurns: { ...DEFAULTS.limits.dailyTurns, ...(rawLimits.dailyTurns ?? {}) },
  }
  if (!Number.isInteger(limits.maxChars) || limits.maxChars <= 0) {
    fail('limits.maxChars must be a positive integer')
  }
  for (const [level, value] of Object.entries(limits.maxWorkspaces)) {
    if (!Number.isInteger(value) || value < 0) fail(`limits.maxWorkspaces.${level} must be a non-negative integer`)
  }
  for (const [level, value] of Object.entries(limits.dailyTurns)) {
    if (!Number.isInteger(value) || value < 0) fail(`limits.dailyTurns.${level} must be a non-negative integer`)
  }

  const access = { ...DEFAULTS.access, ...(input.access ?? {}) }
  if (!Array.isArray(access.admins) || access.admins.some((id) => typeof id !== 'string')) {
    fail('access.admins must be an array of openid strings')
  }
  if (!Number.isInteger(access.bindCodeTtlMinutes) || access.bindCodeTtlMinutes <= 0) {
    fail('access.bindCodeTtlMinutes must be a positive integer')
  }
  if (access.whitelist === null || typeof access.whitelist !== 'object' || Array.isArray(access.whitelist)) {
    fail('access.whitelist must be an object of openid → capability array')
  }
  const allowedCapabilities = new Set(['workspace', 'read', 'write', 'exec'])
  for (const [openid, capabilities] of Object.entries(access.whitelist)) {
    if (!Array.isArray(capabilities)) fail(`access.whitelist.${openid} must be an array`)
    for (const capability of capabilities) {
      if (!allowedCapabilities.has(capability)) {
        fail(`access.whitelist.${openid} has unknown capability ${JSON.stringify(capability)}`)
      }
    }
  }

  const approval = { ...DEFAULTS.approval, ...(input.approval ?? {}) }
  if (!Number.isInteger(approval.timeoutSec) || approval.timeoutSec <= 0) {
    fail('approval.timeoutSec must be a positive integer')
  }

  const SANDBOX_MODES = new Set(['read-only', 'workspace-write', 'danger-full-access'])
  const rawSandbox = input.sandbox ?? {}
  const sandbox = {
    ...DEFAULTS.sandbox,
    ...rawSandbox,
    modeByLevel: { ...DEFAULTS.sandbox.modeByLevel, ...(rawSandbox.modeByLevel ?? {}) },
  }
  for (const [level, mode] of Object.entries(sandbox.modeByLevel)) {
    if (!SANDBOX_MODES.has(mode)) {
      fail(`sandbox.modeByLevel.${level} must be one of ${[...SANDBOX_MODES].join(', ')}`)
    }
  }
  const agent = { ...DEFAULTS.agent, ...(input.agent ?? {}) }
  if (typeof agent.provider !== 'string' || agent.provider === '') fail('agent.provider must be a non-empty string')
  if (typeof agent.model !== 'string' || agent.model === '') fail('agent.model must be a non-empty string')
  if (typeof agent.preset !== 'string' || agent.preset === '') fail('agent.preset must be a non-empty string')
  if (!Number.isInteger(agent.turnTimeoutMs) || agent.turnTimeoutMs <= 0) fail('agent.turnTimeoutMs must be a positive integer')
  if (!Number.isInteger(agent.maxQueue) || agent.maxQueue <= 0) fail('agent.maxQueue must be a positive integer')
  if (input.defaultWorkspaceName !== undefined) {
    if (typeof input.defaultWorkspaceName !== 'string' || input.defaultWorkspaceName.trim() === '') {
      fail('defaultWorkspaceName must be a non-empty string')
    }
  }
  const selfTestModel = { ...DEFAULTS.selfTestModel, ...(input.selfTestModel ?? {}) }
  if (typeof selfTestModel.provider !== 'string' || typeof selfTestModel.model !== 'string') {
    fail('selfTestModel.provider and .model must be strings')
  }
  return {
    ...DEFAULTS,
    ...input,
    transport,
    group,
    limits,
    agent,
    access,
    approval,
    sandbox,
    selfTestModel,
  }
}
