/**
 * Route map utilities for CMS page link resolution
 */

import { logger } from "../cockpit-logger.ts";
import type { CacheManager } from "../core/cache.ts";

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
 * Generate route replacements for page links (pages://id -> actual route)
 */
export async function generateCmsRouteReplacements(
  endpoint: string,
  tenant?: string,
  cache?: CacheManager,
): Promise<Record<string, string>> {
  const cacheKey = `ROUTE_REPLACEMENT_MAP:${tenant ?? "default"}`;

  if (cache) {
    const cached = (await cache.get(cacheKey)) as
      | Record<string, string>
      | undefined;
    if (cached) return cached;
  }

  const filterParams = {
    fields: JSON.stringify({ _id: 1, slug: 1, _r: 1 }),
  };

  try {
    const origin = new URL(endpoint).origin;
    const apiPath = tenant !== undefined ? `/:${tenant}/api` : "/api";
    const response = await fetch(
      `${origin}${apiPath}/pages/pages?${new URLSearchParams(filterParams).toString()}`,
    );

    if (!response.ok) {
      logger.warn(
        `Cockpit: Failed to fetch route replacements (status ${String(response.status)})`,
      );
      return {};
    }

    const pagesResponse: unknown = await response.json();
    const pagesArr = (
      Array.isArray(pagesResponse) ? pagesResponse : []
    ) as PageRouteItem[];

    const replacement = pagesArr.reduce<Record<string, string>>(
      (result, item) => {
        const key = `pages://${item._id}`;
        const value = item._r;
        return { ...result, [key]: value };
      },
      {},
    );

    if (cache) {
      await cache.set(cacheKey, replacement);
    }

    return replacement;
  } catch (e) {
    logger.warn("Cockpit: Failed to fetch route replacements", e);
    return {};
  }
}

/**
 * Generate slug to route map for collections and singletons
 */
export async function generateCollectionAndSingletonSlugRouteMap(
  endpoint: string,
  tenant?: string,
  cache?: CacheManager,
): Promise<Record<string, string>> {
  const cacheKey = `SLUG_ROUTE_MAP:${tenant ?? "default"}`;

  if (cache) {
    const cached = (await cache.get(cacheKey)) as
      | Record<string, string>
      | undefined;
    if (cached) return cached;
  }

  const filterParams = {
    fields: JSON.stringify({
      data: { collection: 1, singleton: 1 },
      _r: 1,
      type: 1,
    }),
    filter: JSON.stringify({ "data.collection": { $ne: null } }),
  };

  try {
    const origin = new URL(endpoint).origin;
    const apiPath = tenant !== undefined ? `/:${tenant}/api` : "/api";
    const response = await fetch(
      `${origin}${apiPath}/pages/pages?locale=default&${new URLSearchParams(filterParams).toString()}`,
    );

    if (!response.ok) {
      logger.warn(
        `Cockpit: Failed to fetch slug route map (status ${String(response.status)})`,
      );
      return {};
    }

    const pagesResponse: unknown = await response.json();
    const pagesArr = (
      Array.isArray(pagesResponse) ? pagesResponse : []
    ) as PageDataItem[];

    const pageMap = pagesArr.reduce<Record<string, string>>(
      (result, { data, _r }) => {
        const entityName = data?.collection ?? data?.singleton;
        if (entityName === undefined) return result;
        return { ...result, [entityName]: _r };
      },
      {},
    );

    if (cache) {
      await cache.set(cacheKey, pageMap);
    }

    return pageMap;
  } catch (e) {
    logger.warn("Cockpit: Failed to fetch slug route map", e);
    return {};
  }
}
