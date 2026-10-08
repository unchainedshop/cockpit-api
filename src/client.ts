/**
 * Cockpit API client factory
 */

import { createConfig, type CockpitAPIOptions } from "./core/config.ts";
import { createCacheManager, createNoOpCacheManager } from "./core/cache.ts";
import { createUrlBuilder } from "./core/url.ts";
import { createHttpClient } from "./core/http.ts";
import { createAssetFixer } from "./transformers/assets.ts";
import { createLinkResolver } from "./links.ts";
import type { MethodContext } from "./methods/context.ts";
import {
  createContentMethods,
  type ContentMethods,
} from "./methods/content.ts";
import { createPagesMethods, type PagesMethods } from "./methods/pages.ts";
import { createMenuMethods, type MenuMethods } from "./methods/menus.ts";
import { createRouteMethods, type RouteMethods } from "./methods/routes.ts";
import { createAssetMethods, type AssetMethods } from "./methods/assets.ts";
import {
  createGraphQLMethods,
  type GraphQLMethods,
} from "./methods/graphql.ts";
import { createSearchMethods, type SearchMethods } from "./methods/search.ts";
import {
  createLocalizeMethods,
  type LocalizeMethods,
} from "./methods/localize.ts";
import { createSystemMethods, type SystemMethods } from "./methods/system.ts";

/** Composed from the method groups, so signatures can't drift */
export interface CockpitAPIClient
  extends
    GraphQLMethods,
    ContentMethods,
    PagesMethods,
    MenuMethods,
    RouteMethods,
    AssetMethods,
    SearchMethods,
    LocalizeMethods,
    SystemMethods {}

/**
 * Creates a Cockpit API client; options fall back to env vars
 * (`COCKPIT_GRAPHQL_ENDPOINT`, `COCKPIT_SECRET`, ...). Nothing is fetched at
 * creation.
 */
// Kept async: the factory has always returned a Promise (public contract).
// eslint-disable-next-line @typescript-eslint/require-await
export async function CockpitAPI(
  options: CockpitAPIOptions = {},
): Promise<CockpitAPIClient> {
  const config = createConfig(options);
  const cache =
    config.cache === false
      ? createNoOpCacheManager()
      : createCacheManager(config.cachePrefix, config.cache);
  const url = createUrlBuilder(config);
  // Asset URLs are fixed before caching; page links are resolved after it,
  // per read, so cached responses follow the current route map
  const http = createHttpClient(
    config,
    createAssetFixer({
      baseUrl: config.relativeAssetPaths
        ? ""
        : (config.publicUrl ?? config.endpoint.origin),
      tenant: config.tenant,
    }),
  );
  // Without a cache, prefetching would double every request: maps are then
  // loaded only for responses with links
  const links = createLinkResolver({
    http,
    url,
    cache,
    prefetch: config.cache !== false,
  });
  const ctx: MethodContext = { config, http, url, cache, links };

  return {
    ...createContentMethods(ctx),
    ...createPagesMethods(ctx),
    ...createMenuMethods(ctx),
    ...createRouteMethods(ctx),
    ...createAssetMethods(ctx),
    ...createGraphQLMethods(ctx),
    ...createSearchMethods(ctx),
    ...createLocalizeMethods(ctx),
    ...createSystemMethods(ctx),
  };
}
