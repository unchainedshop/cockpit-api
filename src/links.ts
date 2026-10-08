/**
 * `pages://id` link resolution and route maps
 *
 * One map pair per Cockpit locale, built from a single pages list request and
 * read through the SWR cache: a fresh hit returns immediately, a stale hit
 * returns the cached maps and refreshes them in the background, and an
 * upstream failure keeps serving the last good maps (within the stale window).
 */

import { logger } from "./cockpit-logger.ts";
import type { CacheManager } from "./core/cache.ts";
import type { HttpClient } from "./core/http.ts";
import type { UrlBuilder } from "./core/url.ts";

/** Cache key prefix of the route maps (cleared by `clearRouteCache()`) */
export const ROUTE_MAPS_PREFIX = "ROUTE_MAPS:";
// Versioned: v3 and earlier stored other shapes under other keys
const ROUTE_MAPS_KEY = `${ROUTE_MAPS_PREFIX}v4:`;

export interface RouteMaps {
  /** `pages://<id>` → route */
  links: Record<string, string>;
  /** Collection/singleton model name → route of the page bound to it */
  models: Record<string, string>;
}

/**
 * Published pages only: requests with an api key see unpublished pages too,
 * but these routes end up in public links. `_state` 1 = published.
 */
const PUBLISHED_FILTER = { _state: 1 } as const;
const PAGE_FIELDS = {
  _id: 1,
  _r: 1,
  _state: 1,
  data: { collection: 1, singleton: 1 },
} as const;

/**
 * Safe to insert as-is into an HTML attribute (resolved links usually end up
 * in `href`): site-relative, a single leading "/", no quotes, backticks,
 * angle brackets, backslashes, whitespace or control characters.
 */
const SAFE_ROUTE_PATTERN =
  // eslint-disable-next-line no-control-regex -- control characters are rejected on purpose
  /^\/(?![/\\])[^\s"'`<>\\\u0000-\u001f\u007f-\u009f]*$/u;

/**
 * Locales a map may be built for (`en`, `de_CH`, `zh-Hant-TW`, `default`);
 * anything else (often caller-controlled) would cost a pages fetch and a
 * cache entry each, so it falls back to the default locale.
 */
const VALID_LOCALE_PATTERN =
  /^(?:[a-zA-Z]{2,3}(?:[_-][a-zA-Z0-9]{2,8})*|default)$/;

interface PageItem {
  _id?: unknown;
  _r?: unknown;
  _state?: unknown;
  data?: { collection?: unknown; singleton?: unknown } | null;
}

const emptyMaps = (): RouteMaps => ({ links: {}, models: {} });

/** Builds both maps; unpublished pages and unsafe routes are skipped */
function buildRouteMaps(pages: unknown[]): RouteMaps {
  const links: [string, string][] = [];
  const models: [string, string][] = [];
  const skipped: string[] = [];
  for (const page of pages as (PageItem | null)[]) {
    if (typeof page !== "object" || page === null) continue;
    const { _id, _r, _state, data } = page;
    if ((_state !== undefined && _state !== 1) || typeof _r !== "string") {
      continue;
    }
    if (!SAFE_ROUTE_PATTERN.test(_r)) {
      skipped.push(String(_id));
      continue;
    }
    if (typeof _id === "string") links.push([`pages://${_id}`, _r]);
    const model = data?.collection ?? data?.singleton;
    if (typeof model === "string") models.push([model, _r]);
  }
  if (skipped.length > 0) {
    logger.warn(
      `Cockpit: Skipped ${String(skipped.length)} unsafe route(s): ${skipped.slice(0, 10).join(", ")}`,
    );
  }
  // fromEntries defines own properties: "__proto__" can't reach the prototype
  return {
    links: Object.fromEntries(links),
    models: Object.fromEntries(models),
  };
}

/**
 * Whole `pages://<id>` tokens: `pages://id1` never matches the prefix of
 * `pages://id10`, anchors and query strings are kept.
 */
const PAGE_LINK_PATTERN = /pages:\/\/[\w-]+/g;
const PAGE_LINK_MARKER = "pages://";
/** Nesting depth treated as a cycle */
const MAX_DEPTH = 10_000;

const replaceLinks = (text: string, links: Record<string, string>): string =>
  text.replace(PAGE_LINK_PATTERN, (match) =>
    Object.hasOwn(links, match) ? (links[match] ?? match) : match,
  );

/**
 * Finds every string of a parsed JSON value that contains a page link.
 * Returns `null` if there is none (no route map needed), otherwise a resolver
 * that rewrites exactly those strings in place (object keys never). Only call
 * the resolver on a value you own.
 *
 * @throws If the value is nested deeper than 10,000 levels (or is cyclic)
 */
export function findPageLinks<T>(
  value: T,
): ((links: Record<string, string>) => T) | null {
  if (typeof value === "string") {
    return value.includes(PAGE_LINK_MARKER)
      ? (links): T => replaceLinks(value, links) as T
      : null;
  }
  const slots: [Record<string, unknown>, string][] = [];
  const stack: [unknown, number][] = [[value, 0]];
  let entry: [unknown, number] | undefined;
  while ((entry = stack.pop()) !== undefined) {
    const [node, depth] = entry;
    if (typeof node !== "object" || node === null) continue;
    if (depth > MAX_DEPTH) {
      throw new Error("Cockpit: Value is too deeply nested (or cyclic)");
    }
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const child = record[key];
      if (typeof child === "string") {
        if (child.includes(PAGE_LINK_MARKER)) slots.push([record, key]);
      } else if (typeof child === "object" && child !== null) {
        stack.push([child, depth + 1]);
      }
    }
  }
  if (slots.length === 0) return null;
  return (links) => {
    for (const [record, key] of slots) {
      record[key] = replaceLinks(record[key] as string, links);
    }
    return value;
  };
}

