/**
 * Tenant utilities for multi-tenant Cockpit CMS support
 */

import type { CockpitAPIOptions } from "../core/config.ts";

export interface ResolveTenantFromUrlOptions {
  /** Subdomain of the default space, never resolved as a tenant */
  defaultHost?: string;
}

export interface TenantUrlResult {
  /** Configured tenant (see `getTenantIds`) matching the first host label, else null */
  tenant: string | null;
  /** Last path segment, or null */
  slug: string | null;
  hostname: string;
}

const SECRET_NAME = "COCKPIT_SECRET";
const TENANT_SECRET_PREFIX = `${SECRET_NAME}_`;

/**
 * Tenant ids (lower-cased) of the `COCKPIT_SECRET_<TENANT>` env variables;
 * names ending in `_FILE` (secret file paths) are skipped
 */
export const getTenantIds = (): string[] => [
  ...new Set(
    Object.keys(process.env)
      .filter(
        (key) =>
          key.startsWith(TENANT_SECRET_PREFIX) &&
          !key.toUpperCase().endsWith("_FILE"),
      )
      .map((key) => key.slice(TENANT_SECRET_PREFIX.length).toLowerCase())
      .filter((id) => id !== ""),
  ),
];

/**
 * API key: `options.apiKey`, else `COCKPIT_SECRET_<TENANT>` (matched
 * case-insensitively, the upper-case name first), else, without a tenant,
 * `COCKPIT_SECRET`. Env values are trimmed; empty values count as missing. Deliberately no fallback from a tenant to `COCKPIT_SECRET`:
 * the default space's key must never be sent to another tenant.
 */
export const resolveApiKey = (
  tenant?: string,
  options?: CockpitAPIOptions,
): string | undefined => {
  if (options?.apiKey) return options.apiKey;
  const name = tenant
    ? `${TENANT_SECRET_PREFIX}${tenant.toUpperCase()}`
    : SECRET_NAME;
  const match =
    name in process.env
      ? name
      : Object.keys(process.env).find((key) => key.toUpperCase() === name);
  const key = match === undefined ? undefined : process.env[match]?.trim();
  return key === "" ? undefined : key;
};

/**
 * Tenant and slug of a URL: the tenant is the first host label (subdomain)
 * if it is a configured tenant (`COCKPIT_SECRET_<TENANT>`, case-insensitive)
 * other than `defaultHost`.
 *
 * @example
 * ```typescript
 * // With COCKPIT_SECRET_MYTENANT set:
 * resolveTenantFromUrl("https://mytenant.example.com/some/page");
 * // { tenant: "mytenant", slug: "page", hostname: "mytenant.example.com" }
 * ```
 */
export function resolveTenantFromUrl(
  url: string | URL,
  { defaultHost }: ResolveTenantFromUrlOptions = {},
): TenantUrlResult {
  const { hostname, pathname } = new URL(url);
  const subdomain = hostname.split(".")[0]?.toLowerCase();
  const tenant =
    subdomain !== undefined &&
    subdomain !== defaultHost?.toLowerCase() &&
    getTenantIds().includes(subdomain)
      ? subdomain
      : null;
  const slug = pathname.split("/").filter(Boolean).pop() ?? null;
  return { tenant, slug, hostname };
}
