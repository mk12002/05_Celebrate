/**
 * Minimal in-memory LRU cache with TTL. Identical plan requests (common while
 * demoing or when a user double-submits) are served without another LLM call.
 */
export class TtlCache {
  /** @param {{maxEntries?: number, ttlMs?: number, now?: () => number}} [options] */
  constructor({ maxEntries = 100, ttlMs = 600_000, now = Date.now } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Re-insert to mark as most recently used.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      this.store.delete(this.store.keys().next().value);
    }
  }

  get size() {
    return this.store.size;
  }
}
