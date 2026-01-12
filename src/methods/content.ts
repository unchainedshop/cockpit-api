/**
 * Content API methods
 */

import type { HttpClient } from "../core/http.ts";
import type { UrlBuilder } from "../core/url-builder.ts";
import type { CacheManager } from "../core/cache.ts";

// ============================================================================
// Types
// ============================================================================

export interface MethodContext {
  readonly http: HttpClient;
  readonly url: UrlBuilder;
  readonly cache: CacheManager;
  readonly endpoint: string;
}

export interface ListQueryOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  filter?: Record<string, unknown>;
  fields?: Record<string, 0 | 1>;
  locale?: string;
  populate?: number;
}

export interface ContentItemQueryOptions extends ListQueryOptions {
  model: string;
  id?: string;
  queryParams?: Record<string, unknown>;
}

export interface ContentListQueryOptions extends ListQueryOptions {
  queryParams?: Record<string, unknown>;
}

export interface TreeQueryOptions extends ListQueryOptions {
  parent?: string;
  queryParams?: Record<string, unknown>;
}

export interface AggregateQueryOptions {
  model: string;
  pipeline: Record<string, unknown>[];
  locale?: string;
}

export interface CockpitContentItem {
  _id: string;
  _created?: number;
  _modified?: number;
  _cby?: string;
  _mby?: string;
  _state?: number;
  [key: string]: unknown;
}

export interface CockpitNewsItem extends CockpitContentItem {
  title: string;
  cover?: { _id: string; path: string; title: string };
  author?: string;
  publicationDate?: string;
  content?: string;
}

export interface CockpitTreeNode<T = CockpitContentItem> {
  _id: string;
  _pid?: string;
  _o?: number;
  children?: CockpitTreeNode<T>[];
  data?: T;
}

// ============================================================================
// Implementation
// ============================================================================

const requireParam = (value: unknown, name: string): void => {
  if (!value) throw new Error(`Cockpit: Please provide ${name}`);
};

export interface ContentMethods {
  getContentItem<T = unknown>(options: ContentItemQueryOptions): Promise<T | null>;
  getContentItems<T = unknown>(model: string, options?: ContentListQueryOptions): Promise<T | null>;
  getContentTree<T = unknown>(model: string, options?: TreeQueryOptions): Promise<T | null>;
  getAggregateModel<T = unknown>(options: AggregateQueryOptions): Promise<T | null>;
  getSingleton<T = unknown>(model: string, options?: { locale?: string; populate?: number }): Promise<T | null>;
  postContentItem<T = unknown>(model: string, item: Record<string, unknown>): Promise<T | null>;
  deleteContentItem<T = unknown>(model: string, id: string): Promise<T | null>;
}

export function createContentMethods(ctx: MethodContext): ContentMethods {
  return {
    async getContentItem<T = unknown>(options: ContentItemQueryOptions): Promise<T | null> {
      const { model, id, locale = "default", queryParams = {} } = options;
      requireParam(model, "a model");
      const url = ctx.url.build(`/content/item/${model}${id ? `/${id}` : ""}`, { locale, queryParams });
      return ctx.http.fetch<T>(url);
    },

    async getContentItems<T = unknown>(model: string, options: ContentListQueryOptions = {}): Promise<T | null> {
      requireParam(model, "a model");
      const { locale = "default", limit, skip, sort, filter, fields, populate, queryParams = {} } = options;
      const url = ctx.url.build(`/content/items/${model}`, {
        locale,
        queryParams: { ...queryParams, limit, skip, sort, filter, fields, populate },
      });
      return ctx.http.fetch<T>(url);
    },

    async getContentTree<T = unknown>(model: string, options: TreeQueryOptions = {}): Promise<T | null> {
      requireParam(model, "a model");
      const { locale = "default", parent, filter, fields, populate, queryParams = {} } = options;
      const url = ctx.url.build(`/content/tree/${model}`, {
        locale,
        queryParams: { ...queryParams, parent, filter: filter ?? {}, fields, populate },
      });
      return ctx.http.fetch<T>(url);
    },

    async getAggregateModel<T = unknown>(options: AggregateQueryOptions): Promise<T | null> {
      const { model, pipeline, locale = "default" } = options;
      requireParam(model, "a model");
      const url = ctx.url.build(`/content/aggregate/${model}`, { locale, queryParams: { pipeline } });
      return ctx.http.fetch<T>(url);
    },

    async getSingleton<T = unknown>(model: string, options: { locale?: string; populate?: number } = {}): Promise<T | null> {
      requireParam(model, "a model");
      const { locale = "default", populate } = options;
      const url = ctx.url.build(`/content/item/${model}`, { locale, queryParams: { populate } });
      return ctx.http.fetch<T>(url);
    },

    async postContentItem<T = unknown>(model: string, item: Record<string, unknown>): Promise<T | null> {
      requireParam(model, "a model");
      const url = ctx.url.build(`/content/item/${model}`);
      return ctx.http.post<T>(url, { data: item });
    },

    async deleteContentItem<T = unknown>(model: string, id: string): Promise<T | null> {
      requireParam(model, "a model");
      requireParam(id, "a model and id");
      const url = ctx.url.build(`/content/item/${model}/${id}`);
      return ctx.http.delete<T>(url);
    },
  };
}
