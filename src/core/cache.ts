/**
 * Async cache with pluggable stores and stale-while-revalidate reads
 */

import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import { logger } from "../cockpit-logger.ts";
import { CockpitHttpError } from "./errors.ts";

// Any non-nullish value (equivalent to `{}`, spelled out for lint)
type CacheValue = object | string | number | boolean | bigint | symbol;

export const DEFAULT_CACHE_MAX = 100;
export const DEFAULT_SWR_FRESH_MS: number = 60 * 60 * 1000; // 1 hour
export const DEFAULT_SWR_STALE_MS: number = 30 * 24 * 60 * 60 * 1000; // 30 days

/** JSON replacer emitting plain objects with sorted keys (arrays keep order) */
const sortKeys = (_key: string, value: unknown): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) sorted[key] = source[key];
  return sorted;
};

/** Stable hash of an options object for cache keys (key order irrelevant) */
export const hashOpts = (opts: object): string =>
  createHash("sha1").update(JSON.stringify(opts, sortKeys)).digest("hex");

/**
 * Store behind the cache manager (Redis, Keyv, ...; examples in the README).
 * May hand out shared references: the manager copies on write and read.
 */
export interface AsyncCacheStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: CacheValue): Promise<void>;
  /** Clears every entry, or those whose key starts with `pattern` */
  clear(pattern?: string): Promise<void>;
}

export interface CacheOptions {
  /** Entries of the built-in LRU store (env: COCKPIT_CACHE_MAX, default: 100) */
  max?: number;
  /** Stale-while-revalidate windows in ms (defaults: fresh 1 h, stale 30 days) */
  swr?: { freshMs?: number; staleMs?: number };
  /** Custom store; `max` is then ignored */
  store?: AsyncCacheStore;
}

/** Every value it returns is a private copy, safe to mutate */
export interface CacheManager {
  get(key: string): Promise<unknown>;
  set(key: string, value: CacheValue): Promise<void>;
  /** Clears entries whose key starts with `pattern` (relative to the prefix) */
  clear(pattern?: string): Promise<void>;
  /**
   * Fresh hit: cached data. Stale hit: cached data, plus one deduped
   * background refresh. Cold or past the stale window: waits for the fetcher
   * (concurrent callers share it); its errors propagate. A failed background
   * refresh keeps the stale entry, except on 401/403 (revoked credentials),
   * which expire it. `null` (404) is not cached and expires existing data.
   */
  swr<T>(key: string, fetcher: () => Promise<T | null>): Promise<T | null>;
}

interface SwrEnvelope<T> {
  /** `null` marks an expired tombstone */
  data: T | null;
  freshUntil: number;
  staleUntil: number;
}

const isEnvelope = <T>(value: unknown): value is SwrEnvelope<T> =>
  typeof value === "object" && value !== null && "staleUntil" in value;

const copy = <T>(value: T): T => structuredClone(value);

/** In-memory LRU store; the manager copies, so it stores references as-is */
export function createLRUCacheStore({
  max = DEFAULT_CACHE_MAX,
}: { max?: number } = {}): AsyncCacheStore {
  const lru = new LRUCache<string, CacheValue>({ max });
  return {
    get: (key): Promise<unknown> => Promise.resolve(lru.get(key)),
    set: (key, value): Promise<void> => {
      lru.set(key, value);
      return Promise.resolve();
    },
    clear: (pattern): Promise<void> => {
      for (const key of lru.keys()) {
        if (pattern === undefined || key.startsWith(pattern)) lru.delete(key);
      }
      return Promise.resolve();
    },
  };
}

/** Cache manager with its own key prefix and in-flight map (no shared state) */
export function createCacheManager(
  cachePrefix: string,
  options: CacheOptions = {},
): CacheManager {
  const store = options.store ?? createLRUCacheStore(options);
  const freshMs = options.swr?.freshMs ?? DEFAULT_SWR_FRESH_MS;
  const staleMs = options.swr?.staleMs ?? DEFAULT_SWR_STALE_MS;
  const inflight = new Map<string, Promise<unknown>>();

  const read = (key: string): Promise<unknown> =>
    store.get(`${cachePrefix}${key}`);
  const write = (key: string, value: CacheValue): Promise<void> =>
    store.set(`${cachePrefix}${key}`, copy(value));
  // The store has no delete: an expired tombstone is never served
  const expire = (key: string): Promise<void> =>
    write(key, { data: null, freshUntil: 0, staleUntil: 0 });

  return {
    get: async (key): Promise<unknown> => copy(await read(key)),
    set: write,

    async clear(pattern = ""): Promise<void> {
      // Pending fetches must neither write back nor be joined
      for (const key of inflight.keys()) {
        if (key.startsWith(pattern)) inflight.delete(key);
      }
      await store.clear(`${cachePrefix}${pattern}`);
    },

    async swr<T>(
      key: string,
      fetcher: () => Promise<T | null>,
    ): Promise<T | null> {
      const now = Date.now();
      const stored = await read(key);
      const entry = isEnvelope<T>(stored) ? stored : undefined;
      if (entry && now < entry.freshUntil) return copy(entry.data);
      const hadData = entry !== undefined && entry.data !== null;

      // Only the fetch registered in `inflight` may write back (clear() drops it)
      const refresh = (): Promise<T | null> => {
        const promise: Promise<T | null> = (async (): Promise<T | null> => {
          const current = (): boolean => inflight.get(key) === promise;
          try {
            const fresh = await fetcher();
            if (!current()) return fresh;
            if (fresh !== null && fresh !== undefined) {
              const t = Date.now();
              await write(key, {
                data: fresh,
                freshUntil: t + freshMs,
                staleUntil: t + staleMs,
              });
            } else if (hadData) {
              await expire(key); // 404: never serve the deleted data again
            }
            return fresh;
          } catch (err) {
            const revoked =
              err instanceof CockpitHttpError &&
              (err.status === 401 || err.status === 403);
            // Data fetched with revoked credentials must not be served
            if (revoked && hadData && current()) {
              await expire(key).catch((e: unknown) => {
                logger.warn(`Cockpit: Failed to expire ${key}`, e);
              });
            }
            throw err;
          }
        })().finally(() => {
          if (inflight.get(key) === promise) inflight.delete(key);
        });
        inflight.set(key, promise);
        return promise;
      };

      // Stale window: serve stale data, refresh in the background
      if (entry && now < entry.staleUntil) {
        if (!inflight.has(key)) {
          refresh().catch((err: unknown) => {
            logger.warn(`SWR background revalidate failed for ${key}`, err);
          });
        }
        return copy(entry.data);
      }

      // Cold or expired: wait for upstream; joiners get their own copy
      const joined = inflight.get(key) as Promise<T | null> | undefined;
      return joined ? copy(await joined) : refresh();
    },
  };
}

/** Cache manager for `cache: false`: nothing is stored, swr always fetches */
export function createNoOpCacheManager(): CacheManager {
  return {
    get: () => Promise.resolve(undefined),
    set: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    swr: (_key, fetcher) => fetcher(),
  };
}
