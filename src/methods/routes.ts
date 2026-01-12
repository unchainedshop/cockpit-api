/**
 * Routes, sitemap, and settings API methods
 */

import type { MethodContext } from "./content.ts";
import type { CockpitAsset } from "./assets.ts";
import type { CockpitPageType, CockpitPageSeo } from "./pages.ts";
import { generateCollectionAndSingletonSlugRouteMap } from "../utils/route-map.ts";

// ============================================================================
// Types
// ============================================================================

export interface CockpitRoute {
  route: string;
  slug: string;
  type: CockpitPageType;
  lastmod: string;
}

export type CockpitRoutesResponse = Record<string, CockpitRoute[]>;

export interface CockpitSitemapEntry {
  routes: Record<string, string>;
  type: CockpitPageType;
  lastmod: string;
}

export interface CockpitPreviewConfig {
  name: string;
  uri: string;
}

export interface CockpitSettings {
  revisions?: boolean;
  meta?: Record<string, unknown>;
  preview?: CockpitPreviewConfig[];
  images?: {
    logo?: CockpitAsset | null;
    small?: CockpitAsset | null;
    favicon?: CockpitAsset | null;
    [key: string]: CockpitAsset | null | undefined;
  };
  scripts?: {
    header?: string | null;
    footer?: string | null;
  };
  seo?: CockpitPageSeo;
  locales?: string[];
}

// ============================================================================
// Implementation
// ============================================================================

export interface RouteMethods {
  pagesRoutes<T = unknown>(locale?: string): Promise<T | null>;
  pagesSitemap<T = unknown>(): Promise<T | null>;
  pagesSetting<T = unknown>(locale?: string): Promise<T | null>;
  getFullRouteForSlug(slug: string): Promise<string | undefined>;
}

export function createRouteMethods(ctx: MethodContext, tenant?: string): RouteMethods {
  return {
    async pagesRoutes<T = unknown>(locale = "default"): Promise<T | null> {
      const url = ctx.url.build("/pages/routes", { locale });
      return ctx.http.fetch<T>(url);
    },

    async pagesSitemap<T = unknown>(): Promise<T | null> {
      const url = ctx.url.build("/pages/sitemap");
      return ctx.http.fetch<T>(url);
    },

    async pagesSetting<T = unknown>(locale = "default"): Promise<T | null> {
      const url = ctx.url.build("/pages/settings", { locale });
      return ctx.http.fetch<T>(url);
    },

    async getFullRouteForSlug(slug: string): Promise<string | undefined> {
      const routeSlugMap = await generateCollectionAndSingletonSlugRouteMap(
        ctx.endpoint,
        tenant,
        ctx.cache
      );
      return routeSlugMap[slug];
    },
  };
}
