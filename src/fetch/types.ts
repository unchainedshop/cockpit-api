/**
 * Types for the lightweight fetch client
 */

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
  /** Locale for the request (default: "de" which maps to "default") */
  locale?: string;
  /** Populate depth for linked content */
  populate?: number;
  /** Additional query parameters */
  [key: string]: string | number | boolean | undefined;
}
