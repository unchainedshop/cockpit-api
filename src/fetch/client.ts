/**
 * Lightweight fetch client for edge/RSC environments: no async init, no
 * caching (relies on platform caching), no response transformation.
 * Edge-safe: imports nothing but core/url.ts and core/errors.ts at runtime.
 */

import {
  createUrlBuilder,
  DEFAULT_TIMEOUT_MS,
  validatePathSegment,
} from "../core/url.ts";
import { CockpitHttpError, requestError } from "../core/errors.ts";
import type { CockpitPage } from "../methods/pages.ts";
import type {
  CockpitContentItem,
  CockpitListResponse,
} from "../methods/content.ts";

export type FetchCacheMode =
  | "default"
  | "force-cache"
  | "no-cache"
  | "no-store"
  | "only-if-cached"
  | "reload";

export interface FetchClientOptions {
  /** Cockpit endpoint URL, only its origin is used (env: COCKPIT_GRAPHQL_ENDPOINT) */
  endpoint?: string;
  /** Tenant (`/^[a-zA-Z0-9_-]+$/`): requests go to `/:<tenant>/api/...` */
  tenant?: string | null;
  /** Language sent as Cockpit's "default" locale (default: null, no mapping) */
  defaultLanguage?: string | null;
  /** fetch cache mode (default: "no-store") */
  cache?: FetchCacheMode;
  /** Extra request headers; like `apiKey`, they disable following redirects */
  headers?: Record<string, string>;
  /** Sent as `api-Key` header. Server-side only: never ship it to browsers */
  apiKey?: string;
  /** Request timeout in ms, `0` disables (default: 15000) */
  timeout?: number;
}

/**
 * Query parameters (same encoding as the main client). The library-controlled
 * `locale`, `populate` and `route` (`pageByRoute`) win over extra keys.
 */
export interface PageFetchParams {
  locale?: string | undefined;
  populate?: number | undefined;
  [key: string]: unknown;
}

export interface FetchClient {
  pageByRoute<T = CockpitPage>(
    route: string,
    params?: PageFetchParams,
  ): Promise<T | null>;
  pages<T = CockpitPage>(
    params?: PageFetchParams,
  ): Promise<CockpitListResponse<T> | null>;
  pageById<T = CockpitPage>(
    id: string,
    params?: PageFetchParams,
  ): Promise<T | null>;
  getContentItems<T = CockpitContentItem>(
    model: string,
    params?: PageFetchParams,
  ): Promise<CockpitListResponse<T> | null>;
  getContentItem<T = unknown>(
    model: string,
    id?: string,
    params?: PageFetchParams,
  ): Promise<T | null>;
  /**
   * JSON from a path below the API base (`/api` or `/:tenant/api`). `path`
   * starts with `/`; dot segments, `%`, `\`, `?`, `#`, `//` and control
   * characters are rejected. Pass query parameters via `params`.
   */
  fetchRaw<T = unknown>(path: string, params?: PageFetchParams): Promise<T>;
}

const toList = <T>(
  result: T[] | CockpitListResponse<T> | null,
): CockpitListResponse<T> | null =>
  Array.isArray(result) ? { data: result } : result;

/** Validated, encoded path segment */
function segment(value: string, name: string): string {
  validatePathSegment(value, name);
  return encodeURIComponent(value);
}

export function createFetchClient(
  options: FetchClientOptions = {},
): FetchClient {
  const {
    endpoint = typeof process === "undefined"
      ? undefined
      : process.env["COCKPIT_GRAPHQL_ENDPOINT"],
    tenant,
    defaultLanguage = null,
    cache = "no-store",
    apiKey,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  if (endpoint === undefined || endpoint === "") {
    throw new Error(
      "Cockpit: endpoint is required (provide via options or COCKPIT_GRAPHQL_ENDPOINT env var)",
    );
  }
  if (tenant) validatePathSegment(tenant, "tenant");

  const urls = createUrlBuilder({
    endpoint: new URL(new URL(endpoint).origin),
    defaultLanguage,
    ...(tenant ? { tenant } : {}),
  });
  const headers = {
    ...options.headers,
    ...(apiKey !== undefined && { "api-Key": apiKey }),
  };
  const init: RequestInit = { cache };
  if (Object.keys(headers).length > 0) {
    init.headers = headers;
    // Never let the runtime forward credentials to another origin
    init.redirect = "error";
  }

  async function request<T>(
    path: string,
    { locale, ...queryParams }: PageFetchParams = {},
  ): Promise<T> {
    const url = urls.build(path, {
      queryParams,
      ...(locale !== undefined && { locale }),
    });
    try {
      const response = await fetch(url, {
        ...init,
        ...(timeout > 0 && { signal: AbortSignal.timeout(timeout) }),
      });
      if (response.status === 404) return null as T;
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new CockpitHttpError(response.status, url, body);
      }
      return (await response.json()) as T;
    } catch (err) {
      throw requestError(
        err,
        url.pathname,
        timeout,
        init.headers !== undefined,
      );
    }
  }

  return {
    pageByRoute: async (route, { populate, ...params } = {}) =>
      request("/pages/page", { ...params, route, populate }),

    pages: async (params) => toList(await request("/pages/pages", params)),

    pageById: async (id, { populate, ...params } = {}) =>
      request(`/pages/page/${segment(id, "id")}`, { ...params, populate }),

    getContentItems: async (model, params) =>
      toList(
        await request(`/content/items/${segment(model, "model")}`, params),
      ),

    getContentItem: async <T>(
      model: string,
      id?: string,
      params?: PageFetchParams,
    ): Promise<T | null> => {
      const item = `/content/item/${segment(model, "model")}`;
      return request(
        id === undefined ? item : `${item}/${segment(id, "id")}`,
        params,
      );
    },

    fetchRaw: async (path, params) => request(path, params),
  };
}
