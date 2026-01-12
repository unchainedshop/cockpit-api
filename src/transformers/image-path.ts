/**
 * Image path transformer for fixing asset paths and page links
 */

import { logger } from "../cockpit-logger.ts";

// ============================================================================
// Types
// ============================================================================

export interface ResponseTransformer {
  transform<T>(response: T): T;
}

/**
 * Escapes regex special characters in a string
 */
const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const identityTransformer: ResponseTransformer = {
  transform<T>(response: T): T {
    return response;
  },
};

export interface ImagePathTransformerConfig {
  /** Base URL of the Cockpit CMS */
  baseUrl: string;
  /** Tenant name for multi-tenant setups */
  tenant?: string;
  /** Route replacements map (pages://id -> route) */
  replacements: Record<string, string>;
}

/**
 * Creates a transformer that fixes image paths and resolves page links
 */
export function createImagePathTransformer(
  config: ImagePathTransformerConfig,
): ResponseTransformer {
  const { baseUrl, tenant, replacements } = config;
  const keys = Object.keys(replacements);
  const pattern =
    keys.length > 0 ? new RegExp(keys.map(escapeRegex).join("|"), "g") : null;
  const tenantUrl = `${baseUrl}${tenant !== undefined ? `/:${tenant}` : ""}`;

  return {
    transform<T>(originalResponse: T): T {
      try {
        const rawResponseDataString = JSON.stringify(originalResponse);
        let fixedDataString = rawResponseDataString
          // Fix asset paths
          .replace(/"path":"\//g, `"path":"${tenantUrl}/storage/uploads/`)
          // Fix storage paths in src attributes
          .replace(/src=\\"(\/[^"]*?)storage/gi, `src=\\"${baseUrl}$1storage`)
          // Fix storage paths in href attributes
          .replace(
            /href=\\"(\/[^"]*?)storage/gi,
            `href=\\"${baseUrl}$1storage`,
          );

        // Replace page links (pages://id -> actual route)
        if (pattern) {
          fixedDataString = fixedDataString.replace(
            pattern,
            (match) => replacements[match] ?? match,
          );
        }

        // Fix duplicate storage/uploads paths
        fixedDataString = fixedDataString.replace(
          /\/storage\/uploads\/storage\/uploads\//g,
          `/storage/uploads/`,
        );

        return JSON.parse(fixedDataString) as T;
      } catch (error) {
        logger.warn("Cockpit: Failed to transform response", error);
        return originalResponse;
      }
    },
  };
}

/**
 * Legacy export for backwards compatibility
 * @deprecated Use createImagePathTransformer instead
 */
export function FixImagePaths(
  endpoint: string,
  replacements: Record<string, string>,
  tenant?: string,
): { transformResult<T>(originalResponse: T): T } {
  const baseUrl = new URL(endpoint).origin;

  const config: ImagePathTransformerConfig = {
    baseUrl,
    replacements,
  };
  if (tenant !== undefined) config.tenant = tenant;

  const transformer = createImagePathTransformer(config);

  return {
    transformResult: transformer.transform.bind(transformer),
  };
}
