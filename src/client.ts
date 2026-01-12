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
} from "./methods/content.ts";
import { createPagesMethods, type PageQueryOptions } from "./methods/pages.ts";
import { createMenuMethods, type MenuQueryOptions } from "./methods/menus.ts";
import { createRouteMethods } from "./methods/routes.ts";
import {
  createAssetMethods,
  type ImageAssetQueryParams,
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
  getContentItems<T = unknown>(
    model: string,
    options?: ContentListQueryOptions,
  ): Promise<T | null>;
  getContentTree<T = unknown>(
    model: string,
    options?: TreeQueryOptions,
  ): Promise<T | null>;
  getAggregateModel<T = unknown>(
    options: AggregateQueryOptions,
  ): Promise<T | null>;
  postContentItem<T = unknown>(
    model: string,
    item: Record<string, unknown>,
  ): Promise<T | null>;
  deleteContentItem<T = unknown>(model: string, id: string): Promise<T | null>;

  // Pages API
  pages<T = unknown>(options?: ContentListQueryOptions): Promise<T | null>;
  pageById<T = unknown>(options: PageQueryOptions): Promise<T | null>;
  pageByRoute<T = unknown>(
    route: string,
    options?: { locale?: string; populate?: number } | string,
  ): Promise<T | null>;

  // Menu API
  pagesMenus<T = unknown>(
    options?: MenuQueryOptions | string,
  ): Promise<T | null>;
  pagesMenu<T = unknown>(
    name: string,
    options?: MenuQueryOptions | string,
  ): Promise<T | null>;

  // Routes & Sitemap
  pagesRoutes<T = unknown>(locale?: string): Promise<T | null>;
  pagesSitemap<T = unknown>(): Promise<T | null>;
  pagesSetting<T = unknown>(locale?: string): Promise<T | null>;

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
  assetById<T = unknown>(assetId: string): Promise<T | null>;
  imageAssetById<T = unknown>(
    assetId: string,
    queryParams?: ImageAssetQueryParams,
  ): Promise<T | null>;

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
  };

  // Create method groups
  const contentMethods = createContentMethods(ctx);
  const pagesMethods = createPagesMethods(ctx);
  const menuMethods = createMenuMethods(ctx);
  const routeMethods = createRouteMethods(ctx, options.tenant);
  const assetMethods = createAssetMethods(ctx);
  const graphqlMethods = createGraphQLMethods(ctx, urlBuilder);
  const searchMethods = createSearchMethods(ctx);
  const localizeMethods = createLocalizeMethods(ctx);
  const systemMethods = createSystemMethods(ctx, cache);

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
