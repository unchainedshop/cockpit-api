/**
 * Cockpit API - TypeScript client for Cockpit CMS
 *
 * @packageDocumentation
 */

export { CockpitAPI } from "./client.ts";
export type { CockpitAPIClient } from "./client.ts";

export type { CockpitAPIOptions } from "./core/config.ts";
export type {
  CacheManager,
  CacheOptions,
  AsyncCacheStore,
} from "./core/cache.ts";

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

export {
  generateCmsRouteReplacements,
  generateCollectionAndSingletonSlugRouteMap,
} from "./utils/route-map.ts";

export type { ResponseTransformer } from "./transformers/image-path.ts";
export {
  createImagePathTransformer,
  identityTransformer,
} from "./transformers/image-path.ts";
export {
  createAssetPathTransformer,
  createPageLinkTransformer,
  composeTransformers,
} from "./transformers/index.ts";

export type {
  MethodContext,
  ListQueryOptions,
  ContentItemQueryOptions,
  ContentListQueryOptions,
  TreeQueryOptions,
  AggregateQueryOptions,
} from "./methods/content.ts";
export type { PageByIdOptions, PageByRouteOptions } from "./methods/pages.ts";
export type { MenuQueryOptions } from "./methods/menus.ts";
export type { SearchQueryOptions } from "./methods/search.ts";
export type { LocalizeOptions } from "./methods/localize.ts";

export type {
  CockpitContentItem,
  CockpitNewsItem,
  CockpitTreeNode,
  CockpitListResponse,
  CockpitListMeta,
} from "./methods/content.ts";

export { ImageSizeMode, MimeType } from "./methods/assets.ts";
export type { CockpitAsset, ImageAssetQueryParams } from "./methods/assets.ts";

export type {
  CockpitPageType,
  CockpitPageMeta,
  CockpitPageSeo,
  CockpitLayoutBlock,
  CockpitPage,
} from "./methods/pages.ts";

export type {
  CockpitMenuUrl,
  CockpitMenuLink,
  CockpitMenu,
} from "./methods/menus.ts";

export type {
  CockpitRoute,
  CockpitRoutesResponse,
  CockpitSitemapEntry,
  CockpitPreviewConfig,
  CockpitSettings,
} from "./methods/routes.ts";

export type {
  CockpitSearchHit,
  CockpitSearchResult,
} from "./methods/search.ts";

export type { CockpitHealthCheck } from "./methods/system.ts";

export {
  parseCockpitUrl,
  isCockpitPageUrl,
  isCockpitAssetUrl,
  extractPageId,
  extractAssetId,
} from "./utils/url-protocols.ts";
export type {
  CockpitProtocol,
  ParsedCockpitUrl,
} from "./utils/url-protocols.ts";
