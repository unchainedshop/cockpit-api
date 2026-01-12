/**
 * HTTP client for Cockpit API requests
 */

import { logger } from "../cockpit-logger.ts";
import type { CockpitConfig } from "./config.ts";
import type { ResponseTransformer } from "../transformers/image-path.ts";

export interface HttpClient {
  /**
   * Make a GET request
   */
  fetch<T>(url: URL | string, options?: RequestInit): Promise<T | null>;

  /**
   * Make a POST request with JSON body
   */
  post<T>(
    url: URL | string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<T | null>;

  /**
   * Make a DELETE request
   */
  delete<T>(url: URL | string): Promise<T | null>;
}

/**
 * Creates an HTTP client with authentication and response transformation
 */
export function createHttpClient(
  config: CockpitConfig,
  transformer: ResponseTransformer
): HttpClient {
  const buildHeaders = (
    custom: Record<string, string> = {}
  ): Record<string, string> => {
    const headers: Record<string, string> = { ...custom };
    if (config.useAdminAccess && config.apiKey) {
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
        `Cockpit: Error accessing ${response.url} (${response.status}): ${errorText}`
      );
    }

    const json = await response.json();
    return transformer.transform(json) as T;
  };

  const fetchData = async <T>(
    url: URL | string,
    options: RequestInit = {}
  ): Promise<T | null> => {
    logger.debug(`Cockpit: Requesting ${url}`);
    const response = await fetch(url, {
      ...options,
      headers: buildHeaders(options.headers as Record<string, string>),
    });
    return handleResponse<T>(response);
  };

  return {
    fetch: fetchData,

    async post<T>(
      url: URL | string,
      body: unknown,
      headers: Record<string, string> = {}
    ): Promise<T | null> {
      return fetchData<T>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    },

    async delete<T>(url: URL | string): Promise<T | null> {
      return fetchData<T>(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    },
  };
}
