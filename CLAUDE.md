# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build    # Compile TypeScript to dist/
npm test         # Run tests using Node.js test runner
npm run test:watch  # Run tests in watch mode
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

### Package Exports

The package provides three entry points:

1. **Main** (`@unchainedshop/cockpit-api`) - Full-featured async API client with caching and response transformation
2. **Schema** (`@unchainedshop/cockpit-api/schema`) - GraphQL schema stitching utilities (requires `@graphql-tools/wrap` peer dependency)
3. **Fetch** (`@unchainedshop/cockpit-api/fetch`) - Lightweight synchronous client for edge/RSC environments

### Directory Structure

```
src/
├── client.ts              # CockpitAPI factory function (async initialization)
├── cockpit-logger.ts      # Logger using @unchainedshop/logger
├── index.ts               # Main package exports
├── core/
│   ├── index.ts           # Core module exports
│   ├── config.ts          # Configuration management
│   ├── cache.ts           # LRU cache wrapper
│   ├── http.ts            # HTTP client with auth & transformation
│   ├── url-builder.ts     # URL construction
│   └── query-string.ts    # Query parameter encoding
├── methods/
│   ├── index.ts           # Method module exports
│   ├── content.ts         # Content CRUD operations
│   ├── pages.ts           # Pages API
│   ├── menus.ts           # Menu API
│   ├── routes.ts          # Routes, sitemap, settings
│   ├── assets.ts          # Asset operations
│   ├── graphql.ts         # GraphQL method
│   ├── search.ts          # Search (Detektivo addon)
│   ├── localize.ts        # Localization (Lokalize addon)
│   └── system.ts          # Health check, cache clearing
├── schema/
│   ├── index.ts           # Schema stitching exports
│   ├── types.ts           # Schema types
│   ├── executor.ts        # Remote executor with client pooling
│   └── schema-builder.ts  # GraphQL schema builder
├── fetch/
│   ├── index.ts           # Lightweight client exports
│   ├── types.ts           # Fetch client types
│   └── client.ts          # Lightweight fetch client
├── transformers/
│   ├── index.ts           # Transformer exports
│   ├── image-path.ts      # Response path transformation
│   └── compose.ts         # Transformer composition
├── utils/
│   ├── index.ts           # Utility exports
│   ├── tenant.ts          # Tenant ID/URL resolution
│   └── route-map.ts       # Route replacement generation
└── __tests__/
    └── test-helpers.ts    # Test utilities
```

### Key Patterns

**Async initialization**: `CockpitAPI(options?)` returns a Promise. It optionally preloads route replacements for `pages://id` link resolution.

**Configuration with fallbacks**: All options fall back to environment variables (e.g., `COCKPIT_GRAPHQL_ENDPOINT`, `COCKPIT_CACHE_MAX`).

**No shared state**: Each client instance has its own LRU cache. No singletons or module-level mutable state.

**Multi-tenant**: Optional `tenant` option. Requests use `/:${tenant}/api/...` path pattern. Looks for `COCKPIT_SECRET_<TENANT>` env vars.

**Response transformation**: `createImagePathTransformer()` fixes asset paths and resolves `pages://id` links. Legacy `FixImagePaths()` available for backwards compatibility.

**Locale handling**: The configured `defaultLanguage` (defaults to "de") maps to Cockpit's "default" locale internally. Locale passed via options objects.

**Error handling**: HTTP errors throw `Error`. 404 returns `null`. Errors prefixed with "Cockpit:".

**Admin access**: Set `useAdminAccess: true` at factory level for all requests, or per-request to override. Per-request setting takes precedence over factory setting. Requires `apiKey` or `COCKPIT_SECRET` env var.

## API Methods (Main Client)

**Content:**
- `getContentItem<T>({ model, id?, locale?, queryParams?, useAdminAccess? })`
- `getContentItems<T>(model, { limit?, skip?, sort?, filter?, fields?, populate?, locale?, useAdminAccess? })`
- `getContentTree<T>(model, { parent?, filter?, fields?, populate?, locale?, useAdminAccess? })`
- `getAggregateModel<T>({ model, pipeline, locale? })`
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
- `imageAssetById<T>(assetId, { m?, w?, h?, q?, re?, t?, o?, mime? })`
- `graphQL<T>(document, variables?)`
- `healthCheck<T>()`
- `clearCache(pattern?)`
- `getFullRouteForSlug(slug)`

## Lightweight Fetch Client (`/fetch`)

For edge/RSC environments where the full client is too heavy:

