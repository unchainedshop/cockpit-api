/**
 * System API methods
 */

import { ROUTE_MAPS_PREFIX } from "../links.ts";
import { get, type MethodContext } from "./context.ts";

export interface CockpitHealthCheck {
  status: "ok" | "error";
  message?: string;
  version?: string;
  timestamp?: string;
}

export interface SystemMethods {
  healthCheck<T = unknown>(): Promise<T | null>;
  /** Clears cached entries whose key starts with `pattern` (all without) */
  clearCache(pattern?: string): Promise<void>;
  /**
   * Invalidates everything derived from page routes, e.g. after pages were
   * moved or (un)published: route maps (all locales), `pageByRoute` lookups,
   * `pagesRoutes` and `pagesSitemap`. Other cached content stays; its links
   * resolve against the refreshed maps on the next read.
   */
  clearRouteCache(): Promise<void>;
}

/** Cache key prefixes cleared by `clearRouteCache()` (see `cacheKey`) */
export const ROUTE_CACHE_PREFIXES: readonly string[] = [
  ROUTE_MAPS_PREFIX,
  "/pages/page|",
  "/pages/routes|",
  "/pages/sitemap|",
];

export function createSystemMethods(ctx: MethodContext): SystemMethods {
  return {
    async healthCheck<T = unknown>(): Promise<T | null> {
      return get<T>(ctx, "/system/healthcheck", { cache: false, links: false });
    },

    async clearCache(pattern?: string): Promise<void> {
      await ctx.cache.clear(pattern);
    },

    async clearRouteCache(): Promise<void> {
      await Promise.all(
        ROUTE_CACHE_PREFIXES.map((prefix) => ctx.cache.clear(prefix)),
      );
    },
  };
}
