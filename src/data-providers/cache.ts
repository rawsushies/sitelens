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
   * Recursively normalizes an arbitrary value for stable, deterministic cache serialization
   */
  private static canonicalize(val: any): any {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') {
      // Float precision: round to 5 decimal places (~1.1m precision) for geographic coordinates
      return Number(val.toFixed(5));
    }
    if (typeof val === 'boolean' || typeof val === 'string') {
      return val;
    }
    if (Array.isArray(val)) {
      return val.map(item => BoundedLRUCache.canonicalize(item));
    }
    if (typeof val === 'object') {
      const sortedKeys = Object.keys(val).sort();
      const result: Record<string, any> = {};
      for (const k of sortedKeys) {
        // Exclude transient execution parameters
        if (k === 'signal' || k === 'bypassCache' || k === 'timeoutMs') continue;
        result[k] = BoundedLRUCache.canonicalize(val[k]);
      }
      return result;
    }
    return String(val);
  }

  /**
   * Generates a collision-resistant, deterministic key for a provider, query parameters, and result-affecting options
   */
  public static generateKey(
    providerId: string, 
    params: Record<string, any>, 
    options?: Record<string, any>
  ): string {
    const combined: Record<string, any> = {
      query: BoundedLRUCache.canonicalize(params)
    };

    if (options) {
      const normalizedOpts: Record<string, any> = {};
      if (options.siteBoundary && Array.isArray(options.siteBoundary)) {
        normalizedOpts.siteBoundary = BoundedLRUCache.canonicalize(options.siteBoundary);
      }
      if (options.bbox && Array.isArray(options.bbox)) {
        normalizedOpts.bbox = BoundedLRUCache.canonicalize(options.bbox);
      }
      if (typeof options.radiusMeters === 'number') {
        normalizedOpts.radiusMeters = Number(options.radiusMeters.toFixed(1));
      }
      if (Object.keys(normalizedOpts).length > 0) {
        combined.options = normalizedOpts;
      }
    }

    return `${providerId}:${JSON.stringify(combined)}`;
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
