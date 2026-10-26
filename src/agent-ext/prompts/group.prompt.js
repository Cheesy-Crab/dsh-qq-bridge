/**
 * Group-only system prompt. Private chats never receive this section.
 * @param {any} agent
 * @param {any} chat
 * @param {{ groupPromptInstalled?: boolean }} state
 * @param {(level: string, message: string) => void} log
 */
export function installGroupPrompt(agent, chat, state, log) {
  if (chat?.type !== 'group' || state.groupPromptInstalled) return
  try {
    agent.ctx.systemPrompt.section({
      name: 'qq-bridge:group',
      order: 145,
      text: [
        '本会话是 QQ 群聊，不是私聊。一个群共用一个工作区和会话。',
        '群聊不需要 /bind；不要要求群成员绑定账号。',
        '本群共用一个权限和一个生图额度池；群成员共享这份权限和额度，不要按成员个人额度理解。',
        '每条用户消息会以 [QQ:<QQ号>] 开头，表示该条消息的发送者 QQ 号。用它区分群成员，不要把不同成员当成同一个人。',
        '回答时针对当前发送者；不要把这个群会话当成某个人的私聊，也不要泄露内部地址或其他成员的私密信息。',
      ].join(''),
    })
    state.groupPromptInstalled = true
  } catch (error) {
    log?.('warn', `could not add group prompt: ${error?.message ?? error}`)
  }
}
