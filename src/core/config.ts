/**
 * Configuration management for Cockpit API client
 */

import { resolveApiKey } from "../utils/tenant.ts";

// ============================================================================
// Types
// ============================================================================

export interface CockpitAPIOptions {
  /** Cockpit CMS endpoint URL (falls back to COCKPIT_GRAPHQL_ENDPOINT env var) */
  endpoint?: string;
  /** Tenant name for multi-tenant setups */
  tenant?: string;
  /** API key (falls back to COCKPIT_SECRET env var) */
  apiKey?: string;
  /** Use admin access with API key */
  useAdminAccess?: boolean;
  /** Cache configuration */
  cache?: {
    /** Max entries (falls back to COCKPIT_CACHE_MAX env var, default: 100) */
    max?: number;
    /** TTL in ms (falls back to COCKPIT_CACHE_TTL env var, default: 100000) */
    ttl?: number;
  };
}

export interface CockpitConfig {
  readonly endpoint: URL;
  readonly tenant?: string;
  readonly apiKey?: string;
  readonly useAdminAccess: boolean;
  readonly cachePrefix: string;
}

/**
 * Creates an immutable configuration object for the Cockpit API client
 */
export function createConfig(options: CockpitAPIOptions = {}): CockpitConfig {
  const endpointStr = options.endpoint ?? process.env.COCKPIT_GRAPHQL_ENDPOINT;
  if (!endpointStr) {
    throw new Error(
      "Cockpit: endpoint is required (provide via options or COCKPIT_GRAPHQL_ENDPOINT env var)"
    );
  }
  const endpoint = new URL(endpointStr);

  return Object.freeze({
    endpoint,
    tenant: options.tenant,
    apiKey: resolveApiKey(options.tenant, options),
    useAdminAccess: options.useAdminAccess ?? false,
    cachePrefix: `${endpointStr}:${options.tenant || "default"}:`,
  });
}
