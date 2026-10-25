/**
 * Registry for agent behavior extensions.
 *
 * A plugin registers an object with an optional `onSession` and/or `onTurnEnd`
 * hook. QQ's prompt/policy/present behavior are just the built-in extensions;
 * other plugins (Telegram, audit, metrics, extra prompts) can register on the
 * same registry through `ctx.get('agentExtensions')`.
 */
export class AgentExtensionRegistry {
  /**
   * @param {{ log?: (level: string, message: string) => void }} [options]
   */
  constructor({ log } = {}) {
    this.log = log
    this.extensions = []
  }

  /**
   * @param {{ name: string, onSession?: Function, onTurnEnd?: Function }} extension
   * @returns {() => void} disposer
   */
  register(extension) {
    if (!extension || typeof extension.name !== 'string' || extension.name === '') {
      throw new Error('agent extension requires a non-empty name')
    }
    if (this.extensions.some((item) => item.name === extension.name)) {
      throw new Error(`agent extension already registered: ${extension.name}`)
    }
    this.extensions.push(extension)
    return () => {
      this.extensions = this.extensions.filter((item) => item !== extension)
    }
  }

  list() {
    return [...this.extensions]
  }

  async sessionReady(context) {
    for (const extension of this.list()) {
      try {
        await extension.onSession?.(context)
      } catch (error) {
        this.log?.('warn', `agent extension ${extension.name} onSession failed: ${error?.message ?? error}`)
      }
    }
  }

  async turnEnd(context) {
    for (const extension of this.list()) {
      try {
        await extension.onTurnEnd?.(context)
      } catch (error) {
        this.log?.('warn', `agent extension ${extension.name} onTurnEnd failed: ${error?.message ?? error}`)
      }
    }
  }
}
