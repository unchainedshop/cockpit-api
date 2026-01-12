/**
 * Content API methods
 */

import type { HttpClient } from "../core/http.ts";
import type { UrlBuilder } from "../core/url-builder.ts";
import type { CacheManager } from "../core/cache.ts";
import { requireParam, validatePathSegment } from "../core/validation.ts";

export interface MethodContext {
  readonly http: HttpClient;
  readonly url: UrlBuilder;
  readonly cache: CacheManager;
  readonly endpoint: string;
  readonly tenant?: string;
}

export interface ListQueryOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  filter?: Record<string, unknown>;
  fields?: Record<string, 0 | 1>;
  locale?: string;
  populate?: number;
  /** Override the client-level useAdminAccess setting for this request */
  useAdminAccess?: boolean;
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

export interface ContentMethods {
  getContentItem<T = unknown>(
    options: ContentItemQueryOptions,
  ): Promise<T | null>;
  getContentItems<T = CockpitContentItem>(
    model: string,
    options?: ContentListQueryOptions,
  ): Promise<T[] | null>;
  getContentTree<T = CockpitContentItem>(
    model: string,
    options?: TreeQueryOptions,
  ): Promise<CockpitTreeNode<T>[] | null>;
  getAggregateModel<T = unknown>(
    options: AggregateQueryOptions,
  ): Promise<T[] | null>;
  postContentItem<T = unknown>(
    model: string,
    item: Record<string, unknown>,
  ): Promise<T | null>;
  deleteContentItem<T = unknown>(model: string, id: string): Promise<T | null>;
}

export function createContentMethods(ctx: MethodContext): ContentMethods {
  const buildFetchOptions = (
    useAdminAccess?: boolean,
  ): { useAdminAccess: boolean } | Record<string, never> =>
    useAdminAccess !== undefined ? { useAdminAccess } : {};

  return {
    async getContentItem<T = unknown>(
      options: ContentItemQueryOptions,
    ): Promise<T | null> {
      const {
        model,
        id,
        locale = "default",
        useAdminAccess,
        queryParams = {},
      } = options;
      requireParam(model, "a model");
      validatePathSegment(model, "model");
      if (id !== undefined) validatePathSegment(id, "id");
      const url = ctx.url.build(
        `/content/item/${model}${id !== undefined ? `/${id}` : ""}`,
        {
          locale,
          queryParams,
        },
      );
      return ctx.http.fetch<T>(url, buildFetchOptions(useAdminAccess));
    },

    async getContentItems<T = CockpitContentItem>(
      model: string,
      options: ContentListQueryOptions = {},
    ): Promise<T[] | null> {
      requireParam(model, "a model");
      validatePathSegment(model, "model");
      const {
        locale = "default",
        limit,
        skip,
        sort,
        filter,
        fields,
        populate,
        useAdminAccess,
        queryParams = {},
      } = options;
      const url = ctx.url.build(`/content/items/${model}`, {
        locale,
        queryParams: {
          ...queryParams,
          limit,
          skip,
          sort,
          filter,
          fields,
          populate,
        },
      });
      return ctx.http.fetch<T[]>(url, buildFetchOptions(useAdminAccess));
    },

    async getContentTree<T = CockpitContentItem>(
      model: string,
      options: TreeQueryOptions = {},
    ): Promise<CockpitTreeNode<T>[] | null> {
      requireParam(model, "a model");
      validatePathSegment(model, "model");
      const {
        locale = "default",
        parent,
        filter,
        fields,
        populate,
        useAdminAccess,
        queryParams = {},
      } = options;
      const url = ctx.url.build(`/content/tree/${model}`, {
        locale,
        queryParams: {
          ...queryParams,
          parent,
          filter: filter ?? {},
          fields,
          populate,
        },
      });
      return ctx.http.fetch<CockpitTreeNode<T>[]>(
        url,
        buildFetchOptions(useAdminAccess),
      );
    },

    async getAggregateModel<T = unknown>(
      options: AggregateQueryOptions,
    ): Promise<T[] | null> {
      const { model, pipeline, locale = "default" } = options;
      requireParam(model, "a model");
      validatePathSegment(model, "model");
      const url = ctx.url.build(`/content/aggregate/${model}`, {
        locale,
        queryParams: { pipeline },
      });
      return ctx.http.fetch<T[]>(url);
    },

    async postContentItem<T = unknown>(
      model: string,
      item: Record<string, unknown>,
    ): Promise<T | null> {
      requireParam(model, "a model");
      validatePathSegment(model, "model");
      const url = ctx.url.build(`/content/item/${model}`);
      return ctx.http.post<T>(url, { data: item });
    },

    async deleteContentItem<T = unknown>(
      model: string,
      id: string,
    ): Promise<T | null> {
      requireParam(model, "a model");
      requireParam(id, "an id");
      validatePathSegment(model, "model");
      validatePathSegment(id, "id");
      const url = ctx.url.build(`/content/item/${model}/${id}`);
      return ctx.http.delete<T>(url);
    },
  };
}
