/**
 * Pages API methods
 */

import type { MethodContext, ContentListQueryOptions } from "./content.ts";
import type { CockpitAsset } from "./assets.ts";
import { requireParam } from "../core/validation.ts";

// ============================================================================
// Types
// ============================================================================

export interface PageByIdOptions {
  locale?: string;
  populate?: number;
}

export interface PageByRouteOptions {
  locale?: string;
  populate?: number;
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

// ============================================================================
// Implementation
// ============================================================================

export interface PagesMethods {
  pages<T = CockpitPage>(
    options?: ContentListQueryOptions,
  ): Promise<T[] | null>;
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
    ): Promise<T[] | null> {
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
      return ctx.http.fetch<T[]>(url);
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
      const { locale = "default", populate } = opts;
      const url = ctx.url.build("/pages/page", {
        locale,
        queryParams: { route, populate },
      });
      return ctx.http.fetch<T>(url);
    },
  };
}
