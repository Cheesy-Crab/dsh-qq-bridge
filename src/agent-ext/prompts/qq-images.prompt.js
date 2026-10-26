/**
 * QQ-specific system prompt: images only reach the chat through `present`.
 * @param {{ ctx: { systemPrompt?: { section: Function } } }} agent
 * @param {{ promptInstalled?: boolean }} state
 * @param {(level: string, message: string) => void} log
 */
export function installQqPrompt(agent, state, log) {
  if (state.promptInstalled) return
  try {
    agent.ctx.systemPrompt.section({
      name: 'qq-bridge:images',
      order: 150,
      text: [
        '本会话通过 QQ 桥接与用户交流。',
        '当用户要求“截图 / 发图 / 给我看效果 / 发到 QQ”时，先实际生成图片文件，然后调用 present 展示该图片。',
        '桥接器会在本轮结束时自动把 present 中的 png/jpg/jpeg/gif/webp 发到当前 QQ；只在文字里写文件路径不会发图。',
        '生图必须在本会话内直接调用 generate_image / edit_image 完成：subagent 的图片留在子会话里，回不到 QQ，用户会看不到。',
        '这条高于 image-gen 手册：手册里“主对话里派 subagent 生图”的做法在 QQ 会话一律作废，不要照做。',
        '非图片文件不会自动发送。用户也可以直接发 /screenshot 抓整屏。',
      ].join(''),
    })
    state.promptInstalled = true
  } catch (error) {
    log?.('warn', `could not add QQ prompt section: ${error?.message ?? error}`)
  }
}
