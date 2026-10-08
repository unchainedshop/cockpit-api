# CLAUDE.md

Guidance for Claude Code when working in this repository. User-facing API, options, caching semantics and the v3 migration guide live in [README.md](README.md); keep it in sync when behavior or the public surface changes.

## Commands

```bash
npm run build             # tsc -> dist/
npm test                  # unit tests (node:test, --experimental-transform-types, coverage)
npm run test:watch
npm run test:integration  # src/__tests__/*.test.ts against a real Cockpit; skipped unless
                          # COCKPIT_TEST_ENDPOINT is set (optional: COCKPIT_TEST_SECRET,
                          # COCKPIT_TEST_TENANT, COCKPIT_TEST_SEARCH_INDEX, COCKPIT_TEST_LOKALIZE_PROJECT)
npm run typecheck         # tsc -p tsconfig.test.json (sources + tests)
npm run lint              # eslint src (strictTypeChecked + prettier); lint:fix to fix
```

ESM, TypeScript, Node >= 25. Sources import each other with `.ts` extensions.

## Architecture

Three entry points: `.` (full client), `./fetch` (edge/RSC client), `./schema` (GraphQL gateway).

```
src/
├── index.ts               # main entry: public exports only
├── client.ts              # CockpitAPI(): config -> cache -> url -> http(+asset fixer) -> links -> methods
├── links.ts               # pages:// resolution, per-locale route maps (SWR-cached), findPageLinks
├── cockpit-logger.ts      # @unchainedshop/logger instance, warnOnce()
├── core/
│   ├── config.ts          # options + env fallbacks, accessCacheScope, cachePrefix
│   ├── cache.ts           # CacheManager (SWR, copies, inflight dedupe), createLRUCacheStore
│   ├── http.ts            # fetch wrapper: auth, redirects, timeout, transform (re-exports CockpitHttpError)
│   ├── errors.ts          # EDGE-SAFE, no imports: CockpitHttpError, requestError() (timeout / refused redirect)
│   └── url.ts             # EDGE-SAFE: path validation, assertSafePath, query strings, locales
├── methods/
│   ├── context.ts         # MethodContext, segment(), withTyped(), legacyLocale(), cacheKey(), get(), withLinks()
│   ├── content.ts         # content CRUD, contentCachePrefixes (write invalidation)
│   ├── pages.ts  menus.ts  routes.ts  assets.ts  graphql.ts  search.ts  localize.ts
│   └── system.ts          # healthCheck, clearCache, clearRouteCache (ROUTE_CACHE_PREFIXES)
├── transformers/assets.ts # createAssetFixer: asset object paths + storage src/href
├── utils/
│   ├── tenant.ts          # getTenantIds, resolveApiKey, resolveTenantFromUrl
│   └── url-protocols.ts   # parseCockpitUrl, extractPageId, extractAssetId
├── fetch/                 # createFetchClient (index.ts, client.ts)
├── schema/                # executor.ts (pooled clients, tenant allowlist), schema-builder.ts
└── __tests__/             # integration.test.ts, test-helpers.ts
```

Every main-client read goes through `get()` in `methods/context.ts`: build URL (validated) -> `cacheKey()` -> `cache.swr()` -> `withLinks()`. Asset paths are fixed in `http.ts` before caching; page links are resolved after the cache.

## Invariants (do not break)

- **Paths:** every id/name in a path goes through `segment()` / `validatePathSegment()` (`^[a-zA-Z0-9_-]+$`), and every request URL is built by `createUrlBuilder().build()`, which calls `assertSafePath()` and rejects any parser normalization. Never concatenate URLs elsewhere.
- **Credentials never follow redirects:** a request with `api-Key` (main client) or with `apiKey`/`headers` (`/fetch`) sets `redirect: "error"`; the resulting fetch failure is mapped by `requestError()` to `Cockpit: refusing to follow redirect for authenticated request (<path>)`.
- **Timeouts:** one `AbortSignal.timeout` covers request and body read (both inside the `try` that maps errors via `requestError()`, in both clients); default 15 s (`DEFAULT_TIMEOUT_MS`), `0` disables.
- **`queryParams` vs typed options:** merge with `withTyped()`: typed options win only when defined, so `undefined` never drops a `queryParams` key.
- **Admin access without a key throws**; never downgrade to a public request. A tenant never falls back to `COCKPIT_SECRET`.
- **Page links** are resolved after the cache, per call, in the request's normalized locale, from the **published-only** route map, fetched through the client's own `http` (credentials, tenant, timeout) and cached under `ROUTE_MAPS:v4:<locale>`. Bump the version when the map shape changes. Link resolution never throws.
- **Writes** (`postContentItem`, `deleteContentItem`) invalidate the model's prefixes (`contentCachePrefixes`) and never resolve links; neither do `getUnchainedContentItems` (also never cached) and `uploadAssets`. Invalidation failures are logged, not thrown.
- **Cache keys** are `<api path>|<access scope>|<sha1 of sorted query>` under `cockpit-api:<endpoint>:<tenant>:<client scope>:`. The query carries the normalized locale. The `|` after the path keeps prefix clears exact. Never put a raw API key in a key (`admin-<sha256 prefix>`).
- **Copies:** `CacheManager` `structuredClone`s on write and on every read (including joined in-flight fetches); callers own what they get, and link/asset rewriting mutates owned values in place.
- **Bounded staleness:** fresh -> serve; stale -> serve + one deduped background refresh; cold/expired -> wait, errors propagate. 401/403 and 404 expire existing data (tombstone `data: null`). Nothing is served past `staleUntil`. Only the fetch registered in `inflight` may write back; `clear()` drops pending ones.
- **`/fetch` is edge-safe:** at runtime it may import only `core/url.ts` and the import-free `core/errors.ts` (type-only imports elsewhere are fine). No `node:*`, no logger, no cache.
- **Gateway:** tenants are lower-cased, validated and checked against `allowedTenants` before a pooled client is created; `cockpitOptions.apiKey` is only used for the default space.
- `graphql` and `@graphql-tools/wrap` are optional peers: the main entry loads `graphql` lazily inside `graphQL()`.

## Conventions

- Tests sit next to sources (`*.test.ts`), use `node:test` + `node:assert`, and are table-driven where cases repeat (`for (const [...] of cases) it(...)`).
- Mock `fetch` with `createMockResponse()` from `src/__tests__/test-helpers.ts`; its `json()` returns a fresh `structuredClone` per call like a real `Response`. Inspect calls with `fetchCall` / `fetchUrl` / `fetchUrls`.
- Library errors start with `Cockpit:`; HTTP errors are `CockpitHttpError` (short message, body in `cause`); 404 resolves to `null`.
- No module-level mutable state besides the lazy `graphql` import and `warnOnce()`'s set of warned keys; every client owns its cache manager and in-flight map.
- Removed v2 usage gets a `warnOnce()` warning: options `preloadRoutes`, `cache.ttl` / `maxSize` / `memoryLayer` (ignored); a string locale argument to `pageByRoute` / `pagesMenus` / `pagesMenu` is honored as `{ locale }` (`legacyLocale()`).
- Keep comments short and about why. Public types are exported from the entry `index.ts` files only.
