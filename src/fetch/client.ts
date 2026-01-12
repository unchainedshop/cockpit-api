/**
 * Lightweight fetch client for Cockpit CMS
 *
 * Designed for edge/RSC environments where the full CockpitAPI
 * factory is too heavy. This client:
 * - Has no async initialization
 * - No caching (relies on platform caching)
 * - No response transformation
 * - Minimal memory footprint
 */

import { createLocaleNormalizer } from "../core/locale.ts";
import type { CockpitPage } from "../methods/pages.ts";
import type { CockpitContentItem } from "../methods/content.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Request cache mode for fetch requests
 */
export type FetchCacheMode =
  | "default"
  | "force-cache"
  | "no-cache"
  | "no-store"
  | "only-if-cached"
  | "reload";

/**
 * Options for creating a lightweight fetch client
 */
export interface FetchClientOptions {
  /** Cockpit CMS endpoint URL */
  endpoint?: string;
  /** Tenant ID for multi-tenant setups */
  tenant?: string | null;
  /**
   * Default language that maps to Cockpit's "default" locale.
   * When a request uses this language, it will be sent as "default" to Cockpit.
   * @default "de"
   */
  defaultLanguage?: string;
  /** Request cache mode (default: "no-store") */
  cache?: FetchCacheMode;
  /** Additional request headers */
  headers?: Record<string, string>;
  /** API key for authenticated requests */
  apiKey?: string;
}

/**
 * Query parameters for page/content requests
 */
export interface PageFetchParams {
  /** Locale for the request (the configured defaultLanguage maps to "default") */
  locale?: string;
  /** Populate depth for linked content */
  populate?: number;
  /** Additional query parameters */
  [key: string]: string | number | boolean | undefined;
}

/**
 * Lightweight fetch client interface
 */
export interface FetchClient {
  /** Fetch a page by route */
  pageByRoute<T = CockpitPage>(
    route: string,
    params?: PageFetchParams,
  ): Promise<T | null>;
  /** Fetch pages list */
  pages<T = CockpitPage>(params?: PageFetchParams): Promise<T[] | null>;
  /** Fetch a page by ID */
  pageById<T = CockpitPage>(
    id: string,
    params?: PageFetchParams,
  ): Promise<T | null>;
  /** Fetch content items */
  getContentItems<T = CockpitContentItem>(
    model: string,
    params?: PageFetchParams,
  ): Promise<T[] | null>;
  /** Fetch a single content item */
  getContentItem<T = unknown>(
    model: string,
    id?: string,
    params?: PageFetchParams,
  ): Promise<T | null>;
  /** Raw fetch for custom paths */
  fetchRaw<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Build the API base URL for the given endpoint and tenant
 */
function buildApiBaseUrl(endpoint: string, tenant?: string | null): string {
  const url = new URL(endpoint);
  const basePath =
    tenant !== undefined && tenant !== null ? `/:${tenant}/api` : "/api";
  return `${url.origin}${basePath}`;
}

/**
 * Build query string from params object, filtering undefined values
 */
function buildQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const filtered: [string, string][] = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, String(value)]);
  return new URLSearchParams(filtered).toString();
}

/**
 * Creates a lightweight fetch client for Cockpit CMS
 *
 * @example
 * ```typescript
 * import { createFetchClient } from "@unchainedshop/cockpit-api/fetch";
 *
 * const cockpit = createFetchClient({
 *   endpoint: process.env.NEXT_PUBLIC_COCKPIT_ENDPOINT,
 *   tenant: "mytenant",
 * });
 *
 * // Fetch a page by route
 * const page = await cockpit.pageByRoute("/about", { locale: "en" });
 *
 * // Fetch content items
 * const items = await cockpit.getContentItems("news", { locale: "de", limit: 10 });
 * ```
 */
export function createFetchClient(
  options: FetchClientOptions = {},
): FetchClient {
  const {
    endpoint = process.env["COCKPIT_GRAPHQL_ENDPOINT"] ??
      process.env["NEXT_PUBLIC_COCKPIT_ENDPOINT"],
    tenant = null,
    defaultLanguage = "de",
    cache = "no-store",
    headers = {},
    apiKey,
  } = options;

  if (endpoint === undefined || endpoint === "") {
    throw new Error(
      "Cockpit: endpoint is required (provide via options or COCKPIT_GRAPHQL_ENDPOINT env var)",
    );
  }

  const baseUrl = buildApiBaseUrl(endpoint, tenant);
  const normalizeLocale = createLocaleNormalizer(defaultLanguage);

  const requestHeaders: Record<string, string> = { ...headers };
  if (apiKey !== undefined) {
    requestHeaders["api-Key"] = apiKey;
  }

  /**
   * Fetch raw JSON from a Cockpit API path
   */
  async function fetchRaw<T = unknown>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    const queryString = buildQueryString(params);
    const url = queryString
      ? `${baseUrl}${path}?${queryString}`
      : `${baseUrl}${path}`;

    const fetchInit: RequestInit = { cache };
    if (Object.keys(requestHeaders).length > 0) {
      fetchInit.headers = requestHeaders;
    }
    const response = await fetch(url, fetchInit);

    if (!response.ok) {
      if (response.status === 404) {
        return null as T;
      }
      throw new Error(
        `Cockpit: Error fetching ${url} (${String(response.status)})`,
      );
    }

    return response.json() as Promise<T>;
  }

  return {
    /**
     * Fetch a page by route
     */
    async pageByRoute<T = CockpitPage>(
      route: string,
      params: PageFetchParams = {},
    ): Promise<T | null> {
      const { locale, populate, ...rest } = params;
      return fetchRaw<T>("/pages/page", {
        route,
        locale: normalizeLocale(locale),
        populate,
        ...rest,
      });
    },

    /**
     * Fetch pages list
     */
    async pages<T = CockpitPage>(
      params: PageFetchParams = {},
    ): Promise<T[] | null> {
      const { locale, ...rest } = params;
      return fetchRaw<T[]>("/pages/pages", {
        locale: normalizeLocale(locale),
        ...rest,
      });
    },

    /**
     * Fetch a page by ID
     */
    async pageById<T = CockpitPage>(
      id: string,
      params: PageFetchParams = {},
    ): Promise<T | null> {
      const { locale, populate, ...rest } = params;
      return fetchRaw<T>(`/pages/page/${id}`, {
        locale: normalizeLocale(locale),
        populate,
        ...rest,
      });
    },

    /**
     * Fetch content items
     */
    async getContentItems<T = CockpitContentItem>(
      model: string,
      params: PageFetchParams = {},
    ): Promise<T[] | null> {
      const { locale, ...rest } = params;
      return fetchRaw<T[]>(`/content/items/${model}`, {
        locale: normalizeLocale(locale),
        ...rest,
      });
    },

    /**
     * Fetch a single content item
     */
    async getContentItem<T = unknown>(
      model: string,
      id?: string,
      params: PageFetchParams = {},
    ): Promise<T | null> {
      const { locale, ...rest } = params;
      const path =
        id !== undefined
          ? `/content/item/${model}/${id}`
          : `/content/item/${model}`;
      return fetchRaw<T>(path, {
        locale: normalizeLocale(locale),
        ...rest,
      });
    },

    /**
     * Raw fetch for custom paths
     */
    fetchRaw: fetchRaw,
  };
}
