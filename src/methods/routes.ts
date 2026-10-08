/**
 * Routes, sitemap and settings API methods
 */

import { normalizeLocale } from "../core/url.ts";
import type { CockpitAsset } from "./assets.ts";
import { get, type MethodContext } from "./context.ts";
import type { CockpitPageSeo, CockpitPageType } from "./pages.ts";

export interface CockpitRoute {
  route: string;
  slug: string;
  type: CockpitPageType;
  lastmod: string;
}

/** Routes keyed by Cockpit locale (`"default"` for the default language) */
export type CockpitRoutesResponse = Record<string, CockpitRoute[]>;

export interface CockpitSitemapEntry {
  /** Route per Cockpit locale, e.g. `{ default: "/", en: "/en" }` */
  routes: Record<string, string>;
  type: CockpitPageType;
  lastmod: string;
  /** Locales excluded from indexing (Cockpit sends `[]` when none) */
  noindex?: string[] | Record<string, unknown>;
  /** Locales whose links must not be followed (Cockpit sends `[]` when none) */
  nofollow?: string[] | Record<string, unknown>;
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
    [key: string]: CockpitAsset | null;
  };
  scripts?: {
    header?: string | null;
    footer?: string | null;
  };
  seo?: CockpitPageSeo;
  locales?: string[];
}

export interface RouteMethods {
  /**
   * Page routes keyed by Cockpit locale. Cockpit answers a configured locale
   * with a bare array, keyed here by the locale sent (the `defaultLanguage`
   * as "default"); other locales get an object keyed by locale.
   */
  pagesRoutes<T = CockpitRoutesResponse>(locale?: string): Promise<T | null>;
  /** Sitemap entries for all locales */
  pagesSitemap<T = CockpitSitemapEntry>(): Promise<T[] | null>;
  pagesSetting<T = CockpitSettings>(locale?: string): Promise<T | null>;
  /**
   * Route of the page bound to a collection or singleton model (its
   * `data.collection` / `data.singleton`), e.g. `"/blog"` for `"posts"`,
   * from the locale's cached route map (see `clearRouteCache()`).
   */
  getRouteForCollection(
    name: string,
    locale?: string,
  ): Promise<string | undefined>;
}

export function createRouteMethods(ctx: MethodContext): RouteMethods {
  const sentLocale = (locale?: string): string =>
    normalizeLocale(locale, ctx.config.defaultLanguage);

  return {
    async pagesRoutes<T = CockpitRoutesResponse>(
      locale?: string,
    ): Promise<T | null> {
      return get(
        ctx,
        "/pages/routes",
        { locale },
        (routes) =>
          (Array.isArray(routes)
            ? { [sentLocale(locale)]: routes }
            : routes) as T,
      );
    },

    async pagesSitemap<T = CockpitSitemapEntry>(): Promise<T[] | null> {
      return get<T[]>(ctx, "/pages/sitemap");
    },

    async pagesSetting<T = CockpitSettings>(
      locale?: string,
    ): Promise<T | null> {
      return get<T>(ctx, "/pages/settings", { locale });
    },

    getRouteForCollection: (name, locale) =>
      ctx.links.routeForCollection(name, sentLocale(locale)),
  };
}
