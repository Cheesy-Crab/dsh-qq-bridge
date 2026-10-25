/**
 * QQ-side index from a live session id back to the chat that owns it.
 * Approval, user-question and media forwarding all need this mapping, but the
 * workspace manager should not depend on QQ chat identity.
 */
export class ConversationRouter {
  constructor() {
    this.sessions = new Map()
  }

  bind(sessionId, chat) {
    if (sessionId && chat) this.sessions.set(String(sessionId), chat)
  }

  unbind(sessionId) {
    this.sessions.delete(String(sessionId))
  }

  chatForSession(sessionId) {
    return this.sessions.get(String(sessionId))
  }
}
