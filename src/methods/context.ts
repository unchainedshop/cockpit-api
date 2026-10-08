/**
 * Shared plumbing of the client methods: context, path segments, reads
 */

import { createHash } from "node:crypto";
import { warnOnce } from "../cockpit-logger.ts";
import type { CacheManager } from "../core/cache.ts";
import type { CockpitConfig } from "../core/config.ts";
import type { HttpClient } from "../core/http.ts";
import {
  requestLocale,
  requireParam,
  validatePathSegment,
  type UrlBuilder,
} from "../core/url.ts";
import type { LinkResolver } from "../links.ts";

export interface MethodContext {
  readonly config: CockpitConfig;
  readonly http: HttpClient;
  readonly url: UrlBuilder;
  readonly cache: CacheManager;
  readonly links: LinkResolver;
}

/** A required, validated path segment (id, model, menu, index or project name) */
export function segment(value: string, name: string): string {
  requireParam(value, name);
  validatePathSegment(value, name);
  return value;
}

/** `queryParams` overlaid with the typed options that are defined */
export const withTyped = (
  queryParams: Record<string, unknown> | undefined,
  typed: Record<string, unknown>,
): Record<string, unknown> => ({
  ...queryParams,
  ...Object.fromEntries(
    Object.entries(typed).filter(([, value]) => value !== undefined),
  ),
});

/** v2 string locale argument (removed in v3): honored, warned about once */
export function legacyLocale<T>(options: T | string, call: string): T {
  if (typeof options !== "string") return options;
  warnOnce(call, `Cockpit: ${call} was removed in v3; pass { locale }`);
  return { locale: options } as T;
}

/**
 * Cache key of a read: API path, effective access and a hash of the sorted
 * query (which carries the normalized locale, so the `defaultLanguage` and
 * "default" share entries). The `|` after the path keeps prefix
 * invalidation of `/content/items/posts|` away from `postsArchive`. The cache
 * prefix already scopes endpoint, tenant and the client's access.
 */
export function cacheKey(
  http: HttpClient,
  path: string,
  url: URL,
  useAdminAccess?: boolean,
): string {
  const query = new URLSearchParams(url.search);
  query.sort();
  const hash = createHash("sha1").update(query.toString()).digest("hex");
  return `${path}|${http.accessScope(useAdminAccess)}|${hash}`;
}

/**
 * Runs `load` and, when the client resolves page links, resolves them in its
 * (owned) result with the route map of `locale`: after the cache, so cached
 * responses follow the current map. On cached clients the map is loaded
 * alongside the request (one round trip on a cold cache).
 */
export async function withLinks<T>(
  ctx: MethodContext,
  locale: string,
  load: () => Promise<T | null>,
  links = true,
): Promise<T | null> {
  if (!links || !ctx.config.resolvePageLinks) return load();
  const pending = ctx.links.prefetch(locale);
  return ctx.links.resolve(await load(), locale, pending);
}

export interface GetOptions {
  locale?: string | undefined;
  query?: Record<string, unknown>;
  /** Per-request override of the client's `useAdminAccess` */
  useAdminAccess?: boolean | undefined;
  /** Read through the SWR cache (default: true) */
  cache?: boolean;
  /** Resolve page links if the client does (default: true) */
  links?: boolean;
}

/** GET of an API path, optionally mapping the raw (non-null) body */
export async function get<T>(
  ctx: MethodContext,
  path: string,
  { locale, query = {}, useAdminAccess, cache = true, links }: GetOptions = {},
  map: (raw: unknown) => T = (raw) => raw as T,
): Promise<T | null> {
  const url = ctx.url.build(path, {
    locale: locale ?? "default",
    queryParams: query,
  });
  const fetch = async (): Promise<T | null> => {
    const raw = await ctx.http.fetch<unknown>(
      url,
      useAdminAccess === undefined ? {} : { useAdminAccess },
    );
    return raw === null ? null : map(raw);
  };
  const key = cacheKey(ctx.http, path, url, useAdminAccess);
  return withLinks(
    ctx,
    requestLocale(url),
    cache ? (): Promise<T | null> => ctx.cache.swr(key, fetch) : fetch,
    links,
  );
}
