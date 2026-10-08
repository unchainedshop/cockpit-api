import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { createMockResponse, TEST_ENDPOINT } from './__tests__/test-helpers.ts';
import { createCacheManager } from './core/cache.ts';
import { createConfig, type CockpitAPIOptions } from './core/config.ts';
import { createHttpClient } from './core/http.ts';
import { createUrlBuilder } from './core/url.ts';
import { createLinkResolver, findPageLinks, type RouteMaps } from './links.ts';

/** Resolves in place, like the client does on its private copies */
const resolveIn = <T>(value: T, links: Record<string, string>): T => findPageLinks(value)?.(links) ?? value;

describe('findPageLinks', () => {
  const map = { 'pages://id1': '/one', 'pages://id10': '/ten', 'pages://65a1f0c2e4b0a1b2c3d4e5f6': '/de/kontakt' };

  it('returns null when the value contains no page link', () => {
    assert.strictEqual(findPageLinks({ a: 'x', b: [1, { c: 'https://x' }] }), null);
    assert.strictEqual(findPageLinks(null), null);
    assert.strictEqual(findPageLinks(42), null);
    assert.strictEqual(findPageLinks('plain'), null);
  });

  it('resolves whole-token links in nested objects and arrays in place', () => {
    const value = { a: 'pages://id1', list: [{ b: 'pages://id10' }, 'pages://id1', 3, null, true], nested: { deep: { c: 'pages://id10' } } };
    assert.strictEqual(resolveIn(value, map), value);
    assert.deepStrictEqual(value, { a: '/one', list: [{ b: '/ten' }, '/one', 3, null, true], nested: { deep: { c: '/ten' } } });
  });

  it('keeps anchors and query strings and leaves unknown and inherited ids alone', () => {
    const value = { a: 'pages://id1#team', b: 'pages://id1?x=1', c: 'pages://id100', d: 'pages://toString', e: 'pages://constructor#x' };
    resolveIn(value, map);
    assert.deepStrictEqual(value, { a: '/one#team', b: '/one?x=1', c: 'pages://id100', d: 'pages://toString', e: 'pages://constructor#x' });
  });

  it('replaces links inside HTML strings and stores routes verbatim', () => {
    const value = { html: '<a href="pages://65a1f0c2e4b0a1b2c3d4e5f6">x</a> <a href="pages://id1#a">y</a>', q: 'pages://id1' };
    resolveIn(value, { ...map, 'pages://id1': '/a"b\\c' });
    assert.deepStrictEqual(value, { html: '<a href="/de/kontakt">x</a> <a href="/a"b\\c#a">y</a>', q: '/a"b\\c' });
  });

  it('resolves a top-level string', () => {
    assert.strictEqual(resolveIn('pages://id1', map), '/one');
  });

  it('leaves values unchanged with an empty map', () => {
    const value = { a: 'pages://id1' };
    resolveIn(value, {});
    assert.strictEqual(value.a, 'pages://id1');
  });

  it('throws instead of looping on cyclic structures', () => {
    const value: Record<string, unknown> = { a: 'pages://id1' };
    value['self'] = value;
    assert.throws(() => findPageLinks(value), /too deeply nested/);
  });

  it('does not rewrite object keys', () => {
    const value = { 'pages://id1': 'pages://id1' };
    resolveIn(value, map);
    assert.deepStrictEqual(value, { 'pages://id1': '/one' });
  });
});

// SWR envelope as written by CacheManager.swr()
function envelope(data: RouteMaps, { stale = false, expired = false } = {}) {
  const now = Date.now();
  if (expired) return { data, freshUntil: now - 2, staleUntil: now - 1 };
  return stale
    ? { data, freshUntil: now - 1, staleUntil: now + 60_000 }
    : { data, freshUntil: now + 60_000, staleUntil: now + 120_000 };
}

const maps = (links: Record<string, string>, models: Record<string, string> = {}): RouteMaps => ({ links, models });

// Background revalidation only awaits mocked (microtask) work
const flushBackgroundWork = () => new Promise((resolve) => setImmediate(resolve));