```typescript
import { createFetchClient } from "@unchainedshop/cockpit-api/fetch";

const cockpit = createFetchClient({
  endpoint: process.env.NEXT_PUBLIC_COCKPIT_ENDPOINT,
  tenant: "mytenant",
  cache: "force-cache",  // Uses platform caching
});

// Available methods:
cockpit.pageByRoute<T>(route, { locale?, populate? })
cockpit.pages<T>({ locale?, ... })
cockpit.pageById<T>(page, id, { locale?, populate? })
cockpit.getContentItems<T>(model, { locale?, limit?, ... })
cockpit.getContentItem<T>(model, id?, { locale?, ... })
cockpit.fetchRaw<T>(path, params)  // For custom paths
```

## Schema Stitching (`/schema`)

For GraphQL schema stitching with `@graphql-tools/wrap`:

```typescript
import { makeCockpitGraphQLSchema } from "@unchainedshop/cockpit-api/schema";
import { stitchSchemas } from "@graphql-tools/stitch";

const cockpitSchema = await makeCockpitGraphQLSchema({
  tenantHeader: "x-cockpit-space",  // Header for multi-tenant support
  filterMutations: true,             // Read-only by default
  extractTenant: (ctx) => ctx.req?.headers["x-tenant"],  // Custom tenant extraction
  cockpitOptions: { endpoint, apiKey },
});

const gatewaySchema = stitchSchemas({
  subschemas: [{ schema: cockpitSchema }],
});
```

## Exported Types

**Main Package:**
```typescript
// Client
CockpitAPIClient, CockpitAPIOptions, CacheManager, CacheOptions

// Query Options
ListQueryOptions, ContentItemQueryOptions, ContentListQueryOptions,
TreeQueryOptions, AggregateQueryOptions, PageQueryOptions,
PageByRouteOptions, MenuQueryOptions, LocalizeOptions,
SearchQueryOptions, ImageAssetQueryParams

// Response Types
CockpitAsset, CockpitPage, CockpitPageMeta, CockpitPageSeo,
CockpitPageType, CockpitLayoutBlock, CockpitMenu, CockpitMenuUrl,
CockpitMenuLink, CockpitRoute, CockpitRoutesResponse,
CockpitSitemapEntry, CockpitSettings, CockpitPreviewConfig,
CockpitContentItem, CockpitNewsItem, CockpitTreeNode,
CockpitSearchResult, CockpitSearchHit, CockpitHealthCheck

// Enums
ImageSizeMode, MimeType

// Utilities
getTenantIds, resolveTenantFromUrl, resolveTenantFromSubdomain,
generateCmsRouteReplacements, generateCollectionAndSingletonSlugRouteMap,
FixImagePaths, createImagePathTransformer, composeTransformers,
identityTransformer, ResponseTransformer, MethodContext,
TenantUrlResult, ResolveTenantFromUrlOptions, ResolveTenantFromSubdomainOptions
```

**Schema Package (`/schema`):**
```typescript
makeCockpitGraphQLSchema, createRemoteExecutor,
MakeCockpitSchemaOptions, CockpitExecutorContext, ExecutorRequest, RemoteExecutor
```

**Fetch Package (`/fetch`):**
```typescript
createFetchClient, FetchClient,
FetchClientOptions, FetchCacheMode, PageFetchParams
```

## Peer Dependencies

- `graphql` (optional) - Required for `graphQL()` method
- `@graphql-tools/wrap` (optional) - Required for `/schema` subpackage

## v2.0.0 Breaking Changes

- `lokalize()` renamed to `localize()`
- Methods use options objects instead of positional parameters
- HTTP errors throw instead of returning `null` (404 still returns `null`)
- Each client has its own cache (no shared singleton)

## v2.1.0 New Features

- `/schema` subpackage for GraphQL schema stitching
- `/fetch` subpackage for lightweight edge/RSC environments
- `preloadRoutes` option for preloading route replacements during initialization
- `defaultLanguage` option to configure which language maps to Cockpit's "default" locale (defaults to "de")
- Expanded tenant utilities: `resolveTenantFromUrl()`, `resolveTenantFromSubdomain()`

## v2.1.3 Improvements

- **Flexible meta type**: `CockpitMenuLink.meta` now accepts both array and object formats
  - Type: `meta?: { key: string; value: string }[] | Record<string, string>`
  - Supports both formats that Cockpit CMS may return depending on configuration
  - No transformation applied - consumers can handle as needed
  - Helper function example for transforming arrays to objects:
    ```typescript
    function transformMeta(meta?: { key: string; value: string }[] | Record<string, string>) {
      if (!meta) return {};
      if (Array.isArray(meta)) {
        return meta.reduce((acc, { key, value }) => {
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>);
      }
      return meta;
    }

    // Usage
    const metaObj = transformMeta(link.meta);
    const layout = metaObj.layout;
    ```
