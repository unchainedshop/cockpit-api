# Cockpit API

[![npm version](https://img.shields.io/npm/v/@unchainedshop/cockpit-api.svg)](https://www.npmjs.com/package/@unchainedshop/cockpit-api)
[![CI](https://github.com/unchainedshop/cockpit-api/actions/workflows/ci.yml/badge.svg)](https://github.com/unchainedshop/cockpit-api/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

A TypeScript client for interacting with [Cockpit CMS](https://github.com/Cockpit-HQ/Cockpit), including GraphQL requests, content management, and schema stitching support.

## Installation

```sh
npm install --save @unchainedshop/cockpit-api
```

## Package Exports

This package provides three entry points:

| Export | Description |
|--------|-------------|
| `@unchainedshop/cockpit-api` | Full-featured async API client with caching and response transformation |
| `@unchainedshop/cockpit-api/schema` | GraphQL schema stitching utilities |
| `@unchainedshop/cockpit-api/fetch` | Lightweight client for edge/RSC environments |

## Quick Start

### Main Client

```typescript
import { CockpitAPI } from '@unchainedshop/cockpit-api';

// With explicit endpoint
const cockpit = await CockpitAPI({
  endpoint: 'https://your-cockpit-instance.com/api/graphql',
});

// Or using environment variables
const cockpit = await CockpitAPI();  // Uses COCKPIT_GRAPHQL_ENDPOINT
```

### Lightweight Fetch Client (Edge/RSC)

```typescript
import { createFetchClient } from '@unchainedshop/cockpit-api/fetch';

// Synchronous initialization - no await needed
const cockpit = createFetchClient({
  endpoint: process.env.NEXT_PUBLIC_COCKPIT_ENDPOINT,
  tenant: 'mytenant',
  cache: 'force-cache',  // Uses platform caching
});

const page = await cockpit.pageByRoute('/about', { locale: 'en' });
```

### GraphQL Schema Stitching

```typescript
import { makeCockpitGraphQLSchema } from '@unchainedshop/cockpit-api/schema';
import { stitchSchemas } from '@graphql-tools/stitch';

const cockpitSchema = await makeCockpitGraphQLSchema({
  tenantHeader: 'x-cockpit-space',
  filterMutations: true,
});

const gatewaySchema = stitchSchemas({
  subschemas: [{ schema: cockpitSchema }],
});
```

## Main Client API

### GraphQL Requests

```typescript
import { gql } from 'graphql-tag';

const query = gql`
  query {
    allPosts {
      title
      content
    }
  }
`;

const result = await cockpit.graphQL(query, {});
```

### Content Operations

```typescript
// Get a single content item
const post = await cockpit.getContentItem({ model: 'posts', id: '123' });

// With locale and field selection
const localizedPost = await cockpit.getContentItem({
  model: 'posts',
  id: '123',
  locale: 'en',
  queryParams: { fields: { title: 1, content: 1 } }
});

// Get multiple content items - always returns { data, meta? }
const response = await cockpit.getContentItems('posts', {
  limit: 10,
  sort: { _created: -1 },
  filter: { published: true }
});
// response: { data: Post[], meta?: { total: number } } | null

// Access items and metadata
const items = response?.data || [];
const total = response?.meta?.total;

// Get tree structure
const tree = await cockpit.getContentTree('categories', {
  parent: 'root-id',
  populate: 2
});

// Aggregation pipeline
const stats = await cockpit.getAggregateModel({
  model: 'orders',
  pipeline: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
});

// Create content item
const newPost = await cockpit.postContentItem('posts', { title: 'New Post' });

// Delete content item
await cockpit.deleteContentItem('posts', '123');
```

### Pages

```typescript
// List pages - always returns { data, meta? }
const response = await cockpit.pages({ locale: 'en', limit: 50 });
const allPages = response?.data || [];
const total = response?.meta?.total;

// Get page by ID
const page = await cockpit.pageById({ page: 'blog', id: '123', locale: 'en' });

// Get page by route
const aboutPage = await cockpit.pageByRoute('/about', { locale: 'en', populate: 2 });
```

### Menus

```typescript
// Get all menus
const menus = await cockpit.pagesMenus({ locale: 'en' });

// Get specific menu
const mainMenu = await cockpit.pagesMenu('main-navigation', { locale: 'en' });
```

### Routes & Sitemap

```typescript
const routes = await cockpit.pagesRoutes('en');
const sitemap = await cockpit.pagesSitemap();
const settings = await cockpit.pagesSetting('en');
const fullRoute = await cockpit.getFullRouteForSlug('my-slug');
```

### Search (Detektivo addon)

```typescript
const results = await cockpit.search({
  index: 'products',
  q: 'search term',
  limit: 10,
  offset: 0
});
```

### Localization (Lokalize addon)

```typescript
const translations = await cockpit.localize('my-project', {
  locale: 'en',
  nested: true
});
```

### Assets

```typescript
import { ImageSizeMode, MimeType } from '@unchainedshop/cockpit-api';

// Get asset metadata
const asset = await cockpit.assetById('asset-id');

// Get transformed image
const image = await cockpit.imageAssetById('asset-id', {
  m: ImageSizeMode.BestFit,
  w: 800,
  h: 600,
  q: 80,
  mime: MimeType.WEBP
});
```

### System

```typescript
// Health check
const health = await cockpit.healthCheck();

// Clear cache (async in v2.2.0+)
await cockpit.clearCache();  // Clear all
await cockpit.clearCache('pages');  // Clear by pattern
```

## Lightweight Fetch Client API

The fetch client is designed for edge/RSC environments with minimal overhead:

```typescript
import { createFetchClient } from '@unchainedshop/cockpit-api/fetch';

const cockpit = createFetchClient({
  endpoint: process.env.NEXT_PUBLIC_COCKPIT_ENDPOINT,
  tenant: 'mytenant',
  cache: 'force-cache',
  apiKey: 'your-api-key',
  headers: { 'X-Custom-Header': 'value' }
});

// Available methods
const page = await cockpit.pageByRoute('/about', { locale: 'en' });

// List methods return { data, meta? }
const pagesResponse = await cockpit.pages({ locale: 'en' });
const pages = pagesResponse?.data || [];

const pageById = await cockpit.pageById('blog', '123', { locale: 'en' });

const itemsResponse = await cockpit.getContentItems('news', { locale: 'en', limit: 10 });
const items = itemsResponse?.data || [];

const item = await cockpit.getContentItem('news', '123', { locale: 'en' });
const custom = await cockpit.fetchRaw('/custom/endpoint', { param: 'value' });
```

## Schema Stitching API

For building GraphQL gateways with Cockpit:

```typescript
import { makeCockpitGraphQLSchema, createRemoteExecutor } from '@unchainedshop/cockpit-api/schema';

// Create schema for stitching
const schema = await makeCockpitGraphQLSchema({
  tenantHeader: 'x-cockpit-space',
  filterMutations: true,
  transforms: [],  // Additional GraphQL transforms
  extractTenant: (ctx) => ctx.req?.headers['x-tenant'],
  cockpitOptions: {
    endpoint: 'https://cms.example.com/api/graphql',
    apiKey: 'your-api-key',
    useAdminAccess: true
  }
});

// Or use the executor directly for custom implementations
const executor = createRemoteExecutor({
  tenantHeader: 'x-cockpit-space',
  cockpitOptions: { endpoint: '...' }
});
```

## Configuration Options

```typescript
const cockpit = await CockpitAPI({
  endpoint: 'https://...',      // Falls back to COCKPIT_GRAPHQL_ENDPOINT
  tenant: 'mytenant',           // Optional: for multi-tenant setups
  apiKey: 'your-api-key',       // Falls back to COCKPIT_SECRET env var
  useAdminAccess: true,         // Optional: inject api-Key header
  defaultLanguage: 'de',        // Language that maps to Cockpit's "default" locale (default: "de")
  preloadRoutes: true,          // Optional: preload route replacements
  cache: {
    max: 100,                   // Falls back to COCKPIT_CACHE_MAX (default: 100)
    ttl: 100000,                // Falls back to COCKPIT_CACHE_TTL (default: 100000)
    store: customStore,         // Optional: custom async cache store (Redis, Keyv, etc.)
  },
  // Or disable caching entirely
  // cache: false,
});
```

## Environment Variables

```bash
COCKPIT_GRAPHQL_ENDPOINT=https://your-cockpit-instance.com/api/graphql
COCKPIT_SECRET=your-api-key                # Default API key
COCKPIT_SECRET_MYTENANT=tenant-api-key     # Tenant-specific API key
COCKPIT_CACHE_MAX=100                      # Max cache entries (default: 100)
COCKPIT_CACHE_TTL=100000                   # Cache TTL in ms (default: 100000)
```

## Multi-Tenant Support

```typescript
// Tenant-specific client
const cockpit = await CockpitAPI({
  endpoint: 'https://cms.example.com/api/graphql',
  tenant: 'mytenant',  // Requests use /:mytenant/api/... path
});

// Resolve tenant from URL
import { resolveTenantFromUrl, getTenantIds } from '@unchainedshop/cockpit-api';

const { tenant, slug } = resolveTenantFromUrl('https://mytenant.example.com/page');
const allTenants = getTenantIds();  // From COCKPIT_SECRET_* env vars
```

## Custom Cache Stores

v2.2.0+ supports pluggable async cache stores for Redis, Keyv, or custom implementations:

```typescript
import { createClient } from 'redis';
import type { AsyncCacheStore } from '@unchainedshop/cockpit-api';

// Redis example
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

const cockpit = await CockpitAPI({
  endpoint: 'https://cms.example.com/api/graphql',
  cache: { store: redisStore }
});
```

## Response Format (v3.0.0+)

All list methods return a **consistent response format** regardless of parameters:

```typescript
interface CockpitListResponse<T> {
  data: T[];
  meta?: CockpitListMeta;  // Present when using pagination (skip parameter)
}
```

### Methods with Consistent Response Format

- `getContentItems()` - Always returns `CockpitListResponse<T> | null`
- `pages()` - Always returns `CockpitListResponse<T> | null`
- Fetch client methods - Always return `CockpitListResponse<T> | null`

### Usage Example

```typescript
import type { CockpitListResponse } from '@unchainedshop/cockpit-api';

// Always get { data, meta? } format
const response = await cockpit.getContentItems('posts', { limit: 10, skip: 0 });

// Access items
const items = response?.data || [];

// Access metadata (available when using skip parameter)
const total = response?.meta?.total;
```

**Benefits:**
- No need to check if response is array or object
- Predictable type signatures
- Easier to work with pagination

## TypeScript Support

```typescript
import type {
  // Client
  CockpitAPIClient,
  CockpitAPIOptions,
  CacheManager,
  CacheOptions,
  AsyncCacheStore,

  // Query Options
  ContentItemQueryOptions,
  ContentListQueryOptions,
  TreeQueryOptions,
  PageQueryOptions,
  SearchQueryOptions,
  ImageAssetQueryParams,

  // Response Types
  CockpitPage,
  CockpitAsset,
  CockpitMenu,
  CockpitRoute,
  CockpitSearchResult,
  CockpitContentItem,
  CockpitListResponse,   // New: for paginated content responses
  CockpitListMeta,       // New: metadata in paginated responses

  // Schema Types
  MakeCockpitSchemaOptions,
  CockpitExecutorContext,

  // Fetch Types
  FetchClientOptions,
  FetchCacheMode,
} from '@unchainedshop/cockpit-api';

import { ImageSizeMode, MimeType } from '@unchainedshop/cockpit-api';
```

## Breaking Changes

### v2.0.0

- `lokalize()` renamed to `localize()`
- Methods use options objects instead of positional parameters
- HTTP errors now throw instead of returning `null` (404 still returns `null`)
- Each client instance has its own cache (no shared state)

### v2.1.0 (New Features)

- `/schema` subpackage for GraphQL schema stitching
- `/fetch` subpackage for lightweight edge/RSC environments
- `preloadRoutes` option for preloading route replacements
- `defaultLanguage` option to configure which language maps to Cockpit's "default" locale
- Expanded tenant utilities: `resolveTenantFromUrl()`, `resolveTenantFromSubdomain()`

### v2.2.0 (Breaking Changes)

**Async Cache Operations:**
- All cache operations are now async and return Promises
- `await cockpit.clearCache()` is now required (was synchronous in v2.1.x)
- Custom cache stores can be provided via `cache.store` option
- Cache can be explicitly disabled with `cache: false`

**Migration:**
```typescript
// Before (v2.1.x)
cockpit.clearCache();
cockpit.clearCache('ROUTE');

// After (v2.2.0)
await cockpit.clearCache();
await cockpit.clearCache('ROUTE');
```

### v3.0.0 (Breaking Changes)

**Consistent List Response Format:**

All list methods now return `CockpitListResponse<T> | null` instead of varying between arrays and wrapped responses:

**Changed Methods:**
- `getContentItems()` - Now always returns `{ data: T[], meta?: {...} } | null`
- `pages()` - Now always returns `{ data: T[], meta?: {...} } | null`
- Fetch client `getContentItems()` and `pages()` - Now always return `{ data: T[], meta?: {...} } | null`

**Migration:**
```typescript
// Before (v2.x)
const items = await cockpit.getContentItems('posts', { limit: 10 });
// items could be Post[] or null

const pages = await cockpit.pages({ limit: 10 });
// pages could be Page[] or null

// After (v3.0.0)
const itemsResponse = await cockpit.getContentItems('posts', { limit: 10 });
const items = itemsResponse?.data || [];
const total = itemsResponse?.meta?.total;

const pagesResponse = await cockpit.pages({ limit: 10 });
const pages = pagesResponse?.data || [];
const total = pagesResponse?.meta?.total;
```

**Benefits:**
- Single, predictable return type for all list methods
- No need to check `Array.isArray()` or normalize responses
- Cleaner TypeScript types
- Metadata always accessible via `.meta` property

**TreeQueryOptions Type Correction:**

`TreeQueryOptions` no longer incorrectly includes `limit` and `skip` parameters (which were always ignored). Tree structures use `parent`, `populate`, `filter`, and `fields` instead.

```typescript
// Before (v2.x) - allowed but ignored
await cockpit.getContentTree('categories', { limit: 10 });  // ❌ TypeScript allowed this

// After (v3.0.0) - TypeScript prevents invalid usage
await cockpit.getContentTree('categories', {
  parent: 'root-id',  // ✅ Correct
  populate: 2,        // ✅ Correct
  filter: { active: true }  // ✅ Correct
});
```

## Peer Dependencies

- `graphql` (optional) - Required for the `graphQL()` method
- `@graphql-tools/wrap` (optional) - Required for the `/schema` subpackage

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
