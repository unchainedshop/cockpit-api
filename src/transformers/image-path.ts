/**
 * Image path transformer for fixing asset paths and page links
 *
 * This module provides the main transformer that combines asset path fixing
 * and page link resolution in a single efficient pass. For individual
 * transformers, see asset-path.ts and page-link.ts.
 */

import { logger } from "../cockpit-logger.ts";
import { transformAssetPaths, type AssetPathConfig } from "./asset-path.ts";
import { transformPageLinks } from "./page-link.ts";

export interface ResponseTransformer {
  transform<T>(response: T): T;
}

export const identityTransformer: ResponseTransformer = {
  transform<T>(response: T): T {
    return response;
  },
};

export interface ImagePathTransformerConfig extends AssetPathConfig {
  /** Route replacements map (pages://id -> route) */
  replacements: Record<string, string>;
}

/**
 * Creates a transformer that fixes image paths and resolves page links.
 * Uses a single JSON stringify/parse cycle for efficiency.
 */
export function createImagePathTransformer(
  config: ImagePathTransformerConfig,
): ResponseTransformer {
  const { baseUrl, tenant, replacements } = config;

  // Build asset config, only including tenant if defined
  const assetConfig: AssetPathConfig = { baseUrl };
  if (tenant !== undefined) assetConfig.tenant = tenant;

  return {
    transform<T>(originalResponse: T): T {
      try {
        // Single stringify for efficiency
        let jsonString = JSON.stringify(originalResponse);

        // Apply asset path transformations
        jsonString = transformAssetPaths(jsonString, assetConfig);

        // Apply page link transformations
        jsonString = transformPageLinks(jsonString, replacements);

        return JSON.parse(jsonString) as T;
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
