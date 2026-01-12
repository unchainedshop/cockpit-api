/**
 * Asset path transformer for fixing Cockpit CMS storage paths
 */

import { logger } from "../cockpit-logger.ts";
import type { ResponseTransformer } from "./image-path.ts";

export interface AssetPathConfig {
  /** Base URL of the Cockpit CMS (origin only) */
  baseUrl: string;
  /** Tenant name for multi-tenant setups */
  tenant?: string;
}

/**
 * Transforms asset paths in a JSON string.
 * This is the core transformation logic used by the transformer.
 */
export function transformAssetPaths(
  jsonString: string,
  config: AssetPathConfig,
): string {
  const { baseUrl, tenant } = config;
  const tenantUrl = `${baseUrl}${tenant !== undefined ? `/:${tenant}` : ""}`;

  return (
    jsonString
      // Fix asset paths in "path" fields
      .replace(/"path":"\//g, `"path":"${tenantUrl}/storage/uploads/`)
      // Fix storage paths in src attributes
      .replace(/src=\\"(\/[^"]*?)storage/gi, `src=\\"${baseUrl}$1storage`)
      // Fix storage paths in href attributes
      .replace(/href=\\"(\/[^"]*?)storage/gi, `href=\\"${baseUrl}$1storage`)
      // Fix duplicate storage/uploads paths (cleanup)
      .replace(/\/storage\/uploads\/storage\/uploads\//g, `/storage/uploads/`)
  );
}

/**
 * Creates a transformer that fixes asset paths in responses.
 * Use this when you only need asset path fixing without page link resolution.
 */
export function createAssetPathTransformer(
  config: AssetPathConfig,
): ResponseTransformer {
  return {
    transform<T>(originalResponse: T): T {
      try {
        const jsonString = JSON.stringify(originalResponse);
        const fixedString = transformAssetPaths(jsonString, config);
        return JSON.parse(fixedString) as T;
      } catch (error) {
        logger.warn("Cockpit: Failed to transform asset paths", error);
        return originalResponse;
      }
    },
  };
}
