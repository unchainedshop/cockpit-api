/**
 * Pages API methods
 */

import type {
  MethodContext,
  ContentListQueryOptions,
  CockpitListResponse,
} from "./content.ts";
import type { CockpitAsset } from "./assets.ts";
import { requireParam } from "../core/validation.ts";

export interface PageByIdOptions {
  locale?: string;
  populate?: number;
}

export interface PageByRouteOptions {
  locale?: string;
  populate?: number;
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
}

export interface PagesMethods {
  /**
   * Get pages list.
   *
   * @returns Always returns `CockpitListResponse<T>` with data and optional meta.
   * Returns `null` if pages cannot be fetched.
   *
   * @example
   * const response = await cockpit.pages({ limit: 10, skip: 0 });
   * // response: { data: CockpitPage[], meta?: { total: number } } | null
   * const pages = response?.data || [];
   * const total = response?.meta?.total;
   */
  pages<T = CockpitPage>(
    options?: ContentListQueryOptions,
  ): Promise<CockpitListResponse<T> | null>;
  pageById<T = CockpitPage>(
    id: string,
    options?: PageByIdOptions,
  ): Promise<T | null>;
  pageByRoute<T = CockpitPage>(
    route: string,
    options?: PageByRouteOptions | string,
  ): Promise<T | null>;
}

export function createPagesMethods(ctx: MethodContext): PagesMethods {
  return {
    async pages<T = CockpitPage>(
      options: ContentListQueryOptions = {},
    ): Promise<CockpitListResponse<T> | null> {
      const {
        locale = "default",
        limit,
        skip,
        sort,
        filter,
        fields,
        queryParams = {},
      } = options;
      const url = ctx.url.build("/pages/pages", {
        locale,
        queryParams: { ...queryParams, limit, skip, sort, filter, fields },
      });
      const result = await ctx.http.fetch<T[] | CockpitListResponse<T>>(url);

      // Normalize response to always return { data, meta? }
      // Note: The Cockpit /api/pages/pages endpoint returns a raw array even when skip
      // is provided, unlike /api/content/items/{model} which returns { data, meta }.
      // This means meta.total will not be available for pages() method.
      if (result === null) {
        return null;
      }
      if (Array.isArray(result)) {
        return { data: result };
      }
      return result;
    },

    async pageById<T = CockpitPage>(
      id: string,
      options: PageByIdOptions = {},
    ): Promise<T | null> {
      requireParam(id, "a page id");
      const { locale = "default", populate } = options;
      const url = ctx.url.build(`/pages/page/${id}`, {
        locale,
        queryParams: { populate },
      });
      return ctx.http.fetch<T>(url);
    },

    async pageByRoute<T = CockpitPage>(
      route: string,
      options: PageByRouteOptions | string = "default",
    ): Promise<T | null> {
      const opts = typeof options === "string" ? { locale: options } : options;
      const { locale = "default", populate, fallbackToDefault = false } = opts;

      // Force populate: 0 to prevent route string issues
      const queryOptions = { populate: populate ?? 0 };

      const url = ctx.url.build("/pages/page", {
        locale,
        queryParams: { route, ...queryOptions },
      });

      const result = await ctx.http.fetch<T>(url);

      // If found, return it
      if (result) return result;

      // If not found and fallback enabled and not in default locale
      if (fallbackToDefault && locale !== "default") {
        // Try to find in default locale
        const defaultUrl = ctx.url.build("/pages/page", {
          locale: "default",
          queryParams: { route, ...queryOptions },
        });
        const defaultResult = await ctx.http.fetch<T & { _id?: string }>(
          defaultUrl,
        );

        // If found in default, get by ID in target locale
        if (defaultResult?._id != null && defaultResult._id !== "") {
          return this.pageById<T>(defaultResult._id, {
            locale,
            populate: queryOptions.populate,
          });
        }
      }

      return null;
    },
  };
}
