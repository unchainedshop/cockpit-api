/**
 * HTTP client: authentication, timeouts, errors and response transformation
 */

import { logger } from "../cockpit-logger.ts";
import { accessCacheScope, type CockpitConfig } from "./config.ts";
import { CockpitHttpError, requestError } from "./errors.ts";

export { CockpitHttpError };

export interface RequestOptions {
  /** JSON body */
  body?: unknown;
  /** Multipart body (fetch sets the Content-Type with its boundary) */
  form?: FormData;
  /** Return the response text instead of parsed (and transformed) JSON */
  text?: boolean;
  /** Per-request override of the client's `useAdminAccess` */
  useAdminAccess?: boolean;
}

type AccessOptions = Pick<RequestOptions, "useAdminAccess">;

export interface HttpClient {
  /** Resolves to `null` for a 404, throws {@link CockpitHttpError} for other errors */
  request<T>(
    method: string,
    url: URL,
    options?: RequestOptions,
  ): Promise<T | null>;
  fetch<T>(url: URL, options?: AccessOptions): Promise<T | null>;
  post<T>(url: URL, body: unknown, options?: AccessOptions): Promise<T | null>;
  delete<T>(url: URL, options?: AccessOptions): Promise<T | null>;
  /** Cache scope of the effective access mode, for cache keys */
  accessScope(useAdminAccess?: boolean): string;
}

/** `transform` may modify the freshly parsed JSON in place */
export function createHttpClient(
  config: CockpitConfig,
  transform: (json: unknown) => unknown = (json) => json,
): HttpClient {
  const request = async <T>(
    method: string,
    url: URL,
    { body, form, text = false, useAdminAccess }: RequestOptions = {},
  ): Promise<T | null> => {
    const headers: Record<string, string> = {};
    if (useAdminAccess ?? config.useAdminAccess) {
      // Never silently downgrade to a public request (different data)
      if (!config.apiKey) {
        throw new Error(
          "Cockpit: useAdminAccess requires an apiKey (pass `apiKey` or set COCKPIT_SECRET / COCKPIT_SECRET_<TENANT>)",
        );
      }
      headers["api-Key"] = config.apiKey;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const init: RequestInit = {
      method,
      headers,
      // fetch would follow a redirect to any origin with the api-Key header
      ...("api-Key" in headers && { redirect: "error" as const }),
      ...(form !== undefined && { body: form }),
      ...(body !== undefined && { body: JSON.stringify(body) }),
      // One signal for request and body read, so a stalled body times out too
      ...(config.timeout > 0 && {
        signal: AbortSignal.timeout(config.timeout),
      }),
    };

    try {
      logger.debug(`Cockpit: ${method} ${url.href}`);
      const response = await fetch(url, init);
      if (response.status === 404) return null;
      if (!response.ok) {
        const error = new CockpitHttpError(
          response.status,
          url,
          await response.text().catch(() => ""),
        );
        logger.error(`Cockpit: Error accessing ${url.href}`, error.cause);
        throw error;
      }
      if (text) return (await response.text()) as T;
      const json: unknown = await response.json();
      try {
        return transform(json) as T;
      } catch (error) {
        logger.warn("Cockpit: Failed to transform response", error);
        return json as T;
      }
    } catch (err) {
      throw requestError(
        err,
        url.pathname,
        config.timeout,
        "api-Key" in headers,
      );
    }
  };

  return {
    request,
    fetch: <T>(url: URL, options?: AccessOptions) =>
      request<T>("GET", url, options),
    post: <T>(url: URL, body: unknown, options?: AccessOptions) =>
      request<T>("POST", url, { ...options, body }),
    delete: <T>(url: URL, options?: AccessOptions) =>
      request<T>("DELETE", url, options),
    accessScope: (useAdminAccess) => accessCacheScope(config, useAdminAccess),
  };
}
