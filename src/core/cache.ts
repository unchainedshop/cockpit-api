/**
 * Cache management with LRU cache and tenant isolation
 */

import { LRUCache } from "lru-cache";

export interface CacheOptions {
  /** Maximum number of entries (default: 100) */
  max?: number;
  /** Time-to-live in milliseconds (default: 100000) */
  ttl?: number;
}

export interface CacheManager {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  clear(pattern?: string): void;
}

/**
 * Creates a cache manager with prefixed keys
 * Each call creates a new LRU cache instance - no shared state
 */
export function createCacheManager(
  cachePrefix: string,
  options: CacheOptions = {}
): CacheManager {
  const cache = new LRUCache<string, unknown>({
    max: options.max ?? 100,
    ttl: options.ttl ?? 100000,
    allowStale: false,
  });

  const prefixedKey = (key: string) => `${cachePrefix}${key}`;

  return {
    get<T>(key: string): T | undefined {
      return cache.get(prefixedKey(key)) as T | undefined;
    },

    set<T>(key: string, value: T): void {
      cache.set(prefixedKey(key), value);
    },

    clear(pattern?: string): void {
      if (pattern) {
        const prefix = `${cachePrefix}${pattern}`;
        for (const key of cache.keys()) {
          if (key.startsWith(prefix)) {
            cache.delete(key);
          }
        }
      } else {
        // Clear all entries for this prefix
        for (const key of cache.keys()) {
          if (key.startsWith(cachePrefix)) {
            cache.delete(key);
          }
        }
      }
    },
  };
}
