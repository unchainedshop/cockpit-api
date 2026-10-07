import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { createMockResponse, EnvManager, TEST_ENDPOINT } from '../__tests__/test-helpers.ts';
import { createCacheManager } from '../core/cache.ts';
import {
  generateCmsRouteReplacements,
  generateCollectionAndSingletonSlugRouteMap,
} from './route-map.ts';

// SWR envelope as written by CacheManager.swr()
function envelope(data: Record<string, string>, { stale = false } = {}) {
  const now = Date.now();
  return stale
    ? { data, freshUntil: now - 1, staleUntil: now + 60_000 }
    : { data, freshUntil: now + 60_000, staleUntil: now + 120_000 };
}

async function cachedData(
  cache: ReturnType<typeof createCacheManager>,
  key: string,
): Promise<unknown> {
  return ((await cache.get(key)) as { data?: unknown } | undefined)?.data;
}

// Background revalidation only awaits mocked (microtask) work
const flushBackgroundWork = () => new Promise((resolve) => setImmediate(resolve));

describe('generateCmsRouteReplacements', () => {
  const envManager = new EnvManager();
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: TEST_ENDPOINT });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    envManager.reset();
  });

  it('returns empty object on HTTP error', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      ok: false,
      status: 500,
    })) as unknown as typeof fetch;

    const result = await generateCmsRouteReplacements(TEST_ENDPOINT, 'httperror-tenant');
    assert.deepStrictEqual(result, {});
  });

  it('returns empty object when response is not array', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: { error: 'not an array' },
    })) as unknown as typeof fetch;

    const result = await generateCmsRouteReplacements(TEST_ENDPOINT, 'notarray-tenant');
    assert.deepStrictEqual(result, {});
  });

  it('maps page IDs to routes', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: [
        { _id: 'page1', _r: '/about' },
        { _id: 'page2', _r: '/contact' },
      ],
    })) as unknown as typeof fetch;

    const result = await generateCmsRouteReplacements(TEST_ENDPOINT, 'maptest-tenant');

    assert.strictEqual(result['pages://page1'], '/about');
    assert.strictEqual(result['pages://page2'], '/contact');
  });

  it('returns cached result when available', async () => {
    const mockFetch = mock.fn(async () => createMockResponse({
      body: [{ _id: 'page1', _r: '/fresh' }],
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const map = { 'pages://cached': '/cached-route' };
    const cache = createCacheManager('test:');
    await cache.set('ROUTE_REPLACEMENT_MAP:v2:cache-tenant', envelope(map));

    const result = await generateCmsRouteReplacements(TEST_ENDPOINT, 'cache-tenant', cache);

    assert.deepStrictEqual(result, map);
    assert.strictEqual(mockFetch.mock.calls.length, 0); // fetch should not be called
  });

  it('stores result in cache when cache provided', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: [{ _id: 'page1', _r: '/about' }],
    })) as unknown as typeof fetch;

    const cache = createCacheManager('test:');
    await generateCmsRouteReplacements(TEST_ENDPOINT, "store-tenant", cache);

    // Verify it was cached
    assert.deepStrictEqual(
      await cachedData(cache, "ROUTE_REPLACEMENT_MAP:v2:store-tenant"),
      { "pages://page1": "/about" },
    );
  });

  it('serves a stale map without waiting and refreshes it in the background', async () => {
    const mockFetch = mock.fn(async () => createMockResponse({
      body: [{ _id: 'page1', _r: '/new' }],
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const cache = createCacheManager('test:');
    await cache.set(
      'ROUTE_REPLACEMENT_MAP:v2:swr-tenant',
      envelope({ 'pages://page1': '/old' }, { stale: true }),
    );

    const stale = await generateCmsRouteReplacements(TEST_ENDPOINT, 'swr-tenant', cache);
    assert.deepStrictEqual(stale, { 'pages://page1': '/old' });
    assert.strictEqual(mockFetch.mock.calls.length, 1); // revalidation started

    await flushBackgroundWork();

    const fresh = await generateCmsRouteReplacements(TEST_ENDPOINT, 'swr-tenant', cache);
    assert.deepStrictEqual(fresh, { 'pages://page1': '/new' });
    assert.strictEqual(mockFetch.mock.calls.length, 1); // fresh hit, no refetch
  });

  it('keeps serving the last good map when the refresh fails', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      ok: false,
      status: 503,
    })) as unknown as typeof fetch;

    const cache = createCacheManager('test:');
    await cache.set(
      'ROUTE_REPLACEMENT_MAP:v2:down-tenant',
      envelope({ 'pages://page1': '/old' }, { stale: true }),
    );

    const result = await generateCmsRouteReplacements(TEST_ENDPOINT, 'down-tenant', cache);
    await flushBackgroundWork();

    assert.deepStrictEqual(result, { 'pages://page1': '/old' });
    assert.deepStrictEqual(
      await cachedData(cache, 'ROUTE_REPLACEMENT_MAP:v2:down-tenant'),
      { 'pages://page1': '/old' },
    );
  });

  it('does not cache failed or malformed responses', async () => {
    const cache = createCacheManager('test:');

    globalThis.fetch = mock.fn(async () => createMockResponse({
      ok: false,
      status: 500,
    })) as unknown as typeof fetch;
    assert.deepStrictEqual(
      await generateCmsRouteReplacements(TEST_ENDPOINT, 'fail-tenant', cache),
      {},
    );

    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: { error: 'not an array' },
    })) as unknown as typeof fetch;
    assert.deepStrictEqual(
      await generateCmsRouteReplacements(TEST_ENDPOINT, 'fail-tenant', cache),
      {},
    );

    assert.strictEqual(await cache.get('ROUTE_REPLACEMENT_MAP:v2:fail-tenant'), undefined);
  });

  it('caches an empty map when the Pages addon is missing (404)', async () => {
    const mockFetch = mock.fn(async () => createMockResponse({
      ok: false,
      status: 404,
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const cache = createCacheManager('test:');
    await generateCmsRouteReplacements(TEST_ENDPOINT, 'nopages-tenant', cache);
    const result = await generateCmsRouteReplacements(TEST_ENDPOINT, 'nopages-tenant', cache);

    assert.deepStrictEqual(result, {});
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });
});

describe('generateCollectionAndSingletonSlugRouteMap', () => {
  const envManager = new EnvManager();
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: TEST_ENDPOINT });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    envManager.reset();
  });

  it('returns empty object on HTTP error', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      ok: false,
      status: 500,
    })) as unknown as typeof fetch;

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'slugerror-tenant');
    assert.deepStrictEqual(result, {});
  });

  it('maps collection names to routes', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: [
        { data: { collection: 'posts' }, _r: '/blog' },
        { data: { singleton: 'homepage' }, _r: '/' },
      ],
    })) as unknown as typeof fetch;

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'slugmap-tenant');

    assert.strictEqual(result['posts'], '/blog');
    assert.strictEqual(result['homepage'], '/');
  });

  it('ignores items without collection/singleton', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: [
        { data: {}, _r: '/orphan' },
        { data: { collection: 'posts' }, _r: '/blog' },
      ],
    })) as unknown as typeof fetch;

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'ignore-tenant');

    assert.ok(!('undefined' in result));
    assert.strictEqual(result['posts'], '/blog');
  });

  it('handles items with undefined data property', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: [
        { _r: '/no-data' },
        { data: undefined, _r: '/undefined-data' },
        { data: { singleton: 'homepage' }, _r: '/' },
      ],
    })) as unknown as typeof fetch;

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'undefined-data-tenant');

    assert.strictEqual(Object.keys(result).length, 1);
    assert.strictEqual(result['homepage'], '/');
  });

  it('returns empty object on network error (catch block)', async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error('Network error');
    }) as unknown as typeof fetch;

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'network-tenant');
    assert.deepStrictEqual(result, {});
  });

  it('returns cached result when available', async () => {
    const mockFetch = mock.fn(async () => createMockResponse({
      body: [{ data: { collection: 'fresh' }, _r: '/fresh' }],
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const map = { 'cached-collection': '/cached-route' };
    const cache = createCacheManager('test:');
    await cache.set('SLUG_ROUTE_MAP:v2:cache-tenant', envelope(map));

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'cache-tenant', cache);

    assert.deepStrictEqual(result, map);
    assert.strictEqual(mockFetch.mock.calls.length, 0); // fetch should not be called
  });

  it('stores result in cache when cache provided', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: [{ data: { collection: 'news' }, _r: '/news' }],
    })) as unknown as typeof fetch;

    const cache = createCacheManager('test:');
    await generateCollectionAndSingletonSlugRouteMap(
      TEST_ENDPOINT,
      "store-tenant",
      cache,
    );

    // Verify it was cached
    assert.deepStrictEqual(
      await cachedData(cache, "SLUG_ROUTE_MAP:v2:store-tenant"),
      { news: "/news" },
    );
  });

  it('serves a stale map without waiting and refreshes it in the background', async () => {
    const mockFetch = mock.fn(async () => createMockResponse({
      body: [{ data: { collection: 'news' }, _r: '/aktuelles' }],
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const cache = createCacheManager('test:');
    await cache.set('SLUG_ROUTE_MAP:v2:swr-tenant', envelope({ news: '/news' }, { stale: true }));

    const stale = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'swr-tenant', cache);
    assert.deepStrictEqual(stale, { news: '/news' });

    await flushBackgroundWork();

    const fresh = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'swr-tenant', cache);
    assert.deepStrictEqual(fresh, { news: '/aktuelles' });
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });

  it('returns empty object when response is not array', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: { error: 'not an array' },
    })) as unknown as typeof fetch;

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'notarray-tenant');
    assert.deepStrictEqual(result, {});
  });
});

describe('generateCmsRouteReplacements error handling', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns empty object on network error (catch block)', async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error('Network error');
    }) as unknown as typeof fetch;

    const result = await generateCmsRouteReplacements(TEST_ENDPOINT, 'network-tenant');
    assert.deepStrictEqual(result, {});
  });
});
