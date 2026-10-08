# Cockpit API

[![npm version](https://img.shields.io/npm/v/@unchainedshop/cockpit-api.svg)](https://www.npmjs.com/package/@unchainedshop/cockpit-api)
[![CI](https://github.com/unchainedshop/cockpit-api/actions/workflows/ci.yml/badge.svg)](https://github.com/unchainedshop/cockpit-api/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D25-brightgreen.svg)](https://nodejs.org/)

A TypeScript client for [Cockpit CMS](https://github.com/Cockpit-HQ/Cockpit): content, pages, menus, assets and GraphQL, with stale-while-revalidate caching, `pages://` link resolution, multi-tenancy and GraphQL schema stitching.

> Upgrading from 2.x? See [Migration to v3.0.0](#migration-to-v300).

## Installation

```sh
npm install @unchainedshop/cockpit-api
```

Requires Node.js >= 25. Optional peer dependencies: `graphql` (for `graphQL()` and `/schema`) and `@graphql-tools/wrap` (for `/schema`).

| Entry point | Purpose |
|---|---|
| `@unchainedshop/cockpit-api` | Full client: caching, asset URL rewriting, page links |
| `@unchainedshop/cockpit-api/fetch` | Lightweight client for edge/RSC (no cache, no transformation) |
| `@unchainedshop/cockpit-api/schema` | Stitchable GraphQL schema for a gateway |

## Quick Start

Create **one long-lived client per process** (per tenant) and reuse it. A client per request starts with an empty cache every time, which defeats stale-while-revalidate and the route-map cache. Use per-call `locale` / `useAdminAccess` instead of separate clients.

```ts
// cockpit.ts
import { CockpitAPI } from "@unchainedshop/cockpit-api";

export const cockpit = CockpitAPI({
  endpoint: "https://cms.example.com/api/graphql", // or COCKPIT_GRAPHQL_ENDPOINT
  resolvePageLinks: true,
});

// elsewhere
const client = await cockpit;
const page = await client.pageByRoute("/about", { locale: "en" });
```

`CockpitAPI()` returns a Promise but contacts Cockpit only when a method is called.

## Configuration

| Option | Env var | Default | Description |
|---|---|---|---|
| `endpoint` | `COCKPIT_GRAPHQL_ENDPOINT` | required | Cockpit GraphQL endpoint; its origin is used for the REST API |
| `tenant` | | none | Space; requests go to `/:<tenant>/api/...`. Must match `^[a-zA-Z0-9_-]+$` |
| `apiKey` | `COCKPIT_SECRET_<TENANT>` (name matched case-insensitively), else `COCKPIT_SECRET` (no tenant only) | none | Sent as `api-Key` when admin access is used. Env values are trimmed; an empty string counts as missing |
| `useAdminAccess` | | `false` | Send the API key with every request (overridable per request) |
| `defaultLanguage` | | `null` | Language that is sent as Cockpit's `"default"` locale |
| `cache` | `COCKPIT_CACHE_MAX` (for `cache.max`) | LRU, 100 entries | `false` disables caching; see [Caching](#caching) |
| `publicUrl` | `COCKPIT_PUBLIC_URL` | endpoint origin | Origin for rewritten asset URLs (trailing slashes are stripped) |
| `relativeAssetPaths` | `COCKPIT_RELATIVE_ASSET_PATHS=true` | `false` | Emit host-relative asset URLs |
| `resolvePageLinks` | | `false` | Resolve `pages://<id>` links in responses |
| `timeout` | `COCKPIT_TIMEOUT` | `15000` | Request timeout in ms, `0` disables |

A tenant never falls back to `COCKPIT_SECRET`: the default space's key is never sent to another space. Numeric env vars that are set but not numbers throw at creation.

**Locales:** an omitted `locale` is sent as `default`. With `defaultLanguage: "de"`, `locale: "de"` is sent as `default` too (and shares cache entries with it).

## API

All methods return Promises; `null` means 404.

```ts
// GraphQL (loads `graphql` on first use; optional operationName)
graphQL<T>(document: DocumentNode, variables?: Record<string, unknown>, operationName?: string): Promise<T | null>

// Content
getContentItem<T>({ model, id?, locale?, fields?, populate?, queryParams?, useAdminAccess? }): Promise<T | null>   // omit id for singletons
getContentItems<T>(model, { limit?, skip?, sort?, filter?, fields?, populate?, locale?, queryParams?, useAdminAccess? }?): Promise<CockpitListResponse<T> | null>
getContentTree<T>(model, { parent?, filter?, fields?, populate?, locale?, queryParams?, useAdminAccess? }?): Promise<CockpitTreeNode<T>[] | null>
getAggregateModel<T>({ model, pipeline, locale? }): Promise<T[] | null>
postContentItem<T>(model, item): Promise<T | null>      // clears this client's cached reads of `model`
deleteContentItem<T>(model, id): Promise<T | null>      // same

// Unchained module: always admin access (needs content/{model}/read), never cached, links never resolved
getUnchainedContentItems<T>(model, { ...getContentItems options, includeUnpublished? }?): Promise<CockpitListResponse<T> | null>

// Pages
pages<T>({ limit?, skip?, sort?, filter?, fields?, populate?, locale?, queryParams?, useAdminAccess? }?): Promise<CockpitListResponse<T> | null>
pageById<T>(id, { locale?, populate? }?): Promise<T | null>
pageByRoute<T>(route, { locale?, populate?, fallbackToDefault? }?): Promise<T | null>   // populate defaults to 0

// Menus
pagesMenus<T>({ locale?, inactive? }?): Promise<T[] | null>
pagesMenu<T>(name, { locale?, inactive? }?): Promise<T | null>

// Routes
pagesRoutes<T>(locale?): Promise<T | null>          // { [cockpitLocale]: CockpitRoute[] }
pagesSitemap<T>(): Promise<T[] | null>
pagesSetting<T>(locale?): Promise<T | null>
getRouteForCollection(name, locale?): Promise<string | undefined>   // e.g. "/blog" for "posts"

// Assets
assetById<T>(assetId): Promise<T | null>
imageAssetById(assetId, { w and/or h, m?, q?, mime?, t? }): Promise<string | null>   // URL of the generated image
uploadAssets(files: File[], { folder? }?): Promise<UploadAssetsResponse | null>   // Unchained module, admin access (assets/upload)

// Addons
search<T>({ index, q?, fields?, limit?, offset? }): Promise<T | null>   // Detektivo
localize<T>(projectName, { locale?, nested? }?): Promise<T | null>        // Lokalize

// System
healthCheck<T>(): Promise<T | null>
clearCache(pattern?): Promise<void>
clearRouteCache(): Promise<void>
```

Notes:

- `getContentItems()` and `pages()` always return `{ data: T[], meta? }`. `meta.total` is present when Cockpit paginates (`skip`); Cockpit's pages list never sends it.
- `queryParams` adds raw query parameters; typed options that are defined win over keys of the same name (an `undefined` option never removes a `queryParams` key). `getContentTree` sends `filter: {}` when neither sets a filter.
- Top-level boolean query parameters are Cockpit flags: `true` is sent as `1`, `false` is omitted. Objects (`filter`, `sort`, ...) are sent as JSON.
- `pageByRoute(route, { locale, fallbackToDefault: true })`: if the route doesn't exist in `locale`, it is looked up in the default locale and that page is loaded in `locale`.
- `pagesRoutes()` is keyed by Cockpit locale: `(await client.pagesRoutes("en"))?.en`, `(await client.pagesRoutes())?.default`.
- `getRouteForCollection()` reads the cached route map of the locale (published pages bound via `data.collection` / `data.singleton`).
- `imageAssetById()` drops the `o` and `re` parameters (they would return the image instead of its URL). URLs on the endpoint's origin are rewritten like asset paths when `publicUrl` or `relativeAssetPaths` is set; otherwise they are returned as Cockpit sends them.
- `uploadAssets([])` resolves to `{ assets: [] }` without a request.

Utilities exported from the main entry: `getTenantIds`, `resolveTenantFromUrl`, `parseCockpitUrl`, `extractPageId`, `extractAssetId`, `createLRUCacheStore`, `CockpitHttpError`, `ImageSizeMode`, `MimeType`, plus the option and response types (`CockpitAPIOptions`, `CockpitPage`, `CockpitListResponse`, ...).

## Caching

Reads go through a per-client **stale-while-revalidate** cache (built-in in-memory LRU, 100 entries by default):

| State | Behavior |
|---|---|
| Fresh (default 1 h) | Served from cache |
| Stale (default up to 30 days) | Served from cache; one deduplicated background refresh per key |
| Cold or past the stale window | Waits for Cockpit (concurrent callers share one request); errors are thrown |

When a background refresh fails:

- **Transient** (network error, timeout, 5xx, 429, other 4xx): the stale entry keeps being served until its stale window ends. Data is never served past the stale window.
- **401 / 403**: the entry is expired, so data fetched with revoked credentials is not served again.
- **404**: never cached; a previously cached entry is expired, so deleted content disappears.

Cached: `getContentItem(s)`, `getContentTree`, `getAggregateModel`, `pages`, `pageById`, `pageByRoute`, `pagesMenu(s)`, `pagesRoutes`, `pagesSitemap`, `pagesSetting`, GraphQL queries and the route maps. Not cached: `getUnchainedContentItems`, `assetById`, `imageAssetById`, `search`, `localize`, `healthCheck`, writes, uploads, GraphQL mutations and GraphQL responses with a non-empty `errors` array.

```ts
await CockpitAPI({
  cache: {
    max: 500,                                        // built-in LRU entries (COCKPIT_CACHE_MAX)
    swr: { freshMs: 5 * 60_000, staleMs: 86_400_000 },
  },
});
await CockpitAPI({ cache: false });                  // every call fetches
```

### Cache keys and invalidation

Store keys are `cockpit-api:<endpoint>:<tenant>:<client access scope>:<key>`, where `<key>` is

```
<api path>|<access scope>|<hash of the sorted query>
e.g. /content/items/posts|public|3f2a...
```

The access scope is `public`, or `admin-<12 hex chars of the key's SHA-256>` (the raw key never appears). The query hash covers the locale actually sent, so endpoints, tenants, keys and locales never share entries. Route maps use `ROUTE_MAPS:v4:<locale>`, GraphQL queries `graphql|<hash>`.

```ts
await client.clearCache();                            // all entries of this client
await client.clearCache("/content/items/posts|");     // prefix, relative to the client's prefix
await client.clearCache("/pages/menu");               // all menu reads
await client.clearRouteCache();                       // after pages were moved or (un)published
```

- The trailing `|` keeps `/content/items/posts|` from matching `postsArchive`.
- `clearRouteCache()` clears the route maps (all locales), `pageByRoute` lookups, `pagesRoutes` and `pagesSitemap`. Other cached content stays; its links resolve against the refreshed maps on the next read.
- `postContentItem` / `deleteContentItem` clear this client's cached `getContentItem(s)`, `getContentTree` and `getAggregateModel` reads of the model on success (other clients and processes keep theirs until they expire). A failing cache store is logged, not thrown.
- `clearCache()` also cancels pending fetches for the cleared keys, so they don't write old data back.

### Custom stores

Any async store (Redis, Keyv, ...) can be plugged in; `max` / `COCKPIT_CACHE_MAX` are then ignored.

```ts
import { createClient } from "redis";
import type { AsyncCacheStore } from "@unchainedshop/cockpit-api";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const store: AsyncCacheStore = {
  async get(key) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : undefined;
  },
  async set(key, value) {
    // Keep the TTL at least as long as the stale window
    await redis.set(key, JSON.stringify(value), { EX: 30 * 24 * 60 * 60 });
  },
  async clear(pattern) {
    // `pattern` is a key prefix (never empty: the client passes its own prefix)
    const keys = await redis.keys(`${pattern ?? ""}*`);
    if (keys.length > 0) await redis.del(keys);
  },
};

const client = await CockpitAPI({ cache: { store } });
```

- Values are SWR envelopes `{ data, freshUntil, staleUntil }` (`data: null` marks an expired entry); external stores must serialize them.
- **Copy semantics:** the client stores a `structuredClone` of every value and hands every caller its own copy, so mutating a result never affects the cache or other callers. Stores may therefore keep and return shared references.
- `createLRUCacheStore({ max })` creates the built-in store, e.g. to share one bounded in-memory store between several clients (their keys are prefixed per endpoint, tenant and access scope).

## Page Links

Cockpit stores internal links as `pages://<id>`. With `resolvePageLinks: true` they are replaced by the page's route:

```ts
const client = await CockpitAPI({ resolvePageLinks: true });
const page = await client.pageByRoute("/about", { locale: "en" }); // links resolved to `en` routes
```

- Links are resolved **after the cache**, on every read, with the route map of the **locale the call requested**, so cached responses follow moved pages. GraphQL responses use the default locale's map.
- Route maps are cached per locale (SWR), contain **published pages only**, and are fetched with the client's own credentials, tenant and timeout, alongside the request. With `cache: false`, the map is fetched only for responses that contain a link.
- Only whole `pages://<id>` tokens are replaced (anchors and query strings are kept); unknown ids stay as they are. Routes that are not safe site-relative paths are skipped (and logged). If a map can't be loaded, links stay unresolved. Locales that don't look like locale codes use the default locale's map.
- Links are never resolved in `getUnchainedContentItems`, `postContentItem`, `deleteContentItem`, `uploadAssets`, `imageAssetById` and `healthCheck` responses, so data written back never contains resolved routes.

## Asset Paths

Every JSON response is rewritten once, before caching, against `publicUrl ?? endpoint origin` (with `/:<tenant>` for tenants):

- the `path` of **asset objects** (objects with string `path` and `mime` plus a string `_id`, string `_hash` or numeric `size`): `"/2026/01/x.jpg"` becomes `https://cms.example.com/storage/uploads/2026/01/x.jpg`;
- `src="..."` / `href="..."` attributes in strings that start with `/storage/`, `/:<space>/storage/` or `/.spaces/<space>/storage/` (case-sensitive; `/de/self-storage` and `//host/storage/...` are left alone). They get the origin and keep their own prefix.

Object keys and other `path` fields (routes, SEO) are never rewritten. A Cockpit served from a subdirectory (`/cms/storage/...`) is not rewritten.

When the client reaches Cockpit over an internal host (e.g. a Docker service name) but browsers load assets from a public one, set `publicUrl`, or `relativeAssetPaths: true` to emit `/storage/uploads/...` and let the app prepend its own origin.

## Errors

```ts
import { CockpitHttpError } from "@unchainedshop/cockpit-api";

try {
  await client.getContentItems("posts");
} catch (error) {
  if (error instanceof CockpitHttpError) {
    error.status;  // e.g. 500
    error.url;     // request URL without query string
    error.message; // "Cockpit: Error accessing /api/content/items/posts (500)"
    error.cause;   // { status, url, body } (body truncated to 500 chars)
  }
}
```

- 404 resolves to `null`; other non-OK responses throw `CockpitHttpError`.
- Timeouts throw `Error("Cockpit: request timed out after <ms>ms (<path>)")`.
- A redirect refused for a request with credentials throws `Error("Cockpit: refusing to follow redirect for authenticated request (<path>)")` (the fetch error as `cause`).
- `useAdminAccess` without an API key throws before any request instead of silently sending a public one.
- Missing or invalid ids/names throw before any request, e.g. `Cockpit: Please provide model`, `Cockpit: Invalid model format (only alphanumeric, hyphens, and underscores allowed)`.
- All library errors start with `Cockpit:`.

## Security

- **Path validation:** ids and model, menu, search index, Lokalize project and tenant names must match `^[a-zA-Z0-9_-]+$`. Every request path is additionally checked for dot segments, `%`, `\`, `?`, `#`, `//` and control characters, and must not be normalized by the URL parser.
- **Credentials never follow redirects:** requests carrying the API key use `redirect: "error"`, so a redirect (to any origin) fails instead of forwarding the key.
- **Timeouts:** 15 s by default, covering the response body too.
- **Route maps** only contain published pages, even when fetched with an API key, since resolved routes end up in public links.
- **Untrusted filters:** `filter` is a Mongo-style query passed to Cockpit as-is. When it comes from end users (especially with admin access), allow plain fields with scalar values only:

```ts
const isScalar = (v: unknown) =>
  typeof v === "string" || typeof v === "boolean" ||
  (typeof v === "number" && Number.isFinite(v));

function sanitizeFilter(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) => /^[a-zA-Z0-9_.]+$/.test(key) && isScalar(value),
    ),
  );
}

// Add server-side constraints AFTER sanitizing so they can't be overridden
const filter = { ...sanitizeFilter(req.query.filter), _state: 1 };
```

## Lightweight Fetch Client (`/fetch`)

For edge/RSC environments: synchronous creation, no cache (use the platform's `fetch` cache), no asset or link rewriting. At runtime it only imports the edge-safe URL module.

```ts
import { createFetchClient } from "@unchainedshop/cockpit-api/fetch";

const cockpit = createFetchClient({
  endpoint: "https://cms.example.com/api/graphql", // default: COCKPIT_GRAPHQL_ENDPOINT; only the origin is used
  tenant: "mytenant",           // optional
  cache: "force-cache",         // fetch cache mode (default: "no-store")
  defaultLanguage: "de",        // default: null
  timeout: 15000,               // default: 15000, 0 disables
  apiKey: process.env.COCKPIT_SECRET, // server-side only, never ship it to browsers
  headers: { "x-custom": "1" },
});

await cockpit.pageByRoute("/about", { locale: "en", populate: 1 });
await cockpit.pages({ locale: "en", limit: 10 });              // { data, meta? } | null
await cockpit.pageById("page-id", { locale: "en" });
await cockpit.getContentItems("news", { locale: "en", limit: 10 }); // { data, meta? } | null
await cockpit.getContentItem("news", "item-id", { locale: "en" });
await cockpit.fetchRaw("/custom/endpoint", { param: "value" });
```

- Params are encoded like in the main client (booleans as `1`/omitted, objects as JSON); `locale`, `populate` and `route` set by the library win over extra keys.
- `fetchRaw` paths are relative to `/api` (or `/:tenant/api`), start with `/` and are validated like all request paths; pass the query via `params`.
- With `apiKey` or any `headers`, redirects fail (`redirect: "error"`) with `Cockpit: refusing to follow redirect for authenticated request (<path>)`.
- 404 resolves to `null`; other non-OK responses throw `CockpitHttpError` (same class as the main client, importable from the main entry). Timeouts, also while reading the body, throw `Cockpit: request timed out after <ms>ms (<path>)`.

## GraphQL Gateway (`/schema`)

```ts
import { makeCockpitGraphQLSchema } from "@unchainedshop/cockpit-api/schema";
import { stitchSchemas } from "@graphql-tools/stitch";

const cockpitSchema = await makeCockpitGraphQLSchema({
  tenantHeader: "x-cockpit-space",          // default
  allowedTenants: ["tenant-a", "tenant-b"], // or (tenant) => boolean; default: getTenantIds()
  apiKey: (tenant) => keys[tenant ?? "default"], // optional per-space key resolver
  cockpitOptions: {
    endpoint: "https://cms.example.com/api/graphql",
    apiKey: process.env.COCKPIT_SECRET,     // default space only
    useAdminAccess: true,
  },
});

const gateway = stitchSchemas({ subschemas: [{ schema: cockpitSchema }] });
```

- **Tenant selection:** the tenant comes from `tenantHeader` or `extractTenant(context)`; it is lower-cased, validated and must pass `allowedTenants` (default: tenants from `COCKPIT_SECRET_<TENANT>` env vars, read per request). Other tenants get a GraphQL error (`Cockpit: Unknown tenant` / `Cockpit: Invalid tenant`) without a client being created. An empty or missing tenant selects the default space.
- **Keys:** `apiKey(tenant)` is called with the tenant (`undefined` for the default space). Otherwise tenants use `COCKPIT_SECRET_<TENANT>` and the default space uses `cockpitOptions.apiKey` / `COCKPIT_SECRET`. `cockpitOptions.apiKey` is never sent to a caller-selected tenant; to share a key, return it from `apiKey` explicitly.
- **Read-only by default:** `filterMutations` (default `true` here) removes the Mutation type and makes the executor reject non-query operations (`Cockpit: Only queries are allowed`). `createRemoteExecutor()` defaults it to `false`.
- **Pool:** one client per space, up to `maxClients` (default 100). Clients resolve page links by default and share one LRU store of `cockpitOptions.cache.max` / `COCKPIT_CACHE_MAX` entries for the whole pool (default 1000), unless `cache` is `false` or has a `store`.
- `cockpitOptions` accepts `endpoint`, `apiKey`, `useAdminAccess`, `resolvePageLinks`, `cache`, `publicUrl`, `relativeAssetPaths`, `timeout` and `defaultLanguage`. Other options: `extractTenant`, `transforms`, `introspection` (skip live introspection at startup).

## Multi-Tenant Helpers

```ts
import { getTenantIds, resolveTenantFromUrl } from "@unchainedshop/cockpit-api";

// With COCKPIT_SECRET_MYTENANT set:
getTenantIds(); // ["mytenant"]: lower-cased suffixes of all COCKPIT_SECRET_<X> env vars
resolveTenantFromUrl("https://mytenant.example.com/some/page");
// { tenant: "mytenant", slug: "page", hostname: "mytenant.example.com" }
resolveTenantFromUrl(url, { defaultHost: "www" }); // "www" never resolves as a tenant
```

The tenant is the first host label if it is a configured tenant, else `null`; `slug` is the last path segment.

## Development

```sh
npm run build             # compile to dist/
npm test                  # unit tests (with coverage)
npm run test:integration  # against a real Cockpit:
                          # COCKPIT_TEST_ENDPOINT=https://cms.example.com npm run test:integration
                          # optional: COCKPIT_TEST_SECRET, COCKPIT_TEST_TENANT,
                          # COCKPIT_TEST_SEARCH_INDEX, COCKPIT_TEST_LOKALIZE_PROJECT
npm run typecheck         # type-check sources and tests
npm run lint              # eslint (npm run lint:fix to fix)
```

## Migration to v3.0.0

Changes since v2.8.0. Caches start cold after upgrading (all keys changed).

### Removed

| Removed | Replacement |
|---|---|
| `preloadRoutes` option (also in `/schema` `cockpitOptions`) | `resolvePageLinks` |
| `getFullRouteForSlug(slug)` | `getRouteForCollection(name, locale?)` |
| `cache.ttl`, `COCKPIT_CACHE_TTL` | none (SWR windows via `cache.swr`; TTLs belong in custom stores) |
| `SwrOptions`, `SwrDefaults` types; per-call options of `CacheManager.swr()` | `cache.swr` |
| `resolveTenantFromSubdomain()`, `ResolveTenantFromSubdomainOptions` | `resolveTenantFromUrl()` |
| `generateCmsRouteReplacements()`, `generateCollectionAndSingletonSlugRouteMap()` | `resolvePageLinks`, `getRouteForCollection()` |
| `createImagePathTransformer`, `createAssetPathTransformer`, `createPageLinkTransformer`, `composeTransformers`, `identityTransformer`, `ResponseTransformer` | none (rewriting is built in) |
| `MethodContext` type | none |
| `isCockpitPageUrl()`, `isCockpitAssetUrl()` | `extractPageId(url) !== null`, `extractAssetId(url) !== null` |
| String locale argument of `pageByRoute`, `pagesMenus`, `pagesMenu` (still honored as the locale, with a one-time warning) | `{ locale }` |
| `re` and `o` in `ImageAssetQueryParams` | none (`imageAssetById` always resolves to the URL) |
| `NEXT_PUBLIC_COCKPIT_ENDPOINT` fallback in `/fetch` | pass `endpoint` or set `COCKPIT_GRAPHQL_ENDPOINT` |

```ts
// Before
await CockpitAPI({ preloadRoutes: true });
await client.getFullRouteForSlug("posts");
await client.pageByRoute("/about", "en");
await client.pagesMenus("en");
isCockpitPageUrl(link);

// After
await CockpitAPI({ resolvePageLinks: true });
await client.getRouteForCollection("posts", "en");
await client.pageByRoute("/about", { locale: "en" });
await client.pagesMenus({ locale: "en" });
extractPageId(link) !== null;
```

Passing a removed option (`preloadRoutes`, `cache.ttl`, `cache.maxSize`, `cache.memoryLayer`) logs a one-time warning; it has no effect.

New: `CockpitHttpError`, `createLRUCacheStore`, `clearRouteCache()`, the `timeout` option, `allowedTenants` / `apiKey` in `/schema`.

### Changed return values and requests

- **`pagesRoutes()` is always keyed by locale.** Cockpit answers a configured locale with a bare array, which is now wrapped under the locale sent:

  ```ts
  // Before
  const routes = await client.pagesRoutes("en");        // CockpitRoute[] (or an object)
  // After
  const routes = (await client.pagesRoutes("en"))?.en;  // CockpitRoute[]
  ```

- **Booleans are sent as Cockpit flags:** top-level `true` becomes `1`, `false` is omitted (was `true`/`false`, which Cockpit reads as `0`). `pagesMenus({ inactive: true })`, `localize(..., { nested: true })` and boolean `queryParams` now take effect. Applies to `/fetch` params too; there, objects are now sent as JSON instead of `[object Object]`.
- **`getContentItem` accepts typed `fields` and `populate`** (alongside `queryParams.fields` / `queryParams.populate`, which keep working; a defined typed option wins). Its options type no longer includes `limit`/`skip`/`sort`/`filter` (they were never sent). `pages()` now sends `populate` and honors `useAdminAccess`.
- **`imageAssetById`** strips `o`/`re` and rewrites URLs on the endpoint origin when `publicUrl` or `relativeAssetPaths` is set.
- **`pageByRoute(..., { fallbackToDefault: true })`** treats the `defaultLanguage` as the default locale (no second lookup).
- **`parseCockpitUrl("pages://")`** (no id) returns `null`; ids end at `#` as well as `?`.
- **`getTenantIds()`** lists the lower-cased suffix of every `COCKPIT_SECRET_<X>` env var (de-duplicated, names ending in `_FILE` skipped, now case-insensitively). Each listed tenant resolves its key: `COCKPIT_SECRET_<TENANT>` names are matched case-insensitively.

### Caching

- **Bounded staleness:** data past its stale window (default 30 days) is no longer served when Cockpit fails; the error is thrown.
- **401/403** during a refresh expire the entry; **404** expires a cached entry (deleted content disappears).
- **New key format** `<api path>|<access scope>|<hash>` under a prefix that includes the client's access scope. Old patterns such as `clearCache("content:posts")` or `clearCache("pages:")` no longer match anything:

  ```ts
  // Before
  await client.clearCache("content:posts");
  await client.clearCache("ROUTE");
  // After
  await client.clearCache("/content/items/posts|");
  await client.clearRouteCache();
  ```

  Old entries in external stores are never read again and expire through the store's TTL.
- **Writes invalidate** the model's cached reads of this client.
- **Copies:** results are copies; mutating them no longer changes what the next caller gets.
- **GraphQL:** mutations and responses with `errors` are not cached. `graphql` is loaded lazily, so the main entry no longer needs it installed.

### Page links and assets

- Links were resolved inside the HTTP client with one default-locale map fetched **without credentials**. Now they are resolved after the cache, per call, in the **requested locale**, from **published pages only**, fetched with the client's credentials. `getUnchainedContentItems`, writes and uploads are never resolved. Unsafe routes are skipped. With `cache: false`, maps are fetched per response containing a link (no fetch at creation).
- `getRouteForCollection()` uses the same per-locale published map (collections and singletons).
- **Asset rewriting is narrower:** before, every `"path":"/..."` value and any `src`/`href` containing `storage` (case-insensitive) was rewritten. Now only asset objects' `path` and `src`/`href` starting with `/storage/`, `/:<space>/storage/` or `/.spaces/<space>/storage/`.

### Errors and requests

- HTTP errors are `CockpitHttpError` with a short message; the body moved to `error.cause`:

  ```ts
  // Before: Error("Cockpit: Error accessing https://cms.example.com/api/content/items/posts?locale=default (500): <body>")
  // After:  CockpitHttpError("Cockpit: Error accessing /api/content/items/posts (500)")
  if (error instanceof CockpitHttpError && error.status >= 500) { /* error.cause.body */ }
  ```

- **Timeouts:** requests time out after 15 s by default (`timeout` / `COCKPIT_TIMEOUT`, `0` disables). Previously there was none.
- **`useAdminAccess` without an API key throws** instead of sending an unauthenticated request. An empty `apiKey: ""` counts as missing and falls back to the env vars.
- **Requests with credentials never follow redirects** (`redirect: "error"`), in the main client and in `/fetch` (with `apiKey` or `headers`).
- **Validation:** ids and model/menu/index/project names are validated for every method (`pageById`, `pagesMenu`, `assetById`, `imageAssetById`, `search`, `localize` were not before), and every request path is checked for traversal. Messages changed, e.g. `Please provide a model` → `Please provide model`, `Please provide a page id` → `Please provide page id`.
- Invalid `COCKPIT_CACHE_MAX` / `COCKPIT_TIMEOUT` values throw at creation (`COCKPIT_CACHE_MAX` only for the built-in store).

### `/fetch`

- **`defaultLanguage` defaults to `null`** (was `"de"`). Keep the old behavior with `createFetchClient({ endpoint, defaultLanguage: "de" })`.
- `tenant`, `id` and `model` are validated; `fetchRaw` paths are validated (pass the query via `params`).
- `locale`, `populate` and `route` can't be overridden by extra params.
- HTTP errors are `CockpitHttpError` (message with the path instead of the full URL, `status`, `cause.body`); 15 s default timeout.

### `/schema`

- **Tenant allowlist:** only `allowedTenants` (default: tenants with a `COCKPIT_SECRET_<TENANT>` env var) can be selected; tenants are lower-cased.

  ```ts
  // Tenants without a COCKPIT_SECRET_<TENANT> env var must be allowed explicitly
  await makeCockpitGraphQLSchema({ allowedTenants: ["tenant-a", "tenant-b"] });
  ```

- **`cockpitOptions.apiKey` is no longer sent to tenants:**

  ```ts
  await makeCockpitGraphQLSchema({ apiKey: () => process.env.SHARED_KEY });
  ```

- `filterMutations` is enforced in the executor too, and the Mutation type is removed instead of left empty.
- Pooled clients share one LRU store; `cache.max` limits the whole pool (default 1000 entries). A failed client creation is retried on the next request.

### Peer dependencies

`graphql` 17 is supported.

## License

MIT. See [LICENSE](LICENSE).
