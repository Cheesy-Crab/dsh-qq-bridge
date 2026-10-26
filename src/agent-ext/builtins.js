import { applyAgentPolicy } from './policy.js'
import { forwardGeneratedImages } from './generated-images.js'
import { forwardPresentedImages } from './present.js'
import { installGroupPrompt, installQqPrompt, installVisualDesignPrompt } from './prompts/index.js'

/**
 * QQ's built-in behavior extensions. They are registered into the shared
 * registry just like third-party extensions, so the manager stays channel-neutral.
 * @param {{ approval: any, chargeImage?: Function, log: (level: string, message: string) => void }} options
 * @returns {{ name: string, onSession?: Function, onTurnEnd?: Function }[]}
 */
export function qqBuiltinExtensions({ approval, chargeImage, log }) {
  return [
    {
      name: 'qq:group',
      onSession: ({ agent, chat, state }) => installGroupPrompt(agent, chat, state, log),
    },
    {
      name: 'qq:prompt',
      onSession: ({ agent, state }) => installQqPrompt(agent, state, log),
    },
    {
      name: 'qq:visual-design',
      onSession: ({ agent, state }) => installVisualDesignPrompt(agent, state, log),
    },
    {
      name: 'qq:policy',
      onSession: ({ agent, level, state }) => applyAgentPolicy({ approval, agent, level, state, log }),
    },
    {
      name: 'qq:present',
      onTurnEnd: ({ sendImage, chat, session, state, fromSeq }) => forwardPresentedImages({
        sendImage,
        chat,
        session,
        state,
        fromSeq,
        log,
      }),
    },
    {
      name: 'qq:generated-images',
      onTurnEnd: ({ sendImage, sendText, chat, session, state, fromSeq }) => forwardGeneratedImages({
        sendImage,
        sendText,
        charge: chargeImage,
        chat,
        session,
        state,
        fromSeq,
        log,
      }),
    },
  ]
}
