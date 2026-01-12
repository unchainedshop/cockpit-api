/**
 * Configuration management for Cockpit API client
 */

import { resolveApiKey } from "../utils/tenant.ts";
import type { CacheOptions } from "./cache.ts";

export interface CockpitAPIOptions {
  /** Cockpit CMS endpoint URL (falls back to COCKPIT_GRAPHQL_ENDPOINT env var) */
  endpoint?: string;
  /** Tenant name for multi-tenant setups */
  tenant?: string;
  /** API key (falls back to COCKPIT_SECRET env var) */
  apiKey?: string;
  /** Use admin access with API key */
  useAdminAccess?: boolean;
  /**
   * Default language that maps to Cockpit's "default" locale.
   * When a request uses this language, it will be sent as "default" to Cockpit.
   */
  defaultLanguage?: string | null;
  /**
   * Cache configuration
   *
   * - Set to `false` to disable caching entirely
   * - Set to an object to configure cache behavior
   * - Omit to use default LRU cache with env var fallbacks
   *
   * @example Disable cache
   * ```typescript
   * const client = await CockpitAPI({
   *   endpoint: 'https://cms.example.com',
   *   cache: false
   * });
   * ```
   *
   * @example Custom cache options
   * ```typescript
   * const client = await CockpitAPI({
   *   endpoint: 'https://cms.example.com',
   *   cache: { max: 200, ttl: 300000 }
   * });
   * ```
   *
   * @example Redis store
   * ```typescript
   * import { createClient } from 'redis';
   *
   * const redisClient = createClient({ url: process.env.REDIS_URL });
   * await redisClient.connect();
   *
   * const client = await CockpitAPI({
   *   endpoint: 'https://cms.example.com',
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
   *           const keys = await redisClient.keys(\`\${pattern}*\`);
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
  cache?: false | CacheOptions;
  /**
   * Preload route replacements during client initialization.
   * When true, fetches page routes to enable `pages://id` link resolution in responses.
   * When false (default), skips the network request for faster cold starts.
   * @default false
   */
  preloadRoutes?: boolean;
}

export interface CockpitConfig {
  readonly endpoint: URL;
  readonly tenant?: string;
  readonly apiKey?: string;
  readonly useAdminAccess: boolean;
  readonly defaultLanguage: string | null;
  readonly cachePrefix: string;
}

/** Valid tenant format: alphanumeric, hyphens, underscores only */
const VALID_TENANT_PATTERN = /^[a-z0-9_-]+$/i;

/**
 * Creates an immutable configuration object for the Cockpit API client
 */
export function createConfig(options: CockpitAPIOptions = {}): CockpitConfig {
  const endpointStr =
    options.endpoint ?? process.env["COCKPIT_GRAPHQL_ENDPOINT"];
  if (endpointStr === undefined || endpointStr === "") {
    throw new Error(
      "Cockpit: endpoint is required (provide via options or COCKPIT_GRAPHQL_ENDPOINT env var)",
    );
  }

  // Normalize empty string tenant to undefined
  const tenant =
    options.tenant === undefined || options.tenant === ""
      ? undefined
      : options.tenant;

  // Validate tenant format to prevent path traversal
  if (tenant !== undefined && !VALID_TENANT_PATTERN.test(tenant)) {
    throw new Error(
      "Cockpit: Invalid tenant format (only alphanumeric, hyphens, and underscores allowed)",
    );
  }

  const endpoint = new URL(endpointStr);
  const apiKey = resolveApiKey(tenant, options);

  // Build config object with all properties before freezing
  const config: CockpitConfig = Object.freeze({
    endpoint,
    useAdminAccess: options.useAdminAccess ?? false,
    defaultLanguage: options.defaultLanguage ?? null,
    cachePrefix: `${endpointStr}:${tenant ?? "default"}:`,
    ...(tenant !== undefined && { tenant }),
    ...(apiKey !== undefined && { apiKey }),
  });

  return config;
}
