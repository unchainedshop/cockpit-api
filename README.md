# Cockpit API

A TypeScript client for interacting with Cockpit CMS, including GraphQL requests and content management.

## Installation

```sh
npm install --save @unchainedshop/cockpit-api
```

## Usage

### Initialization

```typescript
import { CockpitAPI } from '@unchainedshop/cockpit-api';

// With explicit endpoint
const cockpit = await CockpitAPI({
  endpoint: 'https://your-cockpit-instance.com/api/graphql',
});

// Or using environment variables
const cockpit = await CockpitAPI();  // Uses COCKPIT_GRAPHQL_ENDPOINT
```

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

// Get multiple content items with pagination
const posts = await cockpit.getContentItems('posts', {
  limit: 10,
  skip: 0,
  sort: { _created: -1 },
  filter: { published: true }
});

// Get singleton content
const settings = await cockpit.getSingleton('siteSettings', { locale: 'en' });
```

### API Methods

**Content:**
- `getContentItem<T>({ model, id?, locale?, queryParams? })` - Get single content item
- `getContentItems<T>(model, { limit?, skip?, sort?, filter?, fields?, populate?, locale? })` - List content items
- `getContentTree<T>(model, { parent?, filter?, fields?, populate?, locale? })` - Get tree structure
- `getAggregateModel<T>({ model, pipeline, locale? })` - Aggregation pipeline query
- `getSingleton<T>(model, { locale?, populate? })` - Get singleton model
- `postContentItem<T>(model, item)` - Create content item
- `deleteContentItem<T>(model, id)` - Delete content item

**Pages:**
- `pages<T>({ limit?, skip?, sort?, filter?, fields?, locale? })` - List pages
- `pageById<T>({ page, id, locale?, populate? })` - Get page by ID
- `pageByRoute<T>(route, { locale?, populate? })` - Get page by route

**Menus:**
- `pagesMenus<T>({ locale?, inactive? })` - List all menus
- `pagesMenu<T>(name, { locale?, inactive? })` - Get specific menu

**Routes & Sitemap:**
- `pagesRoutes<T>(locale?)` - Get all routes
- `pagesSitemap<T>()` - Get sitemap
- `pagesSetting<T>(locale?)` - Get site settings

**Search (Detektivo addon):**
- `search<T>({ index, q?, limit?, offset? })` - Full-text search

**Localization (Lokalize addon):**
- `localize<T>(projectName, { locale?, nested? })` - Get translations

**Assets:**
- `assetById<T>(assetId)` - Get asset metadata
- `imageAssetById<T>(assetId, { m?, w?, h?, q?, mime? })` - Get transformed image

**System:**
- `graphQL<T>(document, variables?)` - Execute GraphQL query
- `healthCheck<T>()` - Health check
- `clearCache(pattern?)` - Clear cache
- `getFullRouteForSlug(slug)` - Resolve slug to full route

### Configuration Options

All options fall back to environment variables when not explicitly provided:

```typescript
const cockpit = await CockpitAPI({
  endpoint: 'https://...',      // Falls back to COCKPIT_GRAPHQL_ENDPOINT
  tenant: 'mytenant',           // Optional: for multi-tenant setups
  apiKey: 'your-api-key',       // Falls back to COCKPIT_SECRET env var
  useAdminAccess: true,         // Optional: inject api-Key header
  cache: {
    max: 100,                   // Falls back to COCKPIT_CACHE_MAX (default: 100)
    ttl: 100000,                // Falls back to COCKPIT_CACHE_TTL (default: 100000)
  },
});
```

### Environment Variables

```bash
COCKPIT_GRAPHQL_ENDPOINT=https://your-cockpit-instance.com/api/graphql
COCKPIT_SECRET=your-api-key                # Default API key
COCKPIT_SECRET_MYTENANT=tenant-api-key     # Tenant-specific API key
COCKPIT_CACHE_MAX=100                      # Max cache entries (default: 100)
COCKPIT_CACHE_TTL=100000                   # Cache TTL in ms (default: 100000)
```

### TypeScript Support

```typescript
import type {
  CockpitAPIClient,
  CockpitAPIOptions,
  ContentItemQueryOptions,
  ContentListQueryOptions,
  ImageAssetQueryParams,
  CockpitPage,
  CockpitAsset,
} from '@unchainedshop/cockpit-api';

import { ImageSizeMode, MimeType } from '@unchainedshop/cockpit-api';
```

## v2.0.0 Breaking Changes

- `lokalize()` renamed to `localize()`
- Methods use options objects instead of positional parameters
- HTTP errors now throw instead of returning `null` (404 still returns `null`)
- Each client instance has its own cache (no shared state)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
