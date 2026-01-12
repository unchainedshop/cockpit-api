/**
 * Tenant utilities for multi-tenant Cockpit CMS support
 */

import type { CockpitAPIOptions } from "../core/config.ts";

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
      !key.endsWith("_FILE")
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
  options?: CockpitAPIOptions
): string | undefined => {
  if (options?.apiKey) return options.apiKey;
  const secretName = ["COCKPIT_SECRET", tenant]
    .filter(Boolean)
    .join("_")
    .toUpperCase();
  return process.env[secretName];
};
