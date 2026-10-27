export class CommandRegistry {
  constructor() {
    this.entries = new Map()
  }

  register(spec) {
    if (!spec || typeof spec.name !== 'string' || spec.name.length === 0) {
      throw new Error('command name is required')
    }
    if (typeof spec.handler !== 'function') {
      throw new Error(`command ${spec.name} needs a handler`)
    }
    this.entries.set(spec.name, { ...spec })
    return () => {
      if (this.entries.get(spec.name) === spec) this.entries.delete(spec.name)
      else if (this.entries.get(spec.name)?.handler === spec.handler) this.entries.delete(spec.name)
    }
  }

  get(name) {
    return this.entries.get(name)
  }

  list() {
    return [...this.entries.values()]
  }
}
