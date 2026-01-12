/**
 * Cockpit API - TypeScript client for Cockpit CMS
 *
 * @packageDocumentation
 */

// ============================================================================
// Client & Factory
// ============================================================================

export { CockpitAPI } from "./client.ts";
export type { CockpitAPIClient } from "./client.ts";

// ============================================================================
// Configuration
// ============================================================================

export type { CockpitAPIOptions } from "./core/config.ts";
export type { CacheManager, CacheOptions } from "./core/cache.ts";

// ============================================================================
// Tenant Utilities
// ============================================================================

export {
  getTenantIds,
  resolveTenantFromUrl,
  resolveTenantFromSubdomain,
} from "./utils/tenant.ts";
export type {
  TenantUrlResult,
  ResolveTenantFromUrlOptions,
  ResolveTenantFromSubdomainOptions,
} from "./utils/tenant.ts";

// ============================================================================
// Route Utilities
// ============================================================================

export {
  generateCmsRouteReplacements,
  generateCollectionAndSingletonSlugRouteMap,
} from "./utils/route-map.ts";

// ============================================================================
// Transformers
// ============================================================================

export type { ResponseTransformer } from "./transformers/image-path.ts";
export {
  createImagePathTransformer,
  identityTransformer,
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  FixImagePaths,
} from "./transformers/image-path.ts";
export {
  createAssetPathTransformer,
  createPageLinkTransformer,
  composeTransformers,
} from "./transformers/index.ts";

// ============================================================================
// Query Option Types
// ============================================================================

export type {
  MethodContext,
  ListQueryOptions,
  ContentItemQueryOptions,
  ContentListQueryOptions,
  TreeQueryOptions,
  AggregateQueryOptions,
} from "./methods/content.ts";
export type { PageQueryOptions, PageByRouteOptions } from "./methods/pages.ts";
export type { MenuQueryOptions } from "./methods/menus.ts";
export type { SearchQueryOptions } from "./methods/search.ts";
export type { LocalizeOptions } from "./methods/localize.ts";

// ============================================================================
// Response Types - Content
// ============================================================================

export type {
  CockpitContentItem,
  CockpitNewsItem,
  CockpitTreeNode,
} from "./methods/content.ts";

// ============================================================================
// Response Types - Assets
// ============================================================================

export { ImageSizeMode, MimeType } from "./methods/assets.ts";
export type { CockpitAsset, ImageAssetQueryParams } from "./methods/assets.ts";

// ============================================================================
// Response Types - Pages
// ============================================================================

export type {
  CockpitPageType,
  CockpitPageMeta,
  CockpitPageSeo,
  CockpitLayoutBlock,
  CockpitPage,
} from "./methods/pages.ts";

// ============================================================================
// Response Types - Menus
// ============================================================================

export type {
  CockpitMenuUrl,
  CockpitMenuLink,
  CockpitMenu,
} from "./methods/menus.ts";

// ============================================================================
// Response Types - Routes & Settings
// ============================================================================

export type {
  CockpitRoute,
  CockpitRoutesResponse,
  CockpitSitemapEntry,
  CockpitPreviewConfig,
  CockpitSettings,
} from "./methods/routes.ts";

// ============================================================================
// Response Types - Search
// ============================================================================

export type {
  CockpitSearchHit,
  CockpitSearchResult,
} from "./methods/search.ts";

// ============================================================================
// Response Types - System
// ============================================================================

export type { CockpitHealthCheck } from "./methods/system.ts";
