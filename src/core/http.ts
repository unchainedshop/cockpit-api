/**
 * HTTP client for Cockpit API requests
 */

import { logger } from "../cockpit-logger.ts";
import type { CockpitConfig } from "./config.ts";
import type { ResponseTransformer } from "../transformers/image-path.ts";

/**
 * Per-request options that can override client-level settings
 */
export interface HttpFetchOptions extends RequestInit {
  /** Override the client-level useAdminAccess setting for this request */
  useAdminAccess?: boolean;
}

export interface HttpClient {
  /**
   * Make a GET request
   */
  fetch<T>(url: URL | string, options?: HttpFetchOptions): Promise<T | null>;

  /**
   * Make a POST request with JSON body
   */
  post<T>(
    url: URL | string,
    body: unknown,
    options?: HttpFetchOptions,
  ): Promise<T | null>;

  /**
   * Make a DELETE request
   */
  delete<T>(url: URL | string, options?: HttpFetchOptions): Promise<T | null>;
}

/**
 * Creates an HTTP client with authentication and response transformation
 */
export function createHttpClient(
  config: CockpitConfig,
  transformer: ResponseTransformer,
): HttpClient {
  /**
   * Build headers with optional admin access override
   * @param custom - Custom headers to include
   * @param useAdminAccess - Per-request override (undefined = use config default)
   */
  const buildHeaders = (
    custom: Record<string, string> = {},
    useAdminAccess?: boolean,
  ): Record<string, string> => {
    const headers: Record<string, string> = { ...custom };
    // Use per-request setting if provided, otherwise fall back to config
    const shouldUseAdmin = useAdminAccess ?? config.useAdminAccess;
    if (shouldUseAdmin && config.apiKey !== undefined) {
      headers["api-Key"] = config.apiKey;
    }
    return headers;
  };

  const handleResponse = async <T>(response: Response): Promise<T | null> => {
    if (response.status === 404) return null;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Cockpit: Error accessing ${response.url}`, {
        status: response.status,
        body: errorText,
      });
      throw new Error(
        `Cockpit: Error accessing ${response.url} (${String(response.status)}): ${errorText}`,
      );
    }

    const json = await response.json();
    return transformer.transform(json) as T;
  };

  const fetchData = async <T>(
    url: URL | string,
    options: HttpFetchOptions = {},
  ): Promise<T | null> => {
    const { useAdminAccess, ...fetchOptions } = options;
    logger.debug(`Cockpit: Requesting ${String(url)}`);
    const response = await fetch(url, {
      ...fetchOptions,
      headers: buildHeaders(
        fetchOptions.headers as Record<string, string>,
        useAdminAccess,
      ),
    });
    return handleResponse<T>(response);
  };

  return {
    fetch: fetchData,

    async post<T>(
      url: URL | string,
      body: unknown,
      options: HttpFetchOptions = {},
    ): Promise<T | null> {
      const { useAdminAccess, headers, ...restOptions } = options;
      const customHeaders =
        headers && typeof headers === "object" && !Array.isArray(headers)
          ? (headers as Record<string, string>)
          : {};
      const fetchOpts: HttpFetchOptions = {
        ...restOptions,
        method: "POST",
        headers: { "Content-Type": "application/json", ...customHeaders },
        body: JSON.stringify(body),
      };
      if (useAdminAccess !== undefined)
        fetchOpts.useAdminAccess = useAdminAccess;
      return fetchData<T>(url, fetchOpts);
    },

    async delete<T>(
      url: URL | string,
      options: HttpFetchOptions = {},
    ): Promise<T | null> {
      const { useAdminAccess, ...restOptions } = options;
      const fetchOpts: HttpFetchOptions = {
        ...restOptions,
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      };
      if (useAdminAccess !== undefined)
        fetchOpts.useAdminAccess = useAdminAccess;
      return fetchData<T>(url, fetchOpts);
    },
  };
}
