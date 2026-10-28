/**
 * Install approval policy and the non-L3 tool guard on an agent.
 * The guard closes over live state, so capability/level changes apply next turn.
 * @param {{ approval?: any, agent: any, level: string, state: any,
 *           log: (level: string, message: string) => void }} options
 */
export function applyAgentPolicy({ approval, agent, level, state, profile, log, toolAllowed }) {
  const accessGrants = state.accessGrants ?? []
  const policy = level === 'L3' || accessGrants.length > 0 ? 'ask' : 'never'
  if (state.approvalPolicy !== policy) {
    try {
      approval?.setPolicy?.(agent, policy)
      state.approvalPolicy = policy
    } catch (error) {
      log?.('warn', `approval policy was not set: ${error?.message ?? error}`)
    }
  }
  if (!state.guarded) {
    guardAgentTools(agent, state, log, toolAllowed, profile)
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
export function guardAgentTools(agent, state, log, toolAllowed, profile) {
  try {
    agent.ctx.tools.guard((exec) => {
      const name = exec?.toolName ?? exec?.tool?.name ?? exec?.name
      const policy = profile?.toolPolicy
      if (Array.isArray(policy?.deny) && policy.deny.includes(name)) {
        return `当前 profile 不允许使用工具：${String(name)}`
      }
      if (Array.isArray(policy?.allow) && policy.allow.length > 0 && !policy.allow.includes(name)) {
        return `当前 profile 仅允许：${policy.allow.join(', ')}`
      }
      if (/^(generate_image|generate_images|edit_image)$/i.test(String(name ?? ''))
        && Number.isFinite(state.imageQuota) && state.imageQuota <= 0) {
        return '生图额度不足；请联系管理员分配额度'
      }
      if (state.level === 'L3') return undefined
      if (!toolAllowed(name, state.accessGrants ?? [])) return '当前账号仅允许聊天；该工具需要管理员加入白名单'
      return undefined
    })
  } catch (error) {
    log?.('warn', `tool guard was not installed: ${error?.message ?? error}`)
  }
}
