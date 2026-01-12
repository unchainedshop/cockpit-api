import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { createMockResponse, EnvManager, TEST_ENDPOINT } from '../__tests__/test-helpers.ts';
import type { CacheManager } from '../core/cache.ts';
import {
  generateCmsRouteReplacements,
  generateCollectionAndSingletonSlugRouteMap,
} from './route-map.ts';

function createMockCache(initialData: Record<string, unknown> = {}): CacheManager {
  const store = new Map<string, unknown>(Object.entries(initialData));
  return {
    get: <T>(key: string) => store.get(key) as T | undefined,
    set: <T>(key: string, value: T) => { store.set(key, value); },
    clear: () => { store.clear(); },
  };
}

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

    const cachedData = { 'pages://cached': '/cached-route' };
    const cache = createMockCache({ 'ROUTE_REPLACEMENT_MAP:cache-tenant': cachedData });

    const result = await generateCmsRouteReplacements(TEST_ENDPOINT, 'cache-tenant', cache);

    assert.deepStrictEqual(result, cachedData);
    assert.strictEqual(mockFetch.mock.calls.length, 0); // fetch should not be called
  });

  it('stores result in cache when cache provided', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: [{ _id: 'page1', _r: '/about' }],
    })) as unknown as typeof fetch;

    const cache = createMockCache();
    await generateCmsRouteReplacements(TEST_ENDPOINT, 'store-tenant', cache);

    // Verify it was cached
    const cached = cache.get<Record<string, string>>('ROUTE_REPLACEMENT_MAP:store-tenant');
    assert.deepStrictEqual(cached, { 'pages://page1': '/about' });
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

    const cachedData = { 'cached-collection': '/cached-route' };
    const cache = createMockCache({ 'SLUG_ROUTE_MAP:cache-tenant': cachedData });

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'cache-tenant', cache);

    assert.deepStrictEqual(result, cachedData);
    assert.strictEqual(mockFetch.mock.calls.length, 0); // fetch should not be called
  });

  it('stores result in cache when cache provided', async () => {
    globalThis.fetch = mock.fn(async () => createMockResponse({
      body: [{ data: { collection: 'news' }, _r: '/news' }],
    })) as unknown as typeof fetch;

    const cache = createMockCache();
    await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'store-tenant', cache);

    // Verify it was cached
    const cached = cache.get<Record<string, string>>('SLUG_ROUTE_MAP:store-tenant');
    assert.deepStrictEqual(cached, { news: '/news' });
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
