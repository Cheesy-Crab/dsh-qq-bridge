import { applyAgentPolicy } from './policy.js'
import { forwardPresentedImages, presentedImages } from './present.js'
import { archiveSessionImage } from './session-images.js'
import { installGroupPrompt, installQqPrompt } from './prompts/index.js'

/**
 * QQ's built-in behavior extensions. They are registered into the shared
 * registry just like third-party extensions, so the manager stays channel-neutral.
 * @param {{ approval: any, log: (level: string, message: string) => void }} options
 * @returns {{ name: string, onSession?: Function, onTurnEnd?: Function }[]}
 */
export function qqBuiltinExtensions({ approval, forwardMedia, log, toolAllowed }) {
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
      name: 'qq:policy',
      onSession: ({ agent, level, state, profile }) => applyAgentPolicy({ approval, agent, level, state, profile, log, toolAllowed }),
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
      onTurnEnd: ({ sendImage, sendText, chat, session, state, fromSeq }) => forwardMedia({
        sendImage,
        sendText,
        chat,
        session,
        state,
        fromSeq,
        log,
        optionsForChat: (target) => target?.mention ? { mention: target.mention } : {},
        presentedFor: presentedImages,
        archive: archiveSessionImage,
      }),
    },
  ]
}
