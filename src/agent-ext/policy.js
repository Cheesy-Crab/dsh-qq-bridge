import { toolAllowed } from '../access/capabilities.js'

/**
 * Install approval policy and the non-L3 tool guard on an agent.
 * The guard closes over live state, so capability/level changes apply next turn.
 * @param {{ approval?: any, agent: any, level: string, state: any,
 *           log: (level: string, message: string) => void }} options
 */
export function applyAgentPolicy({ approval, agent, level, state, log }) {
  const capabilities = state.capabilities ?? []
  const policy = level === 'L3' || capabilities.length > 0 ? 'ask' : 'never'
  if (state.approvalPolicy !== policy) {
    try {
      approval?.setPolicy?.(agent, policy)
      state.approvalPolicy = policy
    } catch (error) {
      log?.('warn', `approval policy was not set: ${error?.message ?? error}`)
    }
  }
  if (!state.guarded) {
    guardAgentTools(agent, state, log)
    state.guarded = true
  }
}

/**
 * Non-L3 sessions are chat-only unless capabilities are whitelisted.
 * Preset tools are scoped registrations, so a guard is the enforcement seam;
 * `tools.restrict` only masks host-global tools.
 * @param {any} agent
 * @param {any} state
 * @param {(level: string, message: string) => void} log
 */
export function guardAgentTools(agent, state, log) {
  try {
    agent.ctx.tools.guard((exec) => {
      if (state.level === 'L3') return undefined
      const name = exec?.toolName ?? exec?.tool?.name ?? exec?.name
      return toolAllowed(name, state.capabilities ?? []) ? undefined : '当前账号仅允许聊天；该工具需要管理员加入白名单'
    })
  } catch (error) {
    log?.('warn', `tool guard was not installed: ${error?.message ?? error}`)
  }
}
