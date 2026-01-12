# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build    # Compile TypeScript to dist/
npm test         # Run tests using Node.js test runner
```

## Environment Variables

All options fall back to environment variables when not explicitly provided:

- `COCKPIT_GRAPHQL_ENDPOINT` - Cockpit CMS GraphQL endpoint URL
- `COCKPIT_SECRET` - Default API key (used when `useAdminAccess: true`)
- `COCKPIT_SECRET_<TENANT>` - Tenant-specific API keys (e.g., `COCKPIT_SECRET_MYTENANT`)
- `COCKPIT_CACHE_MAX` - Max cache entries (default: 100)
- `COCKPIT_CACHE_TTL` - Cache TTL in milliseconds (default: 100000)

## Architecture

TypeScript library (`@unchainedshop/cockpit-api`) for Cockpit CMS. ESM module targeting Node.js 20.

### Directory Structure

```
src/
├── client.ts              # CockpitAPI factory function
├── cockpit-logger.ts      # Logger using @unchainedshop/logger
├── index.ts               # Public exports
├── core/
│   ├── config.ts          # Configuration management
│   ├── cache.ts           # LRU cache wrapper
│   ├── http.ts            # HTTP client with auth
│   ├── url-builder.ts     # URL construction
│   └── query-string.ts    # Query parameter encoding
├── methods/
│   ├── content.ts         # Content CRUD operations
│   ├── pages.ts           # Pages API
│   ├── menus.ts           # Menu API
│   ├── routes.ts          # Routes, sitemap, settings
│   ├── assets.ts          # Asset operations
│   ├── graphql.ts         # GraphQL method
│   ├── search.ts          # Search (Detektivo addon)
│   ├── localize.ts        # Localization (Lokalize addon)
│   └── system.ts          # Health check, cache clearing
├── transformers/
│   └── image-path.ts      # Response path transformation
├── utils/
│   ├── tenant.ts          # Tenant ID resolution
│   └── route-map.ts       # Route replacement generation
└── __tests__/
    └── test-helpers.ts    # Test utilities
```

### Key Patterns

**Configuration with fallbacks**: `CockpitAPI(options?)` accepts optional config. All options fall back to environment variables (e.g., `COCKPIT_GRAPHQL_ENDPOINT`, `COCKPIT_CACHE_MAX`).

**No shared state**: Each client instance has its own LRU cache. No singletons or module-level mutable state.

**Multi-tenant**: Optional `tenant` option. Requests use `/:${tenant}/api/...` path pattern. Looks for `COCKPIT_SECRET_<TENANT>` env vars.

**Response transformation**: `FixImagePaths(endpoint, replacements, tenant?)` fixes asset paths and resolves `pages://id` links.

**Locale handling**: Default locale "de" maps to "default" internally. Locale passed via options objects.

**Error handling**: HTTP errors throw `Error`. 404 returns `null`. Errors prefixed with "Cockpit:".

## API Methods

**Content:**
- `getContentItem<T>({ model, id?, locale?, queryParams? })`
- `getContentItems<T>(model, { limit?, skip?, sort?, filter?, fields?, populate?, locale? })`
- `getContentTree<T>(model, { parent?, filter?, fields?, populate?, locale? })`
- `getAggregateModel<T>({ model, pipeline, locale? })`
- `getSingleton<T>(model, { locale?, populate? })`
- `postContentItem<T>(model, item)`
- `deleteContentItem<T>(model, id)`

**Pages:**
- `pages<T>({ limit?, skip?, sort?, filter?, fields?, locale? })`
- `pageById<T>({ page, id, locale?, populate? })`
- `pageByRoute<T>(route, { locale?, populate? })`

**Menus:**
- `pagesMenus<T>({ locale?, inactive? })`
- `pagesMenu<T>(name, { locale?, inactive? })`

**Routes:**
- `pagesRoutes<T>(locale?)`
- `pagesSitemap<T>()`
- `pagesSetting<T>(locale?)`

**Other:**
- `search<T>({ index, q?, limit?, offset? })` - Detektivo addon
- `localize<T>(projectName, { locale?, nested? })` - Lokalize addon
- `assetById<T>(assetId)`
- `imageAssetById<T>(assetId, { m?, w?, h?, q?, mime? })`
- `graphQL<T>(document, variables?)`
- `healthCheck<T>()`
- `clearCache(pattern?)`
- `getFullRouteForSlug(slug)`

## Exported Types

**Client:**
```typescript
CockpitAPIClient, CockpitAPIOptions, CacheManager, CacheOptions
```

**Query Options:**
```typescript
ListQueryOptions, ContentItemQueryOptions, ContentListQueryOptions,
TreeQueryOptions, AggregateQueryOptions, PageQueryOptions,
PageByRouteOptions, MenuQueryOptions, LocalizeOptions,
SearchQueryOptions, ImageAssetQueryParams
```

**Response Types:**
```typescript
CockpitAsset, CockpitPage, CockpitPageMeta, CockpitPageSeo,
CockpitPageType, CockpitLayoutBlock, CockpitMenu, CockpitMenuUrl,
CockpitMenuLink, CockpitRoute, CockpitRoutesResponse,
CockpitSitemapEntry, CockpitSettings, CockpitPreviewConfig,
CockpitContentItem, CockpitNewsItem, CockpitTreeNode,
CockpitSearchResult, CockpitSearchHit, CockpitHealthCheck
```

**Enums:**
```typescript
ImageSizeMode, MimeType
```

**Utilities:**
```typescript
getTenantIds, generateCmsRouteReplacements,
generateCollectionAndSingletonSlugRouteMap,
FixImagePaths, createImagePathTransformer, identityTransformer,
ResponseTransformer, MethodContext
```

## v2.0.0 Breaking Changes

- `lokalize()` renamed to `localize()`
- Methods use options objects instead of positional parameters
- HTTP errors throw instead of returning `null` (404 still returns `null`)
- Each client has its own cache (no shared singleton)
