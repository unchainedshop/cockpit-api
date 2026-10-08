/**
 * Pages API methods
 */

import { normalizeLocale } from "../core/url.ts";
import type { CockpitAsset } from "./assets.ts";
import {
  toList,
  type CockpitListResponse,
  type ContentListQueryOptions,
} from "./content.ts";
import {
  get,
  legacyLocale,
  segment,
  withTyped,
  type MethodContext,
} from "./context.ts";

export interface PageByIdOptions {
  locale?: string;
  populate?: number;
}

export interface PageByRouteOptions {
  locale?: string;
  populate?: number;
  /** Not found in `locale`: look the route up in the default locale, then load that page in `locale` */
  fallbackToDefault?: boolean;
}

export type CockpitPageType = "layout" | "collection" | "singleton" | "link";

export interface CockpitPageMeta {
  _id: string;
  title: string;
  type: CockpitPageType;
  slug?: string;
  _r?: string;
  _created?: number;
  _modified?: number;
}

export interface CockpitPageSeo {
  title?: string;
  description?: string;
  keywords?: string;
  image?: CockpitAsset;
  noindex?: boolean;
  nofollow?: boolean;
}

export interface CockpitLayoutBlock {
  component: string;
  label?: string;
  settings?: Record<string, unknown>;
  children?: CockpitLayoutBlock[];
}

export interface CockpitPage extends CockpitPageMeta {
  data?: Record<string, unknown>;
  seo?: CockpitPageSeo;
  layout?: CockpitLayoutBlock[];
  _p?: string;
  /** Parent page id (`null`/absent for root pages) */
  _pid?: string | null;
  /** Sort order among siblings */
  _o?: number;
  /** Publish state (1 = published) */
  _state?: number;
  /**
   * Locale the page was resolved in (single-page endpoints only). Cockpit
   * falls back to "default" for a locale that isn't configured.
   */
  _locale?: string;
  /** Route per locale, e.g. `{ default: "/about", en: "/en/about" }` (single-page endpoints only) */
  _routes?: Record<string, string>;
  /** Ancestor pages, root first (single-page endpoints only) */
  _parents?: CockpitPage[];
}

export interface PagesMethods {
  /** Pages list (Cockpit sends no `meta.total` for pages) */
  pages<T = CockpitPage>(
    options?: ContentListQueryOptions,
  ): Promise<CockpitListResponse<T> | null>;
  pageById<T = CockpitPage>(
    id: string,
    options?: PageByIdOptions,
  ): Promise<T | null>;
  pageByRoute<T = CockpitPage>(
    route: string,
    options?: PageByRouteOptions,
  ): Promise<T | null>;
}

export function createPagesMethods(ctx: MethodContext): PagesMethods {
  const pageById = async <T>(
    id: string,
    { locale, populate }: PageByIdOptions = {},
  ): Promise<T | null> =>
    get<T>(ctx, `/pages/page/${segment(id, "page id")}`, {
      locale,
      query: { populate },
    });

  return {
    async pages<T = CockpitPage>(
      options: ContentListQueryOptions = {},
    ): Promise<CockpitListResponse<T> | null> {
      const { locale, useAdminAccess, queryParams, ...query } = options;
      return get(
        ctx,
        "/pages/pages",
        { locale, useAdminAccess, query: withTyped(queryParams, query) },
        toList<T>,
      );
    },

    pageById,

    async pageByRoute<T = CockpitPage>(
      route: string,
      options: PageByRouteOptions = {},
    ): Promise<T | null> {
      const {
        locale,
        populate = 0,
        fallbackToDefault = false,
      } = legacyLocale(options, "pageByRoute(route, locale)");
      const query = { route, populate };
      const page = await get<T>(ctx, "/pages/page", { locale, query });
      // The locale actually sent: the `defaultLanguage` already is "default"
      if (
        page !== null ||
        !fallbackToDefault ||
        normalizeLocale(locale, ctx.config.defaultLanguage) === "default"
      ) {
        return page;
      }
      const fallback = await get<{ _id?: unknown }>(ctx, "/pages/page", {
        query,
        links: false,
      });
      const id = fallback?._id;
      return typeof id === "string" && id !== ""
        ? pageById<T>(id, { ...(locale !== undefined && { locale }), populate })
        : null;
    },
  };
}
