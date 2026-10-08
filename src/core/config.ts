/**
 * Configuration of the Cockpit API client (options with env var fallbacks)
 */

import { createHash } from "node:crypto";
import { warnOnce } from "../cockpit-logger.ts";
import { resolveApiKey } from "../utils/tenant.ts";
import { DEFAULT_TIMEOUT_MS } from "./url.ts";
import type { CacheOptions } from "./cache.ts";

export interface CockpitAPIOptions {
  /** Cockpit endpoint URL (env: COCKPIT_GRAPHQL_ENDPOINT) */
  endpoint?: string;
  /** Tenant for multi-tenant setups (requests go to `/:<tenant>/api/...`) */
  tenant?: string;
  /** API key (env: COCKPIT_SECRET_<TENANT>, or COCKPIT_SECRET without a tenant) */
  apiKey?: string;
  /** Send the API key with every request (overridable per request) */
  useAdminAccess?: boolean;
  /** Language sent as Cockpit's "default" locale (default: null, no mapping) */
  defaultLanguage?: string | null;
  /** `false` disables caching; see README for custom stores (Redis, Keyv, ...) */
  cache?: false | CacheOptions;
  /** Public origin for asset URLs when the endpoint is internal (env: COCKPIT_PUBLIC_URL) */
  publicUrl?: string;
  /** Emit host-relative asset paths (env: COCKPIT_RELATIVE_ASSET_PATHS=true) */
  relativeAssetPaths?: boolean;
  /** Resolve `pages://id` links per response with the locale's route map (default: false) */
  resolvePageLinks?: boolean;
  /** Request timeout in ms, `0` disables (env: COCKPIT_TIMEOUT, default: 15000) */
  timeout?: number;
}

export interface CockpitConfig {
  readonly endpoint: URL;
  readonly tenant?: string;
  readonly apiKey?: string;
  readonly useAdminAccess: boolean;
  readonly defaultLanguage: string | null;
  readonly publicUrl?: string;
  readonly relativeAssetPaths: boolean;
  readonly resolvePageLinks: boolean;
  /** Request timeout in ms; `0` disables it */
  readonly timeout: number;
  readonly cache: false | CacheOptions;
  /**
   * `cockpit-api:<endpoint>:<tenant>:<access scope>:`, so clients for other
   * endpoints, tenants or keys sharing one store never see each other's entries
   */
  readonly cachePrefix: string;
}

/** Env var value, `undefined` when unset or blank */
export function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

/** Numeric env var; throws when set but not a number */
export function envNumber(name: string): number | undefined {
  const value = env(name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Cockpit: Invalid ${name} (expected a number)`);
  }
  return parsed;
}

/**
 * Cache scope of the effective access mode: `"public"` without api-Key,
 * otherwise `"admin-<short sha256 of the key>"` (keys with different
 * permissions get separate entries; the raw key never appears in a key).
 */
export function accessCacheScope(
  config: Pick<CockpitConfig, "apiKey" | "useAdminAccess">,
  useAdminAccess?: boolean,
): string {
  if (!(useAdminAccess ?? config.useAdminAccess)) return "public";
  // Admin access without a key throws before any request: never holds data
  if (!config.apiKey) return "admin";
  const digest = createHash("sha256").update(config.apiKey).digest("hex");
  return `admin-${digest.slice(0, 12)}`;
}

const VALID_TENANT = /^[a-z0-9_-]+$/i;

export function createConfig(options: CockpitAPIOptions = {}): CockpitConfig {
  const endpointStr = options.endpoint ?? env("COCKPIT_GRAPHQL_ENDPOINT");
  if (endpointStr === undefined || endpointStr === "") {
    throw new Error(
      "Cockpit: endpoint is required (provide via options or COCKPIT_GRAPHQL_ENDPOINT env var)",
    );
  }
  const tenant = options.tenant === "" ? undefined : options.tenant;
  if (tenant !== undefined && !VALID_TENANT.test(tenant)) {
    throw new Error(
      "Cockpit: Invalid tenant format (only alphanumeric, hyphens, and underscores allowed)",
    );
  }

  const timeout =
    options.timeout ?? envNumber("COCKPIT_TIMEOUT") ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new Error(
      "Cockpit: Invalid timeout (expected a non-negative number of milliseconds, 0 to disable)",
    );
  }

  // Removed v2 options are ignored: tell JS callers once
  if ("preloadRoutes" in options) {
    warnOnce(
      "preloadRoutes",
      "Cockpit: preloadRoutes was removed in v3 and is ignored; use resolvePageLinks",
    );
  }
  for (const key of ["ttl", "maxSize", "memoryLayer"]) {
    if (options.cache && key in options.cache) {
      warnOnce(
        `cache.${key}`,
        `Cockpit: cache.${key} was removed in v3 and is ignored`,
      );
    }
  }

  const apiKey = resolveApiKey(tenant, options);
  // Without trailing slashes: base URLs are joined with absolute paths
  const publicUrl = (options.publicUrl ?? env("COCKPIT_PUBLIC_URL"))?.replace(
    /\/+$/,
    "",
  );
  const useAdminAccess = options.useAdminAccess ?? false;
  const scope = accessCacheScope({
    useAdminAccess,
    ...(apiKey !== undefined && { apiKey }),
  });
  // `max` only sizes the built-in store
  const max =
    options.cache === false || options.cache?.store !== undefined
      ? undefined
      : (options.cache?.max ?? envNumber("COCKPIT_CACHE_MAX"));

  return Object.freeze({
    endpoint: new URL(endpointStr),
    useAdminAccess,
    defaultLanguage: options.defaultLanguage ?? null,
    relativeAssetPaths:
      options.relativeAssetPaths ??
      env("COCKPIT_RELATIVE_ASSET_PATHS") === "true",
    resolvePageLinks: options.resolvePageLinks ?? false,
    timeout,
    cache:
      options.cache === false
        ? false
        : {
            ...options.cache,
            ...(max !== undefined && { max }),
          },
    cachePrefix: `cockpit-api:${endpointStr}:${tenant ?? "default"}:${scope}:`,
    ...(tenant !== undefined && { tenant }),
    ...(apiKey !== undefined && { apiKey }),
    ...(publicUrl !== undefined && { publicUrl }),
  });
}
