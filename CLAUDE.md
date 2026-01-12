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

## v2.1.3 (Features)

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

## v2.2.0 (Breaking Changes)

### Async Cache Operations

All cache operations are now async and return Promises. This enables support for external cache stores like Redis and Keyv.

**Before (v2.1.x)**:
```typescript
client.clearCache();
client.clearCache('ROUTE');
```

**After (v2.2.0)**:
```typescript
await client.clearCache();
await client.clearCache('ROUTE');
```

**Impact**: Any code calling `clearCache()` must now `await` the result.

### Custom Cache Store Support

v2.2.0 adds pluggable async cache support. You can now provide custom cache implementations:

#### Redis Example

```typescript
import { createClient } from 'redis';
import type { AsyncCacheStore } from '@unchainedshop/cockpit-api';

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const redisStore: AsyncCacheStore = {
  async get(key: string) {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : undefined;
  },
  async set(key: string, value: unknown) {
    await redisClient.set(key, JSON.stringify(value), { EX: 100 });
  },
  async clear(pattern?: string) {
    if (pattern) {
      const keys = await redisClient.keys(`${pattern}*`);
      if (keys.length > 0) await redisClient.del(keys);
    } else {
      await redisClient.flushDb();
    }
  }
};

const client = await CockpitAPI({
  endpoint: 'https://cms.example.com/api/graphql',
  cache: { store: redisStore }
});
```

#### Keyv Example

```typescript
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import type { AsyncCacheStore } from '@unchainedshop/cockpit-api';

const keyv = new Keyv({
  store: new KeyvRedis(process.env.REDIS_URL)
});

const keyvStore: AsyncCacheStore = {
  async get(key: string) {
    return await keyv.get(key);
  },
  async set(key: string, value: unknown) {
    await keyv.set(key, value, 100000); // 100000ms TTL
  },
  async clear(pattern?: string) {
    if (!pattern) {
      await keyv.clear();
    }
    // Note: Keyv doesn't have native pattern matching
    // Pattern matching requires custom implementation
  }
};

const client = await CockpitAPI({
  endpoint: 'https://cms.example.com/api/graphql',
  cache: { store: keyvStore }
});
```

### Disabling Cache

You can now explicitly disable caching:

```typescript
const client = await CockpitAPI({
  endpoint: 'https://cms.example.com/api/graphql',
  cache: false  // Disables all caching
});
```

### Migration Guide: v2.1.x → v2.2.0

#### 1. Update clearCache() Calls

All `clearCache()` calls must now be awaited:

```typescript
// Before (v2.1.x)
client.clearCache();
client.clearCache('ROUTE');

// After (v2.2.0)
await client.clearCache();
await client.clearCache('ROUTE');
```

#### 2. Update Tests with Mock Cache

If your tests mock the cache, update them to use async operations:

```typescript
// Before (v2.1.x)
const mockCache = {
  get: (key) => store.get(key),
  set: (key, value) => store.set(key, value),
  clear: () => store.clear()
};

// After (v2.2.0)
const mockCache = {
  get: async (key) => store.get(key),
  set: async (key, value) => store.set(key, value),
  clear: async () => store.clear()
};
```

#### 3. Error Handling

Cache errors now propagate as rejected promises. Wrap cache operations in try-catch if you need custom error handling:

```typescript
try {
  await client.clearCache();
} catch (error) {
  console.error('Failed to clear cache:', error);
}
```

### Important Notes

- **TTL Behavior**: The default LRU cache handles TTL automatically. Custom stores must implement their own TTL logic (e.g., Redis `EX` option).

- **Pattern Matching**: Pattern matching in `clear(pattern)` is implementation-specific. The default LRU store uses `startsWith()` matching. Redis uses glob patterns (`*`, `?`, `[]`). Custom stores should document their pattern matching behavior.

- **Serialization**: The default LRU stores objects directly in memory (no serialization). External stores like Redis must serialize data (typically using JSON.stringify/parse). Custom stores are responsible for their own serialization.

- **Environment Variables**: `COCKPIT_CACHE_MAX` and `COCKPIT_CACHE_TTL` are only used when no custom cache store is provided. They are ignored when using a custom store.

- **No-Op Cache**: When `cache: false`, all cache operations become no-ops but still return Promises for API consistency.
