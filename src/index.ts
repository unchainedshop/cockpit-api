/**
 * Cockpit API - TypeScript client for Cockpit CMS
 */

// Main API client
export { CockpitAPI } from "./client.ts";
export type { CockpitAPIClient } from "./client.ts";

// Configuration
export type { CockpitAPIOptions } from "./core/config.ts";
export type { CacheManager, CacheOptions } from "./core/cache.ts";

// Utility functions
export { getTenantIds } from "./utils/tenant.ts";
export {
  generateCmsRouteReplacements,
  generateCollectionAndSingletonSlugRouteMap,
} from "./utils/route-map.ts";

// Transformers (for advanced use cases)
export { FixImagePaths, createImagePathTransformer, identityTransformer } from "./transformers/image-path.ts";
export type { ResponseTransformer } from "./transformers/image-path.ts";

// Content types
export type {
  MethodContext,
  ListQueryOptions,
  ContentItemQueryOptions,
  ContentListQueryOptions,
  TreeQueryOptions,
  AggregateQueryOptions,
  CockpitContentItem,
  CockpitNewsItem,
  CockpitTreeNode,
} from "./methods/content.ts";

// Asset types
export { ImageSizeMode, MimeType } from "./methods/assets.ts";
export type { CockpitAsset, ImageAssetQueryParams } from "./methods/assets.ts";

// Page types
export type {
  PageQueryOptions,
  PageByRouteOptions,
  CockpitPageType,
  CockpitPageMeta,
  CockpitPageSeo,
  CockpitLayoutBlock,
  CockpitPage,
} from "./methods/pages.ts";

// Menu types
export type { MenuQueryOptions, CockpitMenuUrl, CockpitMenuLink, CockpitMenu } from "./methods/menus.ts";

// Route types
export type {
  CockpitRoute,
  CockpitRoutesResponse,
  CockpitSitemapEntry,
  CockpitPreviewConfig,
  CockpitSettings,
} from "./methods/routes.ts";

// Search types
export type { SearchQueryOptions, CockpitSearchHit, CockpitSearchResult } from "./methods/search.ts";

// Localize types
export type { LocalizeOptions } from "./methods/localize.ts";

// System types
export type { CockpitHealthCheck } from "./methods/system.ts";
