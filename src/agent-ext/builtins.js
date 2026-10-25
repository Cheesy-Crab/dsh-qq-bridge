import { applyAgentPolicy } from './policy.js'
import { forwardPresentedImages } from './present.js'
import { installQqPrompt } from './prompt.js'

/**
 * QQ's built-in behavior extensions. They are registered into the shared
 * registry just like third-party extensions, so the manager stays channel-neutral.
 * @param {{ approval: any, log: (level: string, message: string) => void }} options
 * @returns {{ name: string, onSession?: Function, onTurnEnd?: Function }[]}
 */
export function qqBuiltinExtensions({ approval, log }) {
  return [
    {
      name: 'qq:prompt',
      onSession: ({ agent, state }) => installQqPrompt(agent, state, log),
    },
    {
      name: 'qq:policy',
      onSession: ({ agent, level, state }) => applyAgentPolicy({ approval, agent, level, state, log }),
    },
    {
      name: 'qq:present',
      onTurnEnd: ({ sendImage, chat, session, fromSeq }) => forwardPresentedImages({
        sendImage,
        chat,
        session,
        fromSeq,
        log,
      }),
    },
  ]
}
