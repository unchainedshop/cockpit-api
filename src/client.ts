/**
 * Cockpit API Client Factory
 */

import type { DocumentNode } from "graphql";
import { createConfig, type CockpitAPIOptions } from "./core/config.ts";
import { createCacheManager } from "./core/cache.ts";
import { createUrlBuilder } from "./core/url-builder.ts";
import { createHttpClient } from "./core/http.ts";
import { createImagePathTransformer } from "./transformers/image-path.ts";
import { generateCmsRouteReplacements } from "./utils/route-map.ts";

import {
  createContentMethods,
  type MethodContext,
  type ContentItemQueryOptions,
  type ContentListQueryOptions,
  type TreeQueryOptions,
  type AggregateQueryOptions,
  type CockpitContentItem,
  type CockpitTreeNode,
} from "./methods/content.ts";
import {
  createPagesMethods,
  type PageByIdOptions,
  type CockpitPage,
} from "./methods/pages.ts";
import {
  createMenuMethods,
  type MenuQueryOptions,
  type CockpitMenu,
} from "./methods/menus.ts";
import {
  createRouteMethods,
  type CockpitRoutesResponse,
  type CockpitSitemapEntry,
  type CockpitSettings,
} from "./methods/routes.ts";
import {
  createAssetMethods,
  type ImageAssetQueryParams,
  type CockpitAsset,
} from "./methods/assets.ts";
import { createGraphQLMethods } from "./methods/graphql.ts";
import {
  createSearchMethods,
  type SearchQueryOptions,
  type CockpitSearchResult,
} from "./methods/search.ts";
import {
  createLocalizeMethods,
  type LocalizeOptions,
} from "./methods/localize.ts";
import { createSystemMethods } from "./methods/system.ts";

/**
 * Cockpit API Client interface
 */
export interface CockpitAPIClient {
  // GraphQL
  graphQL<T = unknown>(
    document: DocumentNode,
    variables?: Record<string, unknown>,
  ): Promise<T | null>;

  // Content API
  getContentItem<T = unknown>(
    options: ContentItemQueryOptions,
  ): Promise<T | null>;
  getContentItems<T = CockpitContentItem>(
    model: string,
    options?: ContentListQueryOptions,
  ): Promise<T[] | null>;
  getContentTree<T = CockpitContentItem>(
    model: string,
    options?: TreeQueryOptions,
  ): Promise<CockpitTreeNode<T>[] | null>;
  getAggregateModel<T = unknown>(
    options: AggregateQueryOptions,
  ): Promise<T[] | null>;
  postContentItem<T = unknown>(
    model: string,
    item: Record<string, unknown>,
  ): Promise<T | null>;
  deleteContentItem<T = unknown>(model: string, id: string): Promise<T | null>;

  // Pages API
  pages<T = CockpitPage>(
    options?: ContentListQueryOptions,
  ): Promise<T[] | null>;
  pageById<T = CockpitPage>(
    id: string,
    options?: PageByIdOptions,
  ): Promise<T | null>;
  pageByRoute<T = CockpitPage>(
    route: string,
    options?: { locale?: string; populate?: number } | string,
  ): Promise<T | null>;

  // Menu API
  pagesMenus<T = CockpitMenu>(
    options?: MenuQueryOptions | string,
  ): Promise<T[] | null>;
  pagesMenu<T = CockpitMenu>(
    name: string,
    options?: MenuQueryOptions | string,
  ): Promise<T | null>;

  // Routes & Sitemap
  pagesRoutes<T = CockpitRoutesResponse>(locale?: string): Promise<T | null>;
  pagesSitemap<T = CockpitSitemapEntry>(): Promise<T[] | null>;
  pagesSetting<T = CockpitSettings>(locale?: string): Promise<T | null>;

  // Search (Detektivo addon)
  search<T = CockpitSearchResult>(
    options: SearchQueryOptions,
  ): Promise<T | null>;

  // Health & System
  healthCheck<T = unknown>(): Promise<T | null>;

  // Localization (Lokalize addon)
  localize<T = unknown>(
    projectName: string,
    options?: LocalizeOptions,
  ): Promise<T | null>;

