/**
 * Generic QQ delivery rules. This section knows only the QQ surface; media
 * generation and provider behavior belong to capabilities, not this module.
 */
export function installQqPrompt(agent, state, log) {
  if (state.promptInstalled) return
  try {
    agent.ctx.systemPrompt.section({
      name: 'qq-bridge:images',
      order: 150,
      text: [
        '本会话通过 QQ 桥接与用户交流。',
        '平台会把能力产生的图片输出发回当前 QQ；如果平台用 present 标记了同一图片，不要重复发送。',
        '不要直接调用 QQ、NapCat 或 OneBot；只通过平台交付结果。',
        '非图片文件不会自动发送；只在文字里写文件路径不等于已经发送给用户。',
        '图片生成、编辑、重试和恢复由对应能力负责，QQ 层不要猜测 provider 或私有字段。',
      ].join(''),
    })
    state.promptInstalled = true
  } catch (error) {
    log?.('warn', `could not add QQ prompt section: ${error?.message ?? error}`)
  }
}
