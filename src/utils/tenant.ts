/**
 * Tenant utilities for multi-tenant Cockpit CMS support
 */

import type { CockpitAPIOptions } from "../core/config.ts";

/**
 * Options for URL-based tenant resolution
 */
export interface ResolveTenantFromUrlOptions {
  /** Default hostname to exclude from tenant matching (e.g., "gastro") */
  defaultHost?: string;
}

/**
 * Result of tenant resolution from URL
 */
export interface TenantUrlResult {
  /** Resolved tenant ID or null if not found */
  tenant: string | null;
  /** Slug extracted from pathname (last path segment) */
  slug: string | null;
  /** The parsed hostname */
  hostname: string;
}

/**
 * Options for subdomain-based tenant resolution
 */
export interface ResolveTenantFromSubdomainOptions {
  /** Default hostname to exclude from tenant matching */
  defaultHost?: string;
}

/**
 * Get all configured tenant IDs from environment variables
 * Looks for COCKPIT_SECRET_<TENANT> patterns
 */
export const getTenantIds = (): string[] => {
  const env = { ...process.env };
  const cockpitSecretKeys = Object.keys(env).filter(
    (key) =>
      key.includes("COCKPIT_SECRET") &&
      key !== "COCKPIT_SECRET" &&
      !key.endsWith("_FILE"),
  );

  return cockpitSecretKeys.map((key) => {
    return key.slice("COCKPIT_SECRET_".length).toLowerCase();
  });
};

/**
 * Resolve the API key for a tenant
 * Priority: options.apiKey > COCKPIT_SECRET_<TENANT> > COCKPIT_SECRET
 */
export const resolveApiKey = (
  tenant?: string,
  options?: CockpitAPIOptions,
): string | undefined => {
  if (options?.apiKey !== undefined) return options.apiKey;
  const secretName = ["COCKPIT_SECRET", tenant]
    .filter(Boolean)
    .join("_")
    .toUpperCase();
  return process.env[secretName];
};

/**
 * Resolve tenant ID from a subdomain
 *
 * Checks if the subdomain matches any configured tenant ID (from COCKPIT_SECRET_* env vars).
 * Returns null if subdomain matches defaultHost or is not a valid tenant.
 *
 * @example
 * ```typescript
 * // With COCKPIT_SECRET_MYTENANT env var set:
 * resolveTenantFromSubdomain("mytenant") // Returns: "mytenant"
 * resolveTenantFromSubdomain("unknown")  // Returns: null
 * resolveTenantFromSubdomain("gastro", { defaultHost: "gastro" }) // Returns: null
 * ```
 */
export function resolveTenantFromSubdomain(
  subdomain: string | undefined,
  options: ResolveTenantFromSubdomainOptions = {},
): string | null {
  if (subdomain === undefined) return null;

  const { defaultHost } = options;
  const normalizedSubdomain = subdomain.toLowerCase();

  // Skip if it matches the default host
  if (normalizedSubdomain === defaultHost?.toLowerCase()) {
    return null;
  }

  // Check against configured tenant IDs
  const tenantIds = getTenantIds();
  const matchedTenant = tenantIds.find((id) => id === normalizedSubdomain);

  return matchedTenant ?? null;
}

/**
 * Resolve tenant ID and slug from a URL
 *
 * Examines the subdomain of the URL against configured tenant IDs.
 * Returns null for tenant if subdomain matches defaultHost or is not a valid tenant.
 *
 * @example
 * ```typescript
 * // With COCKPIT_SECRET_MYTENANT env var set:
 * resolveTenantFromUrl("https://mytenant.example.com/some/page")
 * // Returns: { tenant: "mytenant", slug: "page", hostname: "mytenant.example.com" }
 *
 * resolveTenantFromUrl("https://gastro.example.com/page", { defaultHost: "gastro" })
 * // Returns: { tenant: null, slug: "page", hostname: "gastro.example.com" }
 * ```
 */
export function resolveTenantFromUrl(
  url: string,
  options: ResolveTenantFromUrlOptions = {},
): TenantUrlResult {
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname;

  // Extract slug from pathname (last segment)
  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1];
  const slug = lastSegment ?? null;

  // Extract subdomain (first part of hostname)
  const hostnameParts = hostname.split(".");
  const firstPart = hostnameParts[0];
  const subdomain = firstPart?.toLowerCase();

  // Resolve tenant from subdomain
  const tenant = resolveTenantFromSubdomain(subdomain, options);

  return { tenant, slug, hostname };
}
