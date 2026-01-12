/**
 * Cache management with pluggable async stores and tenant isolation
 *
 * v3.0.0 Breaking Change: All cache operations are now async
 */

import { LRUCache } from "lru-cache";

/**
 * Async cache store interface that custom cache implementations must implement
 *
 * @example Redis implementation
 * ```typescript
 * import { createClient } from 'redis';
 * import type { AsyncCacheStore } from '@unchainedshop/cockpit-api';
 *
 * const redisClient = createClient({ url: 'redis://localhost:6379' });
 * await redisClient.connect();
 *
 * const redisStore: AsyncCacheStore = {
 *   async get(key: string) {
 *     const value = await redisClient.get(key);
 *     return value ? JSON.parse(value) : undefined;
 *   },
 *   async set(key: string, value: unknown) {
 *     await redisClient.set(key, JSON.stringify(value), { EX: 100 });
 *   },
 *   async clear(pattern?: string) {
 *     if (pattern) {
 *       const keys = await redisClient.keys(`${pattern}*`);
 *       if (keys.length > 0) await redisClient.del(keys);
 *     } else {
 *       await redisClient.flushDb();
 *     }
 *   }
 * };
 * ```
 *
 * @example Keyv implementation
 * ```typescript
 * import Keyv from 'keyv';
 * import type { AsyncCacheStore } from '@unchainedshop/cockpit-api';
 *
 * const keyv = new Keyv('redis://localhost:6379');
 *
 * const keyvStore: AsyncCacheStore = {
 *   async get(key: string) {
 *     return await keyv.get(key);
 *   },
 *   async set(key: string, value: unknown) {
 *     await keyv.set(key, value, 100000); // 100000ms TTL
 *   },
 *   async clear(pattern?: string) {
 *     if (!pattern) {
 *       await keyv.clear();
 *     }
 *     // Note: Keyv doesn't have native pattern matching
 *     // Pattern matching requires custom implementation
 *   }
 * };
 * ```
 */
export interface AsyncCacheStore {
  /**
   * Retrieve a value from cache
   * @param key - Cache key
   * @returns Promise resolving to the cached value, or undefined if not found
   */
  get(key: string): Promise<unknown>;

  /**
   * Store a value in cache
   * @param key - Cache key
   * @param value - Value to store (must be serializable for external stores)
   * @returns Promise that resolves when storage is complete
   */
  set(key: string, value: NonNullable<unknown>): Promise<void>;

  /**
   * Clear cache entries
   * @param pattern - Optional pattern to match keys (implementation-specific)
   *                  If not provided, clears all entries
   * @returns Promise that resolves when clearing is complete
   */
  clear(pattern?: string): Promise<void>;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /**
   * Maximum number of entries (default: 100)
   * Only used with default LRU store. Ignored when custom store is provided.
   */
  max?: number;

  /**
   * Time-to-live in milliseconds (default: 100000)
   * Only used with default LRU store. Ignored when custom store is provided.
   */
  ttl?: number;

  /**
   * Custom async cache store implementation
   * If provided, max and ttl options are ignored
   *
   * @example Redis store
   * ```typescript
   * import { createClient } from 'redis';
   *
   * const redisClient = createClient();
   * await redisClient.connect();
   *
   * const client = await CockpitAPI({
   *   endpoint: 'https://cms.example.com/api/graphql',
   *   cache: {
   *     store: {
   *       async get(key) {
   *         const val = await redisClient.get(key);
   *         return val ? JSON.parse(val) : undefined;
   *       },
   *       async set(key, value) {
   *         await redisClient.set(key, JSON.stringify(value), { EX: 100 });
   *       },
   *       async clear(pattern) {
   *         if (pattern) {
   *           const keys = await redisClient.keys(`${pattern}*`);
   *           if (keys.length > 0) await redisClient.del(keys);
   *         } else {
   *           await redisClient.flushDb();
   *         }
   *       }
   *     }
   *   }
   * });
   * ```
   */
  store?: AsyncCacheStore;
}

