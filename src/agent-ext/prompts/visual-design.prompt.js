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
        '0. 只有当前账号是 L3，或管理员已授予 image 能力时，才可以调用 generate_image / edit_image；没有权限时继续文字讨论，并说明需要管理员用 /admin allow <QQ号> image 开通，不要尝试调用生图工具。',
        '1. 有权限时，出图前先调用 skill("image-gen") 加载生图手册，按目标 provider/model 的方言编译 prompt，不要凭感觉堆词。',
        '2. 先用文字确认视觉锚点：主体、用途、风格、轮廓、配色、服装或道具、必须保留的特征、避免的方向。',
        '3. 不要每轮都画。用户明确要求出图，或已经确认至少三个视觉锚点并进入自然节点时，再调用 generate_image；仍在探索、比较方向或澄清需求时只讨论。',
        '4. generate_image 成功后，必须在同一轮调用 present 展示返回的 savedTo 路径，让图片发到当前 QQ；配一句“概念示意图，非最终定稿”，不要贴大段 prompt。',
        '5. 用户提出修改时，用 edit_image 并引用上一版 savedTo，明确保留哪些特征、只改哪些部分；不要重新随机生成一个相似角色。',
        '6. 在 QQ 会话中直接调用 generate_image，不要派 subagent 生图；子会话的图不会回到当前 QQ。需要复现时传 seed；provider 支持时用 negative_prompt 表达禁区，风格/角色 LoRA 用 loras；改图优先 source_path / source_paths。',
        '7. 用户说先文字讨论、不要图，或已经明确拒绝某个方向时，停止主动生成。',
      ].join(''),
    })
    state.visualPromptInstalled = true
  } catch (error) {
    log?.('warn', `could not add visual design prompt: ${error?.message ?? error}`)
  }
}
