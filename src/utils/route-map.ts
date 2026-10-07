/**
 * Route map utilities for CMS page link resolution
 *
 * Both maps go through the cache manager's stale-while-revalidate wrapper, so
 * they share the fresh/stale windows of every other cached read: a fresh hit
 * returns immediately, a stale hit returns the cached map and refreshes it in
 * the background, and an upstream failure keeps serving the last good map.
 */

import { logger } from "../cockpit-logger.ts";
import type { CacheManager } from "../core/cache.ts";

// Versioned because the values are SWR envelopes. Earlier releases stored bare
// maps under the unversioned keys; sharing a key across versions (e.g. during
// a rolling deploy against one Redis) would make each misread the other's
// format.
const ROUTE_REPLACEMENT_MAP_KEY = "ROUTE_REPLACEMENT_MAP:v2";
const SLUG_ROUTE_MAP_KEY = "SLUG_ROUTE_MAP:v2";

interface PageRouteItem {
  _id: string;
  _r: string;
  slug?: string;
}

interface PageDataItem {
  data?: {
    collection?: string;
    singleton?: string;
  };
  _r: string;
  type?: string;
}

/**
 * Fetch the pages list. Throws on HTTP errors and non-array bodies so the SWR
 * cache never stores them and keeps serving the previous map instead. A 404
 * (no Pages addon) is a definitive "no pages" and yields an empty list.
 */
async function fetchPages<T>(
  endpoint: string,
  tenant: string | undefined,
  params: Record<string, string>,
): Promise<T[]> {
  const origin = new URL(endpoint).origin;
  const apiPath = tenant ? `/:${tenant}/api` : "/api";
  const response = await fetch(
    `${origin}${apiPath}/pages/pages?${new URLSearchParams(params).toString()}`,
  );

  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`status ${String(response.status)}`);
  }

  const pagesResponse: unknown = await response.json();
  if (!Array.isArray(pagesResponse)) {
    throw new Error("response is not an array");
  }
  return pagesResponse as T[];
}

/**
 * Read a route map through the SWR cache. Never throws: without a cached map
 * to fall back on, a failed fetch yields an empty (uncached) map.
 */
async function cachedRouteMap(
  label: string,
  key: string,
  load: () => Promise<Record<string, string>>,
  cache?: CacheManager,
): Promise<Record<string, string>> {
  try {
    return (cache ? await cache.swr(key, load) : await load()) ?? {};
  } catch (e) {
    logger.warn(`Cockpit: Failed to fetch ${label}`, e);
    return {};
  }
}

/**
 * Generate route replacements for page links (pages://id -> actual route)
 */
export async function generateCmsRouteReplacements(
  endpoint: string,
  tenant?: string,
  cache?: CacheManager,
): Promise<Record<string, string>> {
  return cachedRouteMap(
    "route replacements",
    `${ROUTE_REPLACEMENT_MAP_KEY}:${tenant ?? "default"}`,
    async () => {
      const pagesArr = await fetchPages<PageRouteItem>(endpoint, tenant, {
        fields: JSON.stringify({ _id: 1, slug: 1, _r: 1 }),
      });

      return pagesArr.reduce<Record<string, string>>((result, item) => {
        const key = `pages://${item._id}`;
        const value = item._r;
        return { ...result, [key]: value };
      }, {});
    },
    cache,
  );
}

/**
 * Generate slug to route map for collections and singletons
 */
export async function generateCollectionAndSingletonSlugRouteMap(
  endpoint: string,
  tenant?: string,
  cache?: CacheManager,
): Promise<Record<string, string>> {
  return cachedRouteMap(
    "slug route map",
    `${SLUG_ROUTE_MAP_KEY}:${tenant ?? "default"}`,
    async () => {
      const pagesArr = await fetchPages<PageDataItem>(endpoint, tenant, {
        locale: "default",
        fields: JSON.stringify({
          data: { collection: 1, singleton: 1 },
          _r: 1,
          type: 1,
        }),
        filter: JSON.stringify({ "data.collection": { $ne: null } }),
      });

      return pagesArr.reduce<Record<string, string>>((result, { data, _r }) => {
        const entityName = data?.collection ?? data?.singleton;
        if (entityName === undefined) return result;
        return { ...result, [entityName]: _r };
      }, {});
    },
    cache,
  );
}
