/**
 * URL building, path validation, query strings and locales.
 * Edge-safe (no node:* imports), also used by the `/fetch` client.
 */

/** Default request timeout in milliseconds */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Ids and model/menu/index/project names: no `.`, `/`, `\`, `%`, `?`, `#`, whitespace or "" */
const PATH_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/**
 * Anything the URL parser could resolve outside the API base path: dot
 * segments, percent-encoding, backslashes, query/fragment delimiters,
 * control characters and `//`.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH = /(^|\/)\.{1,2}(\/|$)|%|\\|[?#]|[\u0000-\u001f\u007f]|\/\//;

export function requireParam(value: unknown, name: string): void {
  if (value === undefined || value === null || value === "")
    throw new Error(`Cockpit: Please provide ${name}`);
}

export function validatePathSegment(value: string, name: string): void {
  // Runtime type check too: JS callers may pass non-strings
  if (typeof value !== "string" || !PATH_SEGMENT.test(value)) {
    throw new Error(
      `Cockpit: Invalid ${name} format (only alphanumeric, hyphens, and underscores allowed)`,
    );
  }
}

/** Central traversal guard: every request URL is built through it */
export function assertSafePath(path: string): void {
  if (!path.startsWith("/") || UNSAFE_PATH.test(path)) {
    throw new Error(`Cockpit: Invalid request path ${JSON.stringify(path)}`);
  }
}

/** An omitted locale and `defaultLanguage` map to Cockpit's "default" locale */
export const normalizeLocale = (
  locale: string | undefined,
  defaultLanguage: string | null,
): string =>
  locale === undefined || locale === defaultLanguage ? "default" : locale;

/**
 * Query string; `null`/`undefined` omitted, strings raw, everything else JSON.
 * Top-level booleans are Cockpit flags (read as ints, where "true" is 0):
 * `true` becomes `1`, `false` is omitted.
 */
export function buildQueryString(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([key, v]) => {
      const value =
        v === true ? "1" : typeof v === "string" ? v : JSON.stringify(v);
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");
}

export interface UrlBuildOptions {
  locale?: string;
  queryParams?: Record<string, unknown>;
}

export interface UrlBuilder {
  /** API URL for `path` (below `/api` or `/:<tenant>/api`), with the normalized locale */
  build(path: string, options?: UrlBuildOptions): URL;
  graphqlEndpoint(): URL;
}

export function createUrlBuilder(config: {
  readonly endpoint: URL;
  readonly tenant?: string;
  readonly defaultLanguage: string | null;
}): UrlBuilder {
  const apiBasePath = config.tenant ? `/:${config.tenant}/api` : "/api";

  return {
    build(path, { locale, queryParams = {} } = {}): URL {
      assertSafePath(path);
      const url = new URL(config.endpoint);
      url.pathname = `${apiBasePath}${path}`;
      // Defense in depth: the parser must not have normalized anything away
      if (url.pathname !== `${apiBasePath}${path}`) {
        throw new Error(
          `Cockpit: Invalid request path ${JSON.stringify(path)}`,
        );
      }
      url.search = buildQueryString({
        ...queryParams,
        locale: normalizeLocale(locale, config.defaultLanguage),
      });
      return url;
    },

    graphqlEndpoint(): URL {
      const url = new URL(config.endpoint);
      if (config.tenant) url.pathname = `/:${config.tenant}${url.pathname}`;
      return url;
    },
  };
}

/** Locale actually sent for a built URL; use it in cache keys */
export function requestLocale(url: URL): string {
  return url.searchParams.get("locale") ?? "default";
}
