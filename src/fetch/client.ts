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

import type { FetchClientOptions, PageFetchParams } from "./types.ts";

/**
 * Normalize locale to Cockpit format ("de" -> "default")
 */
function normalizeLocale(locale?: string): string {
  if (!locale || locale === "de") return "default";
  return locale;
}

/**
 * Build the API base URL for the given endpoint and tenant
 */
function buildApiBaseUrl(endpoint: string, tenant?: string | null): string {
  const url = new URL(endpoint);
  const basePath = tenant ? `/:${tenant}/api` : "/api";
  return `${url.origin}${basePath}`;
}

/**
 * Build query string from params object, filtering undefined values
 */
function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
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
export function createFetchClient(options: FetchClientOptions = {}) {
  const {
    endpoint = process.env.COCKPIT_GRAPHQL_ENDPOINT ?? process.env.NEXT_PUBLIC_COCKPIT_ENDPOINT,
    tenant = null,
    cache = "no-store",
    headers = {},
    apiKey,
  } = options;

  if (!endpoint) {
    throw new Error(
      "Cockpit: endpoint is required (provide via options or COCKPIT_GRAPHQL_ENDPOINT env var)"
    );
  }

  const baseUrl = buildApiBaseUrl(endpoint, tenant);

  const requestHeaders: Record<string, string> = { ...headers };
  if (apiKey) {
    requestHeaders["api-Key"] = apiKey;
  }

  /**
   * Fetch raw JSON from a Cockpit API path
   */
  async function fetchRaw<T = unknown>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<T> {
    const queryString = buildQueryString(params);
    const url = queryString ? `${baseUrl}${path}?${queryString}` : `${baseUrl}${path}`;

    const response = await fetch(url, {
      cache,
      headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null as T;
      }
      throw new Error(`Cockpit: Error fetching ${url} (${response.status})`);
    }

    return response.json() as Promise<T>;
  }

  return {
    /**
     * Fetch a page by route
     */
    async pageByRoute<T = unknown>(route: string, params: PageFetchParams = {}): Promise<T | null> {
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
    async pages<T = unknown>(params: PageFetchParams = {}): Promise<T | null> {
      const { locale, ...rest } = params;
      return fetchRaw<T>("/pages/pages", {
        locale: normalizeLocale(locale),
        ...rest,
      });
    },

    /**
     * Fetch a page by ID
     */
    async pageById<T = unknown>(
      page: string,
      id: string,
      params: PageFetchParams = {}
    ): Promise<T | null> {
      const { locale, populate, ...rest } = params;
      return fetchRaw<T>(`/pages/page/${page}/${id}`, {
        locale: normalizeLocale(locale),
        populate,
        ...rest,
      });
    },

    /**
     * Fetch content items
     */
    async getContentItems<T = unknown>(
      model: string,
      params: PageFetchParams = {}
    ): Promise<T | null> {
      const { locale, ...rest } = params;
      return fetchRaw<T>(`/content/items/${model}`, {
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
      params: PageFetchParams = {}
    ): Promise<T | null> {
      const { locale, ...rest } = params;
      const path = id ? `/content/item/${model}/${id}` : `/content/item/${model}`;
      return fetchRaw<T>(path, {
        locale: normalizeLocale(locale),
        ...rest,
      });
    },

    /**
     * Raw fetch for custom paths
     */
    fetchRaw,
  };
}

/**
 * Type for the fetch client instance
 */
export type FetchClient = ReturnType<typeof createFetchClient>;
