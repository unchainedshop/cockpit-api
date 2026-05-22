/**
 * Cache management with pluggable async stores and tenant isolation
 *
 * v3.0.0 Breaking Change: All cache operations are now async
 */

import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import { logger } from "../cockpit-logger.ts";

export const DEFAULT_SWR_FRESH_MS: number = 60 * 60 * 1000;
export const DEFAULT_SWR_STALE_MS: number = 30 * 24 * 60 * 60 * 1000;

export const hashOpts = (opts: unknown): string =>
  createHash("sha1").update(JSON.stringify(opts)).digest("hex");

interface SwrEnvelope<T> {
  data: T;
  freshUntil: number;
  staleUntil: number;
}

export interface SwrOptions {
  freshMs?: number;
  staleMs?: number;
}

/**
 * Manager-level SWR defaults. Applied when a `swr()` call omits per-call options.
 * Falls back to {@link DEFAULT_SWR_FRESH_MS} / {@link DEFAULT_SWR_STALE_MS} if unset.
 */
export type SwrDefaults = SwrOptions;

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

  /**
   * Default SWR windows applied to every {@link CacheManager.swr} call that
   * doesn't supply per-call `freshMs` / `staleMs`. Useful for configuring
   * stale-while-revalidate behaviour centrally without touching every method.
   *
   * Per-call options on `swr()` still win. Unset fields fall back to
   * {@link DEFAULT_SWR_FRESH_MS} and {@link DEFAULT_SWR_STALE_MS}.
   *
   * @example 5-minute fresh window, 24-hour stale fallback (survives upstream outages)
   * ```typescript
   * const client = await CockpitAPI({
   *   cache: {
   *     store: redisStore,
   *     swr: { freshMs: 5 * 60_000, staleMs: 24 * 60 * 60_000 },
   *   }
   * });
   * ```
   */
  swr?: SwrDefaults;
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

  /**
   * Stale-while-revalidate fetch wrapper.
   *
   * - Fresh hit (now < freshUntil): returns cached data immediately.
   * - Stale hit (freshUntil <= now < staleUntil): returns cached data and
   *   triggers a single background revalidation (deduped per-instance).
   * - Cold or expired: fetches synchronously, deduping concurrent callers
   *   for the same key. On upstream error, falls back to stale data if
   *   present; otherwise rethrows.
   */
  swr<T>(
    key: string,
    fetcher: () => Promise<T | null>,
    options?: SwrOptions,
  ): Promise<T | null>;
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

  const managerSwrDefaults: SwrDefaults = options.swr ?? {};
  const prefixedKey = (key: string): string => `${cachePrefix}${key}`;
  const inflight = new Map<string, Promise<unknown>>();

  const manager: CacheManager = {
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

    async swr<T>(
      key: string,
      fetcher: () => Promise<T | null>,
      swrOptions: SwrOptions = {},
    ): Promise<T | null> {
      const freshMs =
        swrOptions.freshMs ??
        managerSwrDefaults.freshMs ??
        DEFAULT_SWR_FRESH_MS;
      const staleMs =
        swrOptions.staleMs ??
        managerSwrDefaults.staleMs ??
        DEFAULT_SWR_STALE_MS;
      const now = Date.now();
      const entry = (await manager.get(key)) as SwrEnvelope<T> | undefined;
      const isEnvelope =
        entry !== undefined &&
        typeof entry === "object" &&
        "freshUntil" in entry;

      if (isEnvelope && now < entry.freshUntil) {
        return entry.data;
      }

      const runFetch = async (): Promise<T | null> => {
        const fresh = await fetcher();
        if (fresh !== null && fresh !== undefined) {
          const t = Date.now();
          await manager.set(key, {
            data: fresh,
            freshUntil: t + freshMs,
            staleUntil: t + staleMs,
          });
        }
        return fresh;
      };

      if (isEnvelope && now < entry.staleUntil) {
        if (!inflight.has(key)) {
          const revalidate = runFetch()
            .catch((err: unknown) => {
              logger.warn(`SWR background revalidate failed for ${key}`, err);
              return null;
            })
            .finally(() => {
              inflight.delete(key);
            });
          inflight.set(key, revalidate);
        }
        return entry.data;
      }

      let promise = inflight.get(key) as Promise<T | null> | undefined;
      if (!promise) {
        promise = runFetch().finally(() => {
          inflight.delete(key);
        });
        inflight.set(key, promise);
      }
      try {
        return await promise;
      } catch (err) {
        if (isEnvelope) {
          logger.warn(`Cockpit unreachable, serving stale for ${key}`, err);
          return entry.data;
        }
        throw err;
      }
    },
  };

  return manager;
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

    async swr<T>(
      _key: string,
      fetcher: () => Promise<T | null>,
    ): Promise<T | null> {
      return fetcher();
    },
  };
}
