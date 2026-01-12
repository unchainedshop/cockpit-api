import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { createMockResponse, EnvManager, TEST_ENDPOINT } from '../__tests__/test-helpers.ts';
import {
  generateCmsRouteReplacements,
  generateCollectionAndSingletonSlugRouteMap,
} from './route-map.ts';

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

  it('returns empty object on network error (catch block)', async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error('Network error');
    }) as unknown as typeof fetch;

    const result = await generateCollectionAndSingletonSlugRouteMap(TEST_ENDPOINT, 'network-tenant');
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
