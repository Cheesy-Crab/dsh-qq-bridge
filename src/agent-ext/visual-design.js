/**
 * Prompt for visual design collaboration: discuss first, generate at natural
 * checkpoints, label drafts, and iterate with edit_image instead of re-rolling.
 * @param {any} agent
 * @param {{ visualPromptInstalled?: boolean }} state
 * @param {(level: string, message: string) => void} log
 */
export function installVisualDesignPrompt(agent, state, log) {
  if (state.visualPromptInstalled) return
  try {
    agent.ctx.systemPrompt.section({
      name: 'qq-bridge:visual-design',
      order: 160,
      text: [
        '当用户和你讨论角色、精灵、场景、产品或其他视觉设计时：',
        '1. 先用文字确认视觉锚点：主体、用途、风格、轮廓、配色、服装或道具、必须保留的特征、避免的方向。',
        '2. 不要每轮都画。用户明确要求出图，或已经确认至少三个视觉锚点并进入自然节点时，再调用 generate_image；仍在探索、比较方向或澄清需求时只讨论。',
        '3. generate_image 成功后，必须在同一轮调用 present 展示返回的 savedTo 路径，让图片发到当前 QQ；配一句“概念示意图，非最终定稿”，不要贴大段 prompt。',
        '4. 用户提出修改时，用 edit_image 并引用上一版 savedTo，明确保留哪些特征、只改哪些部分；不要重新随机生成一个相似角色。',
        '5. 用户说先文字讨论、不要图，或已经明确拒绝某个方向时，停止主动生成。',
      ].join(''),
    })
    state.visualPromptInstalled = true
  } catch (error) {
    log?.('warn', `could not add visual design prompt: ${error?.message ?? error}`)
  }
}
