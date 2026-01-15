/**
 * URL construction utilities
 */

import type { CockpitConfig } from "./config.ts";
import { buildQueryString } from "./query-string.ts";
import { createLocaleNormalizer } from "./locale.ts";

export interface UrlBuildOptions {
  locale?: string;
  queryParams?: Record<string, unknown>;
}

export interface UrlBuilder {
  /**
   * Build a URL for an API endpoint
   */
  build(path: string, options?: UrlBuildOptions): URL;

  /**
   * Get the GraphQL endpoint URL
   */
  graphqlEndpoint(): URL;
}

/**
 * Creates a URL builder for the given configuration
 */
export function createUrlBuilder(config: CockpitConfig): UrlBuilder {
  const apiBasePath = config.tenant ? `/:${config.tenant}/api` : "/api";
  const normalizeLocale = createLocaleNormalizer(config.defaultLanguage);

  return {
    build(path: string, options: UrlBuildOptions = {}): URL {
      const { locale = "default", queryParams = {} } = options;
      const normalizedLocale = normalizeLocale(locale);

      const url = new URL(config.endpoint);
      url.pathname = `${apiBasePath}${path}`;

      const queryString = buildQueryString({
        ...queryParams,
        locale: normalizedLocale,
      });

      if (queryString !== null) {
        url.search = queryString;
      }

      return url;
    },

    graphqlEndpoint(): URL {
      const url = new URL(config.endpoint);
      if (config.tenant) {
        url.pathname = `/:${config.tenant}${url.pathname}`;
      }
      return url;
    },
  };
}
