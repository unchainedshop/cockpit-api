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
   * Make a GET request expecting JSON response
   */
  fetch<T>(url: URL | string, options?: HttpFetchOptions): Promise<T | null>;

  /**
   * Make a GET request expecting text response (e.g., URL strings)
   */
  fetchText(
    url: URL | string,
    options?: HttpFetchOptions,
  ): Promise<string | null>;

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
 * Normalizes headers to Record<string, string>
 */
function normalizeHeaders(
  headers: RequestInit["headers"],
): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }
  return headers as Record<string, string>;
}

/**
 * Prepares request options for POST/DELETE requests
 */
function prepareJsonRequestOptions(
  options: HttpFetchOptions,
  method: string,
  body?: unknown,
): HttpFetchOptions {
  const { useAdminAccess, headers, ...restOptions } = options;
  const customHeaders = normalizeHeaders(headers);

  const fetchOpts: HttpFetchOptions = {
    ...restOptions,
    method,
    headers: { "Content-Type": "application/json", ...customHeaders },
  };

  if (body !== undefined) fetchOpts.body = JSON.stringify(body);
  if (useAdminAccess !== undefined) fetchOpts.useAdminAccess = useAdminAccess;

  return fetchOpts;
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

  const handleErrorResponse = async (response: Response): Promise<null> => {
    const errorText = await response.text();
    logger.error(`Cockpit: Error accessing ${response.url}`, {
      status: response.status,
      body: errorText,
    });
    throw new Error(
      `Cockpit: Error accessing ${response.url} (${String(response.status)}): ${errorText}`,
    );
  };

  const handleJsonResponse = async <T>(
    response: Response,
  ): Promise<T | null> => {
    if (response.status === 404) return null;
    if (!response.ok) return handleErrorResponse(response);

    const json = await response.json();
    return transformer.transform(json) as T;
  };

  const handleTextResponse = async (
    response: Response,
  ): Promise<string | null> => {
    if (response.status === 404) return null;
    if (!response.ok) return handleErrorResponse(response);

    return response.text();
  };

  const doFetch = async (
    url: URL | string,
    options: HttpFetchOptions = {},
  ): Promise<Response> => {
    const { useAdminAccess, ...fetchOptions } = options;
    logger.debug(`Cockpit: Requesting ${String(url)}`);
    return fetch(url, {
      ...fetchOptions,
      headers: buildHeaders(
        fetchOptions.headers as Record<string, string>,
        useAdminAccess,
      ),
    });
  };

  const fetchData = async <T>(
    url: URL | string,
    options: HttpFetchOptions = {},
  ): Promise<T | null> => {
    const response = await doFetch(url, options);
    return handleJsonResponse<T>(response);
  };

  const fetchTextData = async (
    url: URL | string,
    options: HttpFetchOptions = {},
  ): Promise<string | null> => {
    const response = await doFetch(url, options);
    return handleTextResponse(response);
  };

  return {
    fetch: fetchData,
    fetchText: fetchTextData,

    async post<T>(
      url: URL | string,
      body: unknown,
      options: HttpFetchOptions = {},
    ): Promise<T | null> {
      return fetchData<T>(
        url,
        prepareJsonRequestOptions(options, "POST", body),
      );
    },

    async delete<T>(
      url: URL | string,
      options: HttpFetchOptions = {},
    ): Promise<T | null> {
      return fetchData<T>(url, prepareJsonRequestOptions(options, "DELETE"));
    },
  };
}