export interface LinkResolver {
  /**
   * Starts loading the maps of a (normalized) locale alongside a request, or
   * `undefined` when prefetching is off. Never rejects.
   */
  prefetch(locale: string): Promise<RouteMaps> | undefined;
  /** Resolves page links in `value` (owned) in place; never throws */
  resolve<T>(
    value: T,
    locale: string,
    pending?: Promise<RouteMaps>,
  ): Promise<T>;
  /** Route of the page bound to a collection/singleton model */
  routeForCollection(name: string, locale: string): Promise<string | undefined>;
}

export interface LinkResolverOptions {
  /** The client's HTTP client: its credentials and tenant */
  http: HttpClient;
  url: UrlBuilder;
  /** Its prefix already scopes endpoint, tenant and access */
  cache: CacheManager;
  /** Load maps alongside requests (cached clients; else on demand) */
  prefetch: boolean;
}

export function createLinkResolver({
  http,
  url,
  cache,
  prefetch,
}: LinkResolverOptions): LinkResolver {
  // Never throws: without cached maps to fall back on, a failure yields empty
  // (uncached) maps and links stay unresolved
  const load = async (requested: string): Promise<RouteMaps> => {
    const locale = VALID_LOCALE_PATTERN.test(requested) ? requested : "default";
    const key = `${ROUTE_MAPS_KEY}${locale}`;
    try {
      const maps = await cache.swr<RouteMaps>(key, async () => {
        const pages = await http.fetch<unknown>(
          url.build("/pages/pages", {
            locale,
            queryParams: { fields: PAGE_FIELDS, filter: PUBLISHED_FILTER },
          }),
        );
        if (pages === null) {
          // 404: no Pages addon (cache it) on a cold miss, but must not let
          // a transient 404 replace good maps still within their stale window
          const cached = (await cache.get(key)) as
            { data?: unknown; staleUntil?: number } | undefined;
          if (cached?.data != null && Date.now() < (cached.staleUntil ?? 0)) {
            throw new Error(
              "Cockpit: Pages list not found (keeping cached route maps)",
            );
          }
          return emptyMaps();
        }
        if (!Array.isArray(pages)) {
          throw new Error("Cockpit: Unexpected pages list response");
        }
        return buildRouteMaps(pages);
      });
      return maps ?? emptyMaps();
    } catch (error) {
      logger.warn(`Cockpit: Failed to load route maps (${locale})`, error);
      return emptyMaps();
    }
  };

  return {
    prefetch: (locale) => (prefetch ? load(locale) : undefined),

    async resolve<T>(
      value: T,
      locale: string,
      pending?: Promise<RouteMaps>,
    ): Promise<T> {
      try {
        const apply = findPageLinks(value);
        return apply ? apply((await (pending ?? load(locale))).links) : value;
      } catch (error) {
        logger.warn("Cockpit: Failed to resolve page links", error);
        return value;
      }
    },

    async routeForCollection(name, locale): Promise<string | undefined> {
      const { models } = await load(locale);
      return Object.hasOwn(models, name) ? models[name] : undefined;
    },
  };
}