/**
 * Async cache manager interface
 * All cache operations return promises in v3.0.0+
 */
export interface CacheManager {
  /**
   * Get a value from cache
   * @param key - Cache key (will be prefixed internally)
   * @returns Promise resolving to cached value or undefined if not found
   */
  get(key: string): Promise<unknown>;

  /**
   * Set a value in cache
   * @param key - Cache key (will be prefixed internally)
   * @param value - Value to cache
   * @returns Promise that resolves when caching is complete
   */
  set(key: string, value: NonNullable<unknown>): Promise<void>;

  /**
   * Clear cache entries matching pattern
   * @param pattern - Optional pattern to match (relative to cache prefix)
   * @returns Promise that resolves when clearing is complete
   */
  clear(pattern?: string): Promise<void>;
}

/**
 * Creates a default LRU-based async cache store
 * Wraps lru-cache in async interface for consistency
 */
function createDefaultLRUStore(options: CacheOptions): AsyncCacheStore {
  const cache = new LRUCache<string, NonNullable<unknown>>({
    max: options.max ?? 100,
    ttl: options.ttl ?? 100000,
    allowStale: false,
  });

  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async get(key: string): Promise<unknown> {
      return cache.get(key);
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async set(key: string, value: NonNullable<unknown>): Promise<void> {
      cache.set(key, value);
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async clear(pattern?: string): Promise<void> {
      if (pattern === undefined) {
        cache.clear();
      } else {
        for (const key of cache.keys()) {
          if (key.startsWith(pattern)) {
            cache.delete(key);
          }
        }
      }
    },
  };
}

/**
 * Creates a cache manager with prefixed keys and async operations
 * Each call creates a new cache instance - no shared state
 *
 * @param cachePrefix - Prefix for all cache keys (includes endpoint and tenant)
 * @param options - Cache configuration options
 * @returns Async cache manager
 *
 * @example Using default LRU cache
 * ```typescript
 * const cache = createCacheManager('https://cms.example.com:default:', {
 *   max: 100,
 *   ttl: 100000
 * });
 *
 * await cache.set('key1', { data: 'value' });
 * const value = await cache.get('key1');
 * await cache.clear('ROUTE');
 * ```
 *
 * @example Using custom Redis store
 * ```typescript
 * const redisClient = createClient();
 * await redisClient.connect();
 *
 * const cache = createCacheManager('https://cms.example.com:default:', {
 *   store: {
 *     async get(key) { ... },
 *     async set(key, value) { ... },
 *     async clear(pattern) { ... }
 *   }
 * });
 * ```
 */
export function createCacheManager(
  cachePrefix: string,
  options: CacheOptions = {},
): CacheManager {
  // Use custom store if provided, otherwise create default LRU store
  const store = options.store ?? createDefaultLRUStore(options);

  const prefixedKey = (key: string): string => `${cachePrefix}${key}`;

  return {
    async get(key: string): Promise<unknown> {
      return await store.get(prefixedKey(key));
    },

    async set(key: string, value: NonNullable<unknown>): Promise<void> {
      await store.set(prefixedKey(key), value);
    },

    async clear(pattern?: string): Promise<void> {
      const prefix =
        pattern !== undefined ? `${cachePrefix}${pattern}` : cachePrefix;
      await store.clear(prefix);
    },
  };
}

/**
 * Creates a no-op cache manager that doesn't cache anything
 * Used when caching is explicitly disabled
 *
 * @returns No-op cache manager
 *
 * @example
 * ```typescript
 * const cache = createNoOpCacheManager();
 * await cache.set('key', 'value'); // Does nothing
 * const result = await cache.get('key'); // Always returns undefined
 * await cache.clear(); // Does nothing
 * ```
 */
export function createNoOpCacheManager(): CacheManager {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async get(): Promise<undefined> {
      return undefined;
    },

    async set(): Promise<void> {
      // No-op
    },

    async clear(): Promise<void> {
      // No-op
    },
  };
}
