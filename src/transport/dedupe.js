/**
 * Remember recently handled message ids so a redelivered event runs once.
 * Insertion-ordered Map + TTL: no timers, pruning happens on write.
 */
export class DedupeStore {
  /**
   * @param {{ ttlMs?: number, max?: number, now?: () => number }} [options]
   */
  constructor({ ttlMs = 7 * 24 * 60 * 60 * 1000, max = 20000, now = Date.now } = {}) {
    this.ttlMs = ttlMs
    this.max = max
    this.now = now
    this.seenAt = new Map()
  }

  /**
   * Record `key` and report whether it was already seen inside the TTL.
   * @param {string} key
   * @returns {boolean} true when this is a duplicate
   */
  seen(key) {
    const at = this.now()
    const previous = this.seenAt.get(key)
    if (previous !== undefined && at - previous < this.ttlMs) return true
    this.seenAt.set(key, at)
    if (this.seenAt.size > this.max) this.prune(at)
    return false
  }

  /** Drop expired entries, then the oldest ones if still over capacity. */
  prune(at = this.now()) {
    for (const [key, seen] of this.seenAt) {
      if (at - seen >= this.ttlMs) this.seenAt.delete(key)
    }
    for (const key of this.seenAt.keys()) {
      if (this.seenAt.size <= this.max) break
      this.seenAt.delete(key)
    }
  }

  get size() {
    return this.seenAt.size
  }
}
