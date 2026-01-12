/**
 * Configuration management for Cockpit API client
 */

import { resolveApiKey } from "../utils/tenant.ts";

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
  /** Cache configuration */
  cache?: {
    /** Max entries (falls back to COCKPIT_CACHE_MAX env var, default: 100) */
    max?: number;
    /** TTL in ms (falls back to COCKPIT_CACHE_TTL env var, default: 100000) */
    ttl?: number;
  };
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