  // Assets
  assetById<T = CockpitAsset>(assetId: string): Promise<T | null>;
  /**
   * Get a transformed image asset URL.
   *
   * **Important:** The `w` (width) or `h` (height) parameter is required by the API.
   * Without it, the API returns a 400 error.
   *
   * @param assetId - The asset ID
   * @param queryParams - Image transformation parameters (w or h required)
   * @returns URL string to the generated image, or null if not found
   */
  imageAssetById(
    assetId: string,
    queryParams?: ImageAssetQueryParams,
  ): Promise<string | null>;

  // Utility
  getFullRouteForSlug(slug: string): Promise<string | undefined>;
  clearCache(pattern?: string): void;
}

/**
 * Creates a Cockpit API client
 *
 * @param options - Configuration options (falls back to env vars if not provided)
 * @returns Promise resolving to the API client
 *
 * @example
 * ```typescript
 * // With explicit options
 * const client = await CockpitAPI({
 *   endpoint: 'https://cms.example.com/api/graphql',
 *   tenant: 'mytenant',
 *   useAdminAccess: true,
 * });
 *
 * // Or using environment variables (COCKPIT_GRAPHQL_ENDPOINT, etc.)
 * const client = await CockpitAPI();
 * ```
 */
export async function CockpitAPI(
  options: CockpitAPIOptions = {},
): Promise<CockpitAPIClient> {
  // Create configuration
  const config = createConfig(options);
  const endpointString = config.endpoint.toString();

  // Create cache manager - env vars take precedence, then options, then cache.ts defaults
  const envCacheMax = process.env["COCKPIT_CACHE_MAX"];
  const envCacheTtl = process.env["COCKPIT_CACHE_TTL"];

  const cacheOptions: { max?: number; ttl?: number } = {};
  const maxValue =
    options.cache?.max ??
    (envCacheMax !== undefined ? parseInt(envCacheMax, 10) : undefined);
  const ttlValue =
    options.cache?.ttl ??
    (envCacheTtl !== undefined ? parseInt(envCacheTtl, 10) : undefined);
  if (maxValue !== undefined) cacheOptions.max = maxValue;
  if (ttlValue !== undefined) cacheOptions.ttl = ttlValue;

  const cache = createCacheManager(config.cachePrefix, cacheOptions);

  // Generate route replacements for image path transformer (optional)
  const routeReplacements =
    options.preloadRoutes === true
      ? await generateCmsRouteReplacements(
          endpointString,
          options.tenant,
          cache,
        )
      : {};

  // Create response transformer
  const transformerConfig: {
    baseUrl: string;
    tenant?: string;
    replacements: Record<string, string>;
  } = {
    baseUrl: config.endpoint.origin,
    replacements: routeReplacements,
  };
  if (options.tenant !== undefined) transformerConfig.tenant = options.tenant;
  const transformer = createImagePathTransformer(transformerConfig);

  // Create URL builder
  const urlBuilder = createUrlBuilder(config);

  // Create HTTP client
  const http = createHttpClient(config, transformer);

  // Create method context
  const ctx: MethodContext = {
    http,
    url: urlBuilder,
    cache,
    endpoint: endpointString,
    ...(options.tenant !== undefined && { tenant: options.tenant }),
  };

  // Create method groups
  const contentMethods = createContentMethods(ctx);
  const pagesMethods = createPagesMethods(ctx);
  const menuMethods = createMenuMethods(ctx);
  const routeMethods = createRouteMethods(ctx);
  const assetMethods = createAssetMethods(ctx);
  const graphqlMethods = createGraphQLMethods(ctx);
  const searchMethods = createSearchMethods(ctx);
  const localizeMethods = createLocalizeMethods(ctx);
  const systemMethods = createSystemMethods(ctx);

  // Compose the client
  return {
    ...contentMethods,
    ...pagesMethods,
    ...menuMethods,
    ...routeMethods,
    ...assetMethods,
    ...graphqlMethods,
    ...searchMethods,
    ...localizeMethods,
    ...systemMethods,
  };
}
