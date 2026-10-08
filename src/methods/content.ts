/**
 * Content API methods
 */

import { logger } from "../cockpit-logger.ts";
import { get, segment, withTyped, type MethodContext } from "./context.ts";

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

export interface ContentItemQueryOptions {
  model: string;
  /** Omit for singletons */
  id?: string;
  locale?: string;
  fields?: Record<string, 0 | 1>;
  populate?: number;
  queryParams?: Record<string, unknown>;
  /** Override the client-level useAdminAccess setting for this request */
  useAdminAccess?: boolean;
}

export interface ContentListQueryOptions extends ListQueryOptions {
  queryParams?: Record<string, unknown>;
}

export interface UnchainedContentListQueryOptions extends ContentListQueryOptions {
  /** Include unpublished items (needs content/{model}/read permission) */
  includeUnpublished?: boolean;
}

export interface TreeQueryOptions {
  parent?: string;
  filter?: Record<string, unknown>;
  fields?: Record<string, 0 | 1>;
  populate?: number;
  locale?: string;
  queryParams?: Record<string, unknown>;
  /** Override the client-level useAdminAccess setting for this request */
  useAdminAccess?: boolean;
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

/** Metadata of paginated list responses */
export interface CockpitListMeta {
  total?: number;
  [key: string]: unknown;
}

/** List response; `meta` is present when Cockpit paginates (`skip`) */
export interface CockpitListResponse<T> {
  data: T[];
  meta?: CockpitListMeta;
}

/** Bare arrays become `{ data }` */
export const toList = <T>(raw: unknown): CockpitListResponse<T> =>
  Array.isArray(raw) ? { data: raw as T[] } : (raw as CockpitListResponse<T>);

export interface ContentMethods {
  getContentItem<T = unknown>(
    options: ContentItemQueryOptions,
  ): Promise<T | null>;
  /** Items of a collection; `null` if it doesn't exist */
  getContentItems<T = CockpitContentItem>(
    model: string,
    options?: ContentListQueryOptions,
  ): Promise<CockpitListResponse<T> | null>;
  /**
   * Items including unpublished ones (Unchained module, always admin access).
   * For editorial read-modify-write: never cached, page links never resolved
   * (so writing an item back never persists resolved routes).
   */
  getUnchainedContentItems<T = CockpitContentItem>(
    model: string,
    options?: UnchainedContentListQueryOptions,
  ): Promise<CockpitListResponse<T> | null>;
  getContentTree<T = CockpitContentItem>(
    model: string,
    options?: TreeQueryOptions,
  ): Promise<CockpitTreeNode<T>[] | null>;
  getAggregateModel<T = unknown>(
    options: AggregateQueryOptions,
  ): Promise<T[] | null>;
  /**
   * Creates or updates an item; on success this client's cached reads of
   * `model` are cleared. Page links in the response are never resolved.
   */
  postContentItem<T = unknown>(
    model: string,
    item: Record<string, unknown>,
  ): Promise<T | null>;
  /** Deletes an item; clears cached reads of `model` like `postContentItem` */
  deleteContentItem<T = unknown>(model: string, id: string): Promise<T | null>;
}

/** Cache key prefixes of a model's reads (see `cacheKey`) */
export const contentCachePrefixes = (model: string): string[] => [
  `/content/items/${model}|`,
  `/content/item/${model}|`,
  `/content/item/${model}/`,
  `/content/tree/${model}|`,
  `/content/aggregate/${model}|`,
];

export function createContentMethods(ctx: MethodContext): ContentMethods {
  // A failing cache store must not turn a successful write into an error
  const invalidate = async (model: string): Promise<void> => {
    try {
      await Promise.all(
        contentCachePrefixes(model).map((prefix) => ctx.cache.clear(prefix)),
      );
    } catch (error) {
      logger.warn(`Cockpit: Failed to clear cached "${model}" reads`, error);
    }
  };

  return {
    async getContentItem<T = unknown>({
      model,
      id,
      locale,
      fields,
      populate,
      useAdminAccess,
      queryParams,
    }: ContentItemQueryOptions): Promise<T | null> {
      const path = `/content/item/${segment(model, "model")}`;
      return get<T>(
        ctx,
        id === undefined ? path : `${path}/${segment(id, "id")}`,
        {
          locale,
          useAdminAccess,
          query: withTyped(queryParams, { fields, populate }),
        },
      );
    },

    async getContentItems<T = CockpitContentItem>(
      model: string,
      options: ContentListQueryOptions = {},
    ): Promise<CockpitListResponse<T> | null> {
      const { locale, useAdminAccess, queryParams, ...query } = options;
      return get(
        ctx,
        `/content/items/${segment(model, "model")}`,
        { locale, useAdminAccess, query: withTyped(queryParams, query) },
        toList<T>,
      );
    },

    async getUnchainedContentItems<T = CockpitContentItem>(
      model: string,
      options: UnchainedContentListQueryOptions = {},
    ): Promise<CockpitListResponse<T> | null> {
      const { locale, includeUnpublished, queryParams, ...query } = options;
      delete query.useAdminAccess;
      return get(
        ctx,
        `/unchained/content/items/${segment(model, "model")}`,
        {
          locale,
          useAdminAccess: true,
          cache: false,
          links: false,
          query: withTyped(queryParams, { ...query, includeUnpublished }),
        },
        toList<T>,
      );
    },

    async getContentTree<T = CockpitContentItem>(
      model: string,
      options: TreeQueryOptions = {},
    ): Promise<CockpitTreeNode<T>[] | null> {
      const { locale, useAdminAccess, queryParams, filter, ...query } = options;
      return get<CockpitTreeNode<T>[]>(
        ctx,
        `/content/tree/${segment(model, "model")}`,
        {
          locale,
          useAdminAccess,
          query: {
            filter: {},
            ...withTyped(queryParams, { ...query, filter }),
          },
        },
      );
    },

    async getAggregateModel<T = unknown>({
      model,
      pipeline,
      locale,
    }: AggregateQueryOptions): Promise<T[] | null> {
      return get<T[]>(ctx, `/content/aggregate/${segment(model, "model")}`, {
        locale,
        query: { pipeline },
      });
    },

    async postContentItem<T = unknown>(
      model: string,
      item: Record<string, unknown>,
    ): Promise<T | null> {
      const url = ctx.url.build(`/content/item/${segment(model, "model")}`);
      const result = await ctx.http.post<T>(url, { data: item });
      await invalidate(model);
      return result;
    },

    async deleteContentItem<T = unknown>(
      model: string,
      id: string,
    ): Promise<T | null> {
      const url = ctx.url.build(
        `/content/item/${segment(model, "model")}/${segment(id, "id")}`,
      );
      const result = await ctx.http.delete<T>(url);
      await invalidate(model);
      return result;
    },
  };
}
