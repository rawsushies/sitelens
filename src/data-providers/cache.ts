/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Bounded LRU Cache (M2.0)
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  lastAccessed: number;
}

export class BoundedLRUCache<V = any> {
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private readonly map: Map<string, CacheEntry<V>>;

  constructor(maxSize: number = 60, defaultTtlMs: number = 10 * 60 * 1000) {
    this.maxSize = Math.max(1, maxSize);
    this.defaultTtlMs = defaultTtlMs;
    this.map = new Map();
  }

  /**
   * Generates a stable key for a provider and its query parameters
   */
  public static generateKey(providerId: string, params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort();
    const normalized: Record<string, any> = {};
    for (const k of sortedKeys) {
      const val = params[k];
      if (typeof val === 'number') {
        // Round floats to 4 decimal places (~11m precision) to optimize cache hits for nearby queries
        normalized[k] = Number(val.toFixed(4));
      } else {
        normalized[k] = val;
      }
    }
    return `${providerId}:${JSON.stringify(normalized)}`;
  }

  /**
   * Retrieves an item from cache if present and not expired
   */
  public get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Refresh LRU order (delete & re-insert)
    entry.lastAccessed = now;
    this.map.delete(key);
    this.map.set(key, entry);

    return entry.value;
  }

  /**
   * Stores an item with optional TTL override, evicting LRU items if at capacity
   */
  public set(key: string, value: V, ttlMs?: number): void {
    const now = Date.now();
    const effectiveTtl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;

    // If key exists, delete first to update position
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first key in Map iterator)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, {
      value,
      expiresAt: now + effectiveTtl,
      lastAccessed: now,
    });
  }

  /**
   * Checks if an unexpired key exists
   */
  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Explicitly invalidates a key
   */
  public invalidate(key: string): boolean {
    return this.map.delete(key);
  }

  /**
   * Invalidates all keys matching a prefix (e.g. "osm:" or "open-meteo:")
   */
  public invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of Array.from(this.map.keys())) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clears the entire cache
   */
  public clear(): void {
    this.map.clear();
  }

  /**
   * Returns current active item count (excluding expired ones)
   */
  public size(): number {
    const now = Date.now();
    let validCount = 0;
    for (const [key, entry] of Array.from(this.map.entries())) {
      if (now > entry.expiresAt) {
        this.map.delete(key);
      } else {
        validCount++;
      }
    }
    return validCount;
  }
}
