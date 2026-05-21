/**
 * Pages API methods
 */

import type {
  MethodContext,
  ContentListQueryOptions,
  CockpitListResponse,
} from "./content.ts";
import { normalizeListResponse } from "./content.ts";
import type { CockpitAsset } from "./assets.ts";
import { requireParam } from "../core/validation.ts";
import { hashOpts } from "../core/cache.ts";

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
      const key = `pages:list:${locale}:${hashOpts({ limit, skip, sort, filter, fields, queryParams })}`;
      return ctx.cache.swr<CockpitListResponse<T>>(key, async () =>
        normalizeListResponse<T>(
          await ctx.http.fetch<T[] | CockpitListResponse<T>>(url),
        ),
      );
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
      const key = `pages:id:${locale}:${id}:${String(populate ?? 0)}`;
      return ctx.cache.swr<T>(key, () => ctx.http.fetch<T>(url));
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

      const key = `pages:route:${locale}:${route}:${String(queryOptions.populate)}`;
      const result = await ctx.cache.swr<T>(key, () => ctx.http.fetch<T>(url));

      if (result) return result;

      if (fallbackToDefault && locale !== "default") {
        const defaultUrl = ctx.url.build("/pages/page", {
          locale: "default",
          queryParams: { route, ...queryOptions },
        });
        const defaultKey = `pages:route:default:${route}:${String(queryOptions.populate)}`;
        const defaultResult = await ctx.cache.swr<T & { _id?: string }>(
          defaultKey,
          () => ctx.http.fetch<T & { _id?: string }>(defaultUrl),
        );

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