describe('createLinkResolver (route maps)', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof mock.fn<(input: URL, init?: RequestInit) => Promise<Response>>>;

  const respond = (body: unknown, init: { ok?: boolean; status?: number } = {}) => {
    fetchMock = mock.fn(async (_input: URL, _init?: RequestInit) => createMockResponse({ body, ok: (init.status ?? 200) < 400, ...init }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  };
  const requested = (call = 0): URL => new URL(fetchMock.mock.calls[call]!.arguments[0]);

  const setup = (options: CockpitAPIOptions = {}) => {
    const config = createConfig({ endpoint: TEST_ENDPOINT, ...options });
    const http = createHttpClient(config);
    const cache = createCacheManager('test:');
    const resolver = createLinkResolver({ http, url: createUrlBuilder(config), cache, prefetch: true });
    const linksOf = async (locale = 'default') => (await resolver.prefetch(locale))!.links;
    return { cache, resolver, linksOf };
  };
  const cachedData = async (cache: ReturnType<typeof createCacheManager>, locale = 'default') =>
    ((await cache.get(`ROUTE_MAPS:v4:${locale}`)) as { data?: unknown } | undefined)?.data;

  beforeEach(() => respond([]));
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requests the published pages of the locale once, with the client credentials and tenant', async () => {
    respond([{ _id: 'p1', _r: '/about', _state: 1, data: { collection: 'posts' } }]);
    const { resolver, cache } = setup({ tenant: 'acme', apiKey: 'k1', useAdminAccess: true });

    assert.strictEqual(await resolver.resolve('pages://p1', 'en'), '/about');
    assert.strictEqual(await resolver.routeForCollection('posts', 'en'), '/about');

    assert.strictEqual(fetchMock.mock.callCount(), 1);
    const url = requested();
    assert.strictEqual(url.pathname, '/:acme/api/pages/pages');
    assert.strictEqual(url.searchParams.get('locale'), 'en');
    assert.deepStrictEqual(JSON.parse(url.searchParams.get('filter')!), { _state: 1 });
    assert.deepStrictEqual(JSON.parse(url.searchParams.get('fields')!), {
      _id: 1, _r: 1, _state: 1, data: { collection: 1, singleton: 1 },
    });
    assert.strictEqual((fetchMock.mock.calls[0]!.arguments[1]!.headers as Record<string, string>)['api-Key'], 'k1');
    assert.deepStrictEqual(await cachedData(cache, 'en'), maps({ 'pages://p1': '/about' }, { posts: '/about' }));
  });

  it('builds the link map and the collection/singleton map from one response', async () => {
    respond([
      { _id: 'p1', _r: '/blog', data: { collection: 'posts' } },
      { _id: 'p2', _r: '/home', data: { singleton: 'home' } },
      { _id: 'p3', _r: '/plain' },
      { _id: 'p4', _r: '/draft', _state: 0, data: { collection: 'drafts' } },
      { _id: 'p5', _r: '/proto', data: { collection: '__proto__' } },
    ]);
    const { resolver, linksOf } = setup();

    assert.deepStrictEqual(await linksOf(), {
      'pages://p1': '/blog', 'pages://p2': '/home', 'pages://p3': '/plain', 'pages://p5': '/proto',
    });
    assert.strictEqual(await resolver.routeForCollection('posts', 'default'), '/blog');
    assert.strictEqual(await resolver.routeForCollection('home', 'default'), '/home');
    assert.strictEqual(await resolver.routeForCollection('drafts', 'default'), undefined);
    assert.strictEqual(await resolver.routeForCollection('__proto__', 'default'), '/proto');
    assert.strictEqual(await resolver.routeForCollection('constructor', 'default'), undefined);
    assert.strictEqual(await resolver.routeForCollection('toString', 'default'), undefined);
  });

  it('keeps only safe relative routes', async () => {
    const safe = { root: '/', plain: '/verband/vorstand', unicode: '/über-uns/café', encoded: '/caf%C3%A9?x=1&y=2#top' };
    const unsafe = {
      js: 'javascript:alert(1)', quote: '/a" onmouseover="alert(1)', single: "/a' onmouseover='alert(1)",
      angle: '/a<script>', space: '/a b', protocolRelative: '//evil.example', backslash: '/\\evil.example',
      control: '/a\nb', absolute: 'https://evil.example/', empty: '', backtick: '/a`b', number: 42, missing: undefined,
    };
    respond([
      ...Object.entries({ ...safe, ...unsafe }).map(([_id, _r]) => ({ _id, _r })),
      { _id: 'evil', _r: 'javascript:alert(1)', data: { collection: 'evil' } },
    ]);
    const { resolver, linksOf } = setup();

    assert.deepStrictEqual(await linksOf(), Object.fromEntries(Object.entries(safe).map(([id, r]) => [`pages://${id}`, r])));
    assert.strictEqual(await resolver.routeForCollection('evil', 'default'), undefined);
  });

  it('caches one map pair per locale and falls back to "default" for malformed locales', async () => {
    const { linksOf } = setup();
    for (const locale of ['en', 'de_CH', 'zh-Hant-TW', 'default', 'en', '../x', 'x'.repeat(50), 'en US', 'de"', '']) {
      await linksOf(locale);
    }
    assert.deepStrictEqual(
      fetchMock.mock.calls.map((_c, i) => requested(i).searchParams.get('locale')),
      ['en', 'de_CH', 'zh-Hant-TW', 'default'],
    );
  });

  it('serves a stale map without waiting and refreshes it in the background', async () => {
    respond([{ _id: 'page1', _r: '/new' }]);
    const { cache, linksOf } = setup();
    await cache.set('ROUTE_MAPS:v4:default', envelope(maps({ 'pages://page1': '/old' }), { stale: true }));

    assert.deepStrictEqual(await linksOf(), { 'pages://page1': '/old' });
    assert.strictEqual(fetchMock.mock.callCount(), 1); // revalidation started
    await flushBackgroundWork();

    assert.deepStrictEqual(await linksOf(), { 'pages://page1': '/new' });
    assert.strictEqual(fetchMock.mock.callCount(), 1); // fresh hit
  });

  it('keeps serving the last good map when the refresh fails', async () => {
    respond(null, { status: 503 });
    const { cache, linksOf } = setup();
    await cache.set('ROUTE_MAPS:v4:default', envelope(maps({ 'pages://page1': '/old' }), { stale: true }));

    assert.deepStrictEqual(await linksOf(), { 'pages://page1': '/old' });
    await flushBackgroundWork();
    assert.deepStrictEqual(await cachedData(cache), maps({ 'pages://page1': '/old' }));
  });

  it('does not serve a map past its stale window when the upstream fails', async () => {
    respond(null, { status: 503 });
    const { cache, linksOf } = setup();
    await cache.set('ROUTE_MAPS:v4:default', envelope(maps({ 'pages://page1': '/old' }), { expired: true }));

    assert.deepStrictEqual(await linksOf(), {});
    assert.strictEqual(fetchMock.mock.callCount(), 1);
  });

  it('dedupes concurrent loads of a missing map into one fetch', async () => {
    respond([{ _id: 'page1', _r: '/about' }]);
    const { linksOf } = setup();

    const results = await Promise.all([linksOf(), linksOf(), linksOf()]);

    assert.strictEqual(fetchMock.mock.callCount(), 1);
    for (const result of results) assert.deepStrictEqual(result, { 'pages://page1': '/about' });
  });

  it('never throws and does not cache failed or malformed responses', async () => {
    const { cache, resolver, linksOf } = setup();

    respond(null, { status: 500 });
    assert.deepStrictEqual(await linksOf(), {});
    assert.strictEqual(await resolver.resolve('pages://p', 'default'), 'pages://p');
    assert.strictEqual(await resolver.routeForCollection('posts', 'default'), undefined);

    respond({ error: 'not an array' });
    assert.deepStrictEqual(await linksOf(), {});

    assert.strictEqual(await cache.get('ROUTE_MAPS:v4:default'), undefined);
  });

  it('caches empty maps when the Pages addon is missing (404) on a cold miss', async () => {
    respond(null, { status: 404 });
    const { cache, linksOf } = setup();

    assert.deepStrictEqual(await linksOf(), {});
    assert.deepStrictEqual(await linksOf(), {});
    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.deepStrictEqual(await cachedData(cache), maps({}));
  });

  it('keeps a cached map when its background refresh gets a 404', async () => {
    respond(null, { status: 404 });
    const { cache, linksOf } = setup();
    await cache.set('ROUTE_MAPS:v4:default', envelope(maps({ 'pages://page1': '/old' }), { stale: true }));

    assert.deepStrictEqual(await linksOf(), { 'pages://page1': '/old' });
    await flushBackgroundWork();

    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.deepStrictEqual(await cachedData(cache), maps({ 'pages://page1': '/old' }));
  });

  it('does not serve an expired map when the refetch gets a 404', async () => {
    respond(null, { status: 404 });
    const { cache, linksOf } = setup();
    await cache.set('ROUTE_MAPS:v4:default', envelope(maps({ 'pages://page1': '/old' }), { expired: true }));

    assert.deepStrictEqual(await linksOf(), {});
  });

  it('caches empty maps when a 404 meets an expired tombstone', async () => {
    respond(null, { status: 404 });
    const { cache, linksOf } = setup();
    await cache.set('ROUTE_MAPS:v4:default', { data: null, freshUntil: 0, staleUntil: 0 });

    assert.deepStrictEqual(await linksOf(), {});
    assert.deepStrictEqual(await linksOf(), {});
    assert.strictEqual(fetchMock.mock.callCount(), 1);
  });

  it('only fetches for values that contain links, and prefetches only when enabled', async () => {
    respond([{ _id: 'p1', _r: '/about' }]);
    const config = createConfig({ endpoint: TEST_ENDPOINT });
    const resolver = createLinkResolver({
      http: createHttpClient(config),
      url: createUrlBuilder(config),
      cache: createCacheManager('test:'),
      prefetch: false,
    });

    assert.strictEqual(resolver.prefetch('default'), undefined);
    assert.deepStrictEqual(await resolver.resolve({ a: 'x' }, 'default'), { a: 'x' });
    assert.strictEqual(fetchMock.mock.callCount(), 0);
    assert.deepStrictEqual(await resolver.resolve({ a: 'pages://p1' }, 'default'), { a: '/about' });
    assert.strictEqual(fetchMock.mock.callCount(), 1);
  });
});
