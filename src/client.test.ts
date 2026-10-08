import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { parse } from 'graphql';
import {
  createMockResponse,
  EnvManager,
  TEST_ENDPOINT,
  fetchCall,
  fetchUrl,
  fetchUrls,
  type MockResponseOptions,
} from './__tests__/test-helpers.ts';
import { CockpitAPI, type CockpitAPIClient, type CockpitAPIOptions } from './index.ts';
import { logger } from './cockpit-logger.ts';

// Hermetic env and fetch: no COCKPIT_* variable or mock leaks into a test
let env: EnvManager;
let mockFetch: ReturnType<typeof mock.fn<typeof fetch>>;
const originalFetch = globalThis.fetch;

/** Mocks fetch with a handler of the parsed request URL */
const respond = (handler: (url: URL, init?: RequestInit) => Response | Promise<Response>): void => {
  mockFetch = mock.fn<typeof fetch>(async (input, init) => handler(new URL(String(input)), init));
  globalThis.fetch = mockFetch;
};
const respondWith = (options: MockResponseOptions): void => respond(() => createMockResponse(options));
const notFound = { ok: false, status: 404 } as const;

beforeEach(() => {
  env = new EnvManager();
  env.clear('COCKPIT_');
  respondWith({ body: [], textBody: 'https://test.cockpit.com/img.png' });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  env.reset();
  mock.reset();
});

const client = (options: CockpitAPIOptions = {}): Promise<CockpitAPIClient> =>
  CockpitAPI({ endpoint: TEST_ENDPOINT, ...options });
const urlOf = (index = 0): URL => new URL(fetchUrl(mockFetch, index));
const callsTo = (path: string): number => fetchUrls(mockFetch).filter((url) => url.includes(path)).length;

/** Polls (yielding to the event loop) until `predicate` holds */
async function waitFor(predicate: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`Timed out waiting for ${what}`);
}

/** In-memory store without serialization, exposing its keys */
const mapStore = () => {
  const map = new Map<string, unknown>();
  return {
    map,
    store: {
      get: async (key: string) => map.get(key),
      set: async (key: string, value: unknown) => {
        map.set(key, value);
      },
      clear: async (pattern?: string) => {
        for (const key of [...map.keys()]) {
          if (pattern === undefined || key.startsWith(pattern)) map.delete(key);
        }
      },
    },
  };
};
const PREFIX = `cockpit-api:${TEST_ENDPOINT}:default:public:`;
const keysOf = (map: Map<string, unknown>): string[] => [...map.keys()].map((key) => key.slice(PREFIX.length)).sort();

type Call = (c: CockpitAPIClient) => Promise<unknown>;

describe('factory', () => {
  it('routes REST requests through /:tenant/api/ with the tenant option', async () => {
    await (await client({ tenant: 'mytenant' })).getContentItem({ model: 'posts', id: '1' });
    assert.strictEqual(urlOf().href, 'https://test.cockpit.com/:mytenant/api/content/item/posts/1?locale=default');
  });

  for (const tenant of ['../admin', 'tenant/bad']) {
    it(`rejects the tenant ${JSON.stringify(tenant)}`, async () => {
      await assert.rejects(client({ tenant }), /Invalid tenant format/);
    });
  }

  it('falls back to COCKPIT_GRAPHQL_ENDPOINT; the option takes precedence', async () => {
    env.set({ COCKPIT_GRAPHQL_ENDPOINT: 'https://env.example.com/api/graphql' });
    await (await CockpitAPI()).getContentItem({ model: 'posts' });
    await (await client()).getContentItem({ model: 'posts' });
    assert.strictEqual(urlOf(0).host, 'env.example.com');
    assert.strictEqual(urlOf(1).host, 'test.cockpit.com');
  });

  it('throws when no endpoint is provided via options or env', async () => {
    await assert.rejects(CockpitAPI(), /endpoint is required/);
  });
});

describe('request URLs', () => {
  const cases: [string, Call, string, Record<string, string | null>][] = [
    ['getContentItem', (c) => c.getContentItem({ model: 'posts' }), '/api/content/item/posts', { locale: 'default' }],
    [
      'getContentItem with id and options',
      (c) => c.getContentItem({ model: 'posts', id: '123', locale: 'en', populate: 2, fields: { title: 1, _id: 0 } }),
      '/api/content/item/posts/123',
      { locale: 'en', populate: '2', fields: '{"title":1,"_id":0}' },
    ],
    [
      'getContentItems',
      (c) => c.getContentItems('news', { limit: 10, skip: 5, sort: { _created: -1 }, filter: { published: true }, populate: 2 }),
      '/api/content/items/news',
      { limit: '10', skip: '5', sort: '{"_created":-1}', filter: '{"published":true}', populate: '2' },
    ],
    [
      'getUnchainedContentItems',
      (c) => c.getUnchainedContentItems('posts', { limit: 10, skip: 20, includeUnpublished: true }),
      '/api/unchained/content/items/posts',
      { limit: '10', skip: '20', includeUnpublished: '1' },
    ],
    [
      'getUnchainedContentItems without unpublished',
      (c) => c.getUnchainedContentItems('posts', { includeUnpublished: false }),
      '/api/unchained/content/items/posts',
      { includeUnpublished: null },
    ],
    ['getContentTree', (c) => c.getContentTree('categories', { parent: 'p1' }), '/api/content/tree/categories', { parent: 'p1', filter: '{}' }],
    [
      'getAggregateModel',
      (c) => c.getAggregateModel({ model: 'posts', pipeline: [{ $match: { published: true } }] }),
      '/api/content/aggregate/posts',
      { pipeline: '[{"$match":{"published":true}}]' },
    ],
    ['pages', (c) => c.pages({ limit: 5, filter: { type: 'layout' } }), '/api/pages/pages', { limit: '5', filter: '{"type":"layout"}' }],
    ['pageById', (c) => c.pageById('page123', { locale: 'en', populate: 2 }), '/api/pages/page/page123', { locale: 'en', populate: '2' }],
    ['pageByRoute', (c) => c.pageByRoute('/contact', { locale: 'de', populate: 3 }), '/api/pages/page', { route: '/contact', locale: 'de', populate: '3' }],
    ['pageByRoute defaults', (c) => c.pageByRoute('/about'), '/api/pages/page', { route: '/about', locale: 'default', populate: '0' }],
    ['pagesMenus', (c) => c.pagesMenus({ locale: 'de', inactive: true }), '/api/pages/menus', { locale: 'de', inactive: '1' }],
    ['pagesMenu', (c) => c.pagesMenu('footer', { locale: 'en' }), '/api/pages/menu/footer', { locale: 'en', inactive: null }],
    ['pagesRoutes', (c) => c.pagesRoutes('en'), '/api/pages/routes', { locale: 'en' }],
    ['pagesSitemap', (c) => c.pagesSitemap(), '/api/pages/sitemap', {}],
    ['pagesSetting', (c) => c.pagesSetting('fr'), '/api/pages/settings', { locale: 'fr' }],
    ['healthCheck', (c) => c.healthCheck(), '/api/system/healthcheck', {}],
    ['localize', (c) => c.localize('myproject'), '/api/lokalize/project/myproject', { nested: null }],
    ['search', (c) => c.search({ index: 'pages', q: 'restaurant', limit: 10, offset: 5 }), '/api/detektivo/search/pages', { q: 'restaurant', limit: '10', offset: '5' }],
    ['assetById', (c) => c.assetById('a1'), '/api/assets/a1', {}],
    [
      'imageAssetById (never binary output or redirect)',
      (c) => c.imageAssetById('asset123', { w: 200, h: 150, q: 80, o: 1, re: 1 } as never),
      '/api/assets/image/asset123',
      { w: '200', h: '150', q: '80', o: null, re: null },
    ],
    ['uploadAssets', (c) => c.uploadAssets([new File(['x'], 'x.txt')], { folder: 'documents' }), '/api/unchained/assets/upload', { folder: 'documents' }],
    ['postContentItem', (c) => c.postContentItem('posts', { title: 'Test' }), '/api/content/item/posts', {}],
    ['deleteContentItem', (c) => c.deleteContentItem('posts', '123'), '/api/content/item/posts/123', {}],
  ];

  for (const [name, call, pathname, params] of cases) {
    it(`${name} → ${pathname}`, async () => {
      await call(await client({ apiKey: 'k' }));
      const url = urlOf();
      assert.strictEqual(url.pathname, pathname);
      for (const [key, value] of Object.entries(params)) {
        assert.strictEqual(url.searchParams.get(key), value, key);
      }
    });
  }

  it('sends writes with their method and body', async () => {
    const c = await client();
    await c.postContentItem('posts', { title: 'Test' });
    await c.deleteContentItem('posts', '1');
    const [, post] = fetchCall(mockFetch, 0);
    assert.strictEqual(post.method, 'POST');
    assert.deepStrictEqual(JSON.parse(String(post.body)), { data: { title: 'Test' } });
    assert.strictEqual(fetchCall(mockFetch, 1)[1].method, 'DELETE');
  });

  it('sends queryParams; typed options override them only when defined', async () => {
    const c = await client();
    await c.getContentItem({ model: 'posts', queryParams: { fields: { title: 1 }, populate: 1 } });
    await c.getContentItem({ model: 'posts', queryParams: { populate: 1 }, populate: 2 });
    // JS callers (and spreads of optional values) may pass explicit undefined
    await c.getContentItems('news', { queryParams: { limit: 3 }, limit: undefined } as never);
    await c.pages({ queryParams: { limit: 4 }, limit: undefined } as never);
    await c.getContentTree('cats', { queryParams: { filter: { a: 1 } } });
    await c.getContentTree('cats', { queryParams: { filter: { a: 1 } }, filter: { b: 2 } });
    const sent = (i: number, key: string) => urlOf(i).searchParams.get(key);
    assert.deepStrictEqual(
      [sent(0, 'fields'), sent(0, 'populate'), sent(1, 'populate'), sent(2, 'limit'), sent(3, 'limit'), sent(4, 'filter'), sent(5, 'filter')],
      ['{"title":1}', '1', '2', '3', '4', '{"a":1}', '{"b":2}'],
    );
  });

  // Type-level only: list options don't apply to a single item
  // @ts-expect-error limit is not a getContentItem option
  void ((c: CockpitAPIClient) => c.getContentItem({ model: 'posts', limit: 1 }));
});

describe('removed v2 usage', () => {
  it('warns once per kind; a string locale argument is still honored', async () => {
    const warn = mock.method(logger, 'warn', () => undefined);
    await client({ preloadRoutes: true } as CockpitAPIOptions);
    await client({ preloadRoutes: true, cache: { ttl: 1, maxSize: 1, memoryLayer: true } } as CockpitAPIOptions);
    const c = await client();
    await c.pageByRoute('/about', 'en' as never);
    await c.pageByRoute('/about', 'fr' as never);
    await c.pagesMenus('de' as never);
    await c.pagesMenu('main', 'it' as never);
    assert.deepStrictEqual(fetchUrls(mockFetch).map((u) => new URL(u).searchParams.get('locale')), ['en', 'fr', 'de', 'it']);
    const messages = warn.mock.calls.map((call) => String(call.arguments[0]));
    for (const kind of ['preloadRoutes', 'cache.ttl', 'cache.maxSize', 'cache.memoryLayer', 'pageByRoute(', 'pagesMenus(', 'pagesMenu(']) {
      assert.strictEqual(messages.filter((m) => m.includes(kind)).length, 1, kind);
    }
  });
});

describe('parameter validation', () => {
  const required: [Call, string][] = [
    [(c) => c.getContentItem({ model: '' }), 'model'],
    [(c) => c.getContentItems(''), 'model'],
    [(c) => c.getUnchainedContentItems(''), 'model'],
    [(c) => c.getContentTree(''), 'model'],
    [(c) => c.getAggregateModel({ model: '', pipeline: [] }), 'model'],
    [(c) => c.postContentItem('', {}), 'model'],
    [(c) => c.deleteContentItem('', '1'), 'model'],
    [(c) => c.deleteContentItem('posts', ''), 'id'],
    [(c) => c.pageById(''), 'page id'],
    [(c) => c.pagesMenu(''), 'menu name'],
    [(c) => c.localize(''), 'projectName'],
    [(c) => c.assetById(''), 'assetId'],
    [(c) => c.imageAssetById('', { w: 100 }), 'assetId'],
    [(c) => c.search({ index: '' }), 'search index'],
    [(c) => c.uploadAssets(null as unknown as File[]), 'files'],
  ];
  for (const [call, name] of required) {
    it(`requires ${name}: ${call.toString().slice(6)}`, async () => {
      await assert.rejects(async () => call(await client({ apiKey: 'k' })), new RegExp(`Cockpit: Please provide ${name}$`));
      assert.strictEqual(mockFetch.mock.callCount(), 0);
    });
  }

  const TRAVERSAL_PAYLOADS = ['../x', '../../content/items/privateModel', '%2e%2e/x', '..\\x', 'a/b', '.', '..', 'a?b', 'a#b', 'a\u0000b', 'a%2fb'];
  const segments: Record<string, (c: CockpitAPIClient, value: string) => Promise<unknown>> = {
    'getContentItem model': (c, v) => c.getContentItem({ model: v }),
    'getContentItem id': (c, v) => c.getContentItem({ model: 'posts', id: v }),
    getContentItems: (c, v) => c.getContentItems(v),
    getUnchainedContentItems: (c, v) => c.getUnchainedContentItems(v),
    getContentTree: (c, v) => c.getContentTree(v),
    getAggregateModel: (c, v) => c.getAggregateModel({ model: v, pipeline: [] }),
    postContentItem: (c, v) => c.postContentItem(v, {}),
    'deleteContentItem model': (c, v) => c.deleteContentItem(v, '1'),
    'deleteContentItem id': (c, v) => c.deleteContentItem('posts', v),
    pageById: (c, v) => c.pageById(v),
    pagesMenu: (c, v) => c.pagesMenu(v),
    assetById: (c, v) => c.assetById(v),
    imageAssetById: (c, v) => c.imageAssetById(v, { w: 100 }),
    search: (c, v) => c.search({ index: v }),
    localize: (c, v) => c.localize(v),
  };
  for (const [name, call] of Object.entries(segments)) {
    it(`${name}: rejects traversal payloads before fetching, accepts ids/names`, async () => {
      const c = await client({ tenant: 'mytenant', apiKey: 'secret', useAdminAccess: true });
      for (const payload of TRAVERSAL_PAYLOADS) {
        await assert.rejects(() => call(c, payload), /Cockpit: Invalid .* format/, JSON.stringify(payload));
      }
      assert.strictEqual(mockFetch.mock.callCount(), 0);
      await call(c, '64f0c2a1b2c3d4e5f6a7b8c9');
      await call(c, 'main_menu-2');
      assert.strictEqual(mockFetch.mock.callCount(), 2);
    });
  }
});

describe('responses', () => {
  const lists: [string, Call][] = [
    ['getContentItems', (c) => c.getContentItems('posts', { skip: 0 })],
    ['getUnchainedContentItems', (c) => c.getUnchainedContentItems('posts')],
    ['pages', (c) => c.pages({ skip: 0 })],
  ];
  for (const [name, call] of lists) {
    it(`${name}: normalizes arrays to { data }, passes { data, meta } through, 404 → null`, async () => {
      const c = await client({ apiKey: 'k', cache: false });
      respondWith({ body: [{ _id: '1' }] });
      assert.deepStrictEqual(await call(c), { data: [{ _id: '1' }] });
      respondWith({ body: { data: [{ _id: '1' }], meta: { total: 10 } } });
      assert.deepStrictEqual(await call(c), { data: [{ _id: '1' }], meta: { total: 10 } });
      respondWith(notFound);
      assert.strictEqual(await call(c), null);
    });
  }

  it('returns null on 404 and throws on other errors', async () => {
    const c = await client();
    respondWith(notFound);
    assert.strictEqual(await c.getContentItem({ model: 'posts', id: 'x' }), null);
    respondWith({ ok: false, status: 500, textBody: 'Internal Server Error' });
    await assert.rejects(c.getContentItem({ model: 'posts' }), /500/);
  });

  it('healthCheck returns the parsed body', async () => {
    respondWith({ body: { status: 'ok' } });
    assert.deepStrictEqual(await (await client()).healthCheck(), { status: 'ok' });
  });

  describe('imageAssetById', () => {
    const upstream = 'https://test.cockpit.com/storage/tmp/thumbs/abc_80_thumbnail.jpg';
    const cases: [string, CockpitAPIOptions, string, string | null][] = [
      ['returns the plain-text URL as-is by default', {}, upstream, upstream],
      ['rebases the Cockpit origin onto publicUrl', { publicUrl: 'https://cdn.example.com' }, upstream, 'https://cdn.example.com/storage/tmp/thumbs/abc_80_thumbnail.jpg'],
      ['returns a host-relative URL with relativeAssetPaths', { relativeAssetPaths: true }, upstream, '/storage/tmp/thumbs/abc_80_thumbnail.jpg'],
      ['leaves other hosts untouched', { publicUrl: 'https://cdn.example.com' }, 'https://bucket.s3.amazonaws.com/a.jpg', 'https://bucket.s3.amazonaws.com/a.jpg'],
      ['leaves data URIs untouched', { publicUrl: 'https://cdn.example.com' }, 'data:image/png;base64,AA==', 'data:image/png;base64,AA=='],
    ];
    for (const [name, options, textBody, expected] of cases) {
      it(name, async () => {
        respondWith({ textBody });
        assert.strictEqual(await (await client(options)).imageAssetById('a1', { w: 80 }), expected);
      });
    }

    it('returns null for 404', async () => {
      respondWith({ ...notFound, textBody: 'Not found' });
      assert.strictEqual(await (await client()).imageAssetById('x', { w: 100 }), null);
    });
  });

  describe('uploadAssets', () => {
    it('returns empty assets for no files without a request', async () => {
      assert.deepStrictEqual(await (await client({ apiKey: 'k' })).uploadAssets([]), { assets: [] });
      assert.strictEqual(mockFetch.mock.callCount(), 0);
    });

    it('posts FormData with admin access and fixes returned asset paths', async () => {
      respondWith({ body: { assets: [{ _id: 'asset123', path: '/2026/01/test.txt', mime: 'text/plain' }] } });
      const result = await (await client({ apiKey: 'secret-key' })).uploadAssets([new File(['test'], 'test.txt')]);

      const [, init] = fetchCall(mockFetch, 0);
      assert.strictEqual(init.method, 'POST');
      assert.ok(init.body instanceof FormData);
      assert.ok((init.body as FormData).get('files[]') instanceof File);
      assert.strictEqual(init.headers['Content-Type'], undefined);
      assert.strictEqual(init.headers['api-Key'], 'secret-key');
      assert.strictEqual(result?.assets[0]?.path, 'https://test.cockpit.com/storage/uploads/2026/01/test.txt');
    });
  });

  describe('asset paths', () => {
    const itemWithAsset = { _id: '1', cover: { _id: 'a1', path: '/2026/01/x.jpg', mime: 'image/jpeg' } };
    const cases: [CockpitAPIOptions, string][] = [
      [{}, 'https://test.cockpit.com/storage/uploads/2026/01/x.jpg'],
      [{ tenant: 'acme' }, 'https://test.cockpit.com/:acme/storage/uploads/2026/01/x.jpg'],
      [{ publicUrl: 'https://cdn.example.com' }, 'https://cdn.example.com/storage/uploads/2026/01/x.jpg'],
      [{ publicUrl: 'https://cdn.example.com//' }, 'https://cdn.example.com/storage/uploads/2026/01/x.jpg'],
      [{ relativeAssetPaths: true }, '/storage/uploads/2026/01/x.jpg'],
    ];
    for (const [options, expected] of cases) {
      it(`${JSON.stringify(options)} → ${expected}`, async () => {
        respondWith({ body: itemWithAsset });
        const result = await (await client(options)).getContentItem<{ cover: { path: string } }>({ model: 'posts', id: '1' });
        assert.strictEqual(result?.cover.path, expected);
      });
    }
  });

  describe('pagesRoutes', () => {
    const route = { route: '/about', slug: 'about', type: 'layout', lastmod: '2025-01-01T00:00:00+00:00' };

    it('keys an array response by the sent (normalized) locale', async () => {
      respondWith({ body: [route] });
      const c = await client({ defaultLanguage: 'de' });
      assert.deepStrictEqual(await c.pagesRoutes(), { default: [route] });
      assert.deepStrictEqual(await c.pagesRoutes('de'), { default: [route] });
      assert.deepStrictEqual(await c.pagesRoutes('en'), { en: [route] });
      assert.strictEqual(mockFetch.mock.callCount(), 2); // 'de' shares the 'default' entry
    });

    it('passes an object response (keyed by locale) through', async () => {
      respondWith({ body: { default: [route], en: [] } });
      assert.deepStrictEqual(await (await client()).pagesRoutes('xx'), { default: [route], en: [] });
    });
  });

  describe('pageByRoute fallbackToDefault', () => {
    const page = { _id: '456', title: 'Default Page' };

    it('returns the page found in the requested locale without falling back', async () => {
      respondWith({ body: page });
      assert.deepStrictEqual(await (await client()).pageByRoute('/test', { locale: 'en', fallbackToDefault: true }), page);
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });

    it('looks the route up in the default locale, then loads that page in the requested locale', async () => {
      respond((url) => {
        if (url.pathname.endsWith('/pages/page/456')) return createMockResponse({ body: { ...page, title: 'EN' } });
        return url.searchParams.get('locale') === 'default' ? createMockResponse({ body: page }) : createMockResponse(notFound);
      });
      assert.deepStrictEqual(await (await client()).pageByRoute('/test', { locale: 'en', fallbackToDefault: true }), { ...page, title: 'EN' });
      assert.deepStrictEqual(
        fetchUrls(mockFetch).map((u) => `${new URL(u).pathname} ${new URL(u).searchParams.get('locale')}`),
        ['/api/pages/page en', '/api/pages/page default', '/api/pages/page/456 en'],
      );
    });

    const misses: [string, unknown][] = [
      ['nothing', null],
      ['a page without _id', { title: 'x' }],
      ['a page with an empty _id', { _id: '' }],
    ];
    for (const [name, fallback] of misses) {
      it(`returns null when the fallback finds ${name}`, async () => {
        respond((url) =>
          url.searchParams.get('locale') === 'default' && fallback !== null
            ? createMockResponse({ body: fallback })
            : createMockResponse(notFound),
        );
        assert.strictEqual(await (await client()).pageByRoute('/test', { locale: 'en', fallbackToDefault: true }), null);
        assert.strictEqual(mockFetch.mock.callCount(), 2);
      });
    }

    const noFallback: [string, CockpitAPIOptions, string | undefined][] = [
      ['fallbackToDefault is off', {}, 'en'],
      ['the locale is already default', {}, 'default'],
      ['the locale is the defaultLanguage (sent as "default")', { defaultLanguage: 'de' }, 'de'],
    ];
    for (const [name, options, locale] of noFallback) {
      it(`does not fall back when ${name}`, async () => {
        respondWith(notFound);
        const fallbackToDefault = name !== 'fallbackToDefault is off';
        assert.strictEqual(await (await client(options)).pageByRoute('/test', { locale: locale!, fallbackToDefault }), null);
        assert.strictEqual(mockFetch.mock.callCount(), 1);
      });
    }
  });

  describe('getRouteForCollection', () => {
    it('returns the route of the page bound to a model, per (normalized) locale, with the client credentials', async () => {
      respond((url) =>
        createMockResponse({
          body: [
            { _id: 'p1', data: { collection: 'posts' }, _r: url.searchParams.get('locale') === 'en' ? '/en/blog' : '/blog' },
          ],
        }),
      );
      const c = await client({ defaultLanguage: 'de', useAdminAccess: true, apiKey: 'k1' });

      assert.strictEqual(await c.getRouteForCollection('posts'), '/blog');
      assert.strictEqual(await c.getRouteForCollection('posts', 'de'), '/blog');
      assert.strictEqual(await c.getRouteForCollection('posts', 'en'), '/en/blog');
      assert.strictEqual(await c.getRouteForCollection('nope'), undefined);
      assert.strictEqual(await c.getRouteForCollection('constructor'), undefined);
      assert.strictEqual(mockFetch.mock.callCount(), 2);
      assert.strictEqual(fetchCall(mockFetch, 0)[1].headers['api-Key'], 'k1');
    });
  });
});

describe('graphQL', () => {
  const query = parse('query Posts { posts { _id } }');

  it('POSTs query and variables as JSON to the (tenant) GraphQL endpoint', async () => {
    respondWith({ body: { data: 'test' } });
    await (await client({ tenant: 'mytenant' })).graphQL(query, { var1: 'value1' });

    const [url, init] = fetchCall(mockFetch, 0);
    assert.strictEqual(new URL(url).pathname, '/:mytenant/api/graphql');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers['Content-Type'], 'application/json');
    const body = JSON.parse(String(init.body));
    assert.deepStrictEqual([body.variables, body.operationName], [{ var1: 'value1' }, 'Posts']);
    assert.ok(body.query.includes('posts'));
  });

  it('caches identical queries, also with an empty errors array', async () => {
    respondWith({ body: { data: { posts: [] }, errors: [] } });
    const c = await client();
    await c.graphQL(query);
    await c.graphQL(query);
    assert.strictEqual(mockFetch.mock.callCount(), 1);
  });

  it('never caches mutations', async () => {
    let n = 0;
    respond(() => createMockResponse({ body: { data: { createPost: { n: ++n } } } }));
    const c = await client();
    const mutation = parse('mutation Create($title: String) { createPost(title: $title) { _id } }');

    assert.deepStrictEqual(await c.graphQL(mutation, { title: 'a' }), { data: { createPost: { n: 1 } } });
    assert.deepStrictEqual(await c.graphQL(mutation, { title: 'a' }), { data: { createPost: { n: 2 } } });
    assert.strictEqual(JSON.parse(String(fetchCall(mockFetch, 1)[1].body)).operationName, 'Create');
  });

  it('does not cache the mutation picked by operationName in a multi-operation document', async () => {
    respondWith({ body: { data: {} } });
    const c = await client();
    const document = parse('query Read { posts { _id } } mutation Write { touch }');
    await c.graphQL(document, undefined, 'Write');
    await c.graphQL(document, undefined, 'Write');
    assert.strictEqual(mockFetch.mock.callCount(), 2);
    await c.graphQL(document, undefined, 'Read');
    await c.graphQL(document, undefined, 'Read');
    assert.strictEqual(mockFetch.mock.callCount(), 3);
  });

  it('does not cache responses with GraphQL errors but still returns them', async () => {
    const errorBody = { data: null, errors: [{ message: 'boom' }] };
    respondWith({ body: errorBody });
    const c = await client();
    assert.deepStrictEqual(await c.graphQL(query), errorBody);
    assert.deepStrictEqual(await c.graphQL(query), errorBody);
    assert.strictEqual(mockFetch.mock.callCount(), 2);

    respondWith({ body: { data: { posts: [] } } });
    await c.graphQL(query);
    assert.deepStrictEqual(await c.graphQL(query), { data: { posts: [] } });
    assert.strictEqual(mockFetch.mock.callCount(), 1);
  });

  it('main entry does not statically import the optional graphql peer dependency', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    // Value (non `import type` / `export type`) import and re-export specifiers
    const staticImport = /^\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
    const seen = new Set<string>();
    const bare = new Set<string>();
    const visit = async (file: string): Promise<void> => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = await readFile(file, 'utf8');
      for (const [, specifier] of source.matchAll(staticImport)) {
        if (specifier!.startsWith('.')) await visit(path.resolve(path.dirname(file), specifier!));
        else bare.add(specifier!);
      }
    };
    await visit(fileURLToPath(new URL('./index.ts', import.meta.url)));

    assert.ok(seen.size > 10, 'import graph was walked');
    assert.ok(bare.has('lru-cache'), 'value imports are detected');
    assert.ok(!bare.has('graphql'), `graphql is statically imported: ${[...bare].join(', ')}`);
  });
});

describe('authentication', () => {
  const apiKeyOf = (index = 0): string | undefined => fetchCall(mockFetch, index)[1].headers['api-Key'];

  const cases: [string, CockpitAPIOptions, Record<string, string>, Call, string | undefined][] = [
    ['useAdminAccess with the apiKey option', { useAdminAccess: true, apiKey: 'k1' }, {}, (c) => c.getContentItem({ model: 'posts' }), 'k1'],
    ['COCKPIT_SECRET', { useAdminAccess: true }, { COCKPIT_SECRET: 'envsecret' }, (c) => c.getContentItem({ model: 'posts' }), 'envsecret'],
    [
      'COCKPIT_SECRET_<TENANT>',
      { useAdminAccess: true, tenant: 'mytenant' },
      { COCKPIT_SECRET_MYTENANT: 'tenantsecret' },
      (c) => c.getContentItem({ model: 'posts' }),
      'tenantsecret',
    ],
    ['no admin access by default', { apiKey: 'k1' }, {}, (c) => c.getContentItem({ model: 'posts' }), undefined],
    ['per-request true', { apiKey: 'k1' }, {}, (c) => c.getContentItem({ model: 'posts', useAdminAccess: true }), 'k1'],
    ['per-request false', { apiKey: 'k1', useAdminAccess: true }, {}, (c) => c.getContentItem({ model: 'posts', useAdminAccess: false }), undefined],
    ['per-request on getContentItems', { apiKey: 'k1' }, {}, (c) => c.getContentItems('posts', { useAdminAccess: true }), 'k1'],
    ['per-request on getContentTree', { apiKey: 'k1' }, {}, (c) => c.getContentTree('posts', { useAdminAccess: true }), 'k1'],
    ['per-request on pages', { apiKey: 'k1' }, {}, (c) => c.pages({ useAdminAccess: true }), 'k1'],
    ['always on getUnchainedContentItems', { apiKey: 'k1' }, {}, (c) => c.getUnchainedContentItems('posts'), 'k1'],
  ];
  for (const [name, options, vars, call, expected] of cases) {
    it(`api-Key: ${name}`, async () => {
      env.set(vars);
      await call(await client(options));
      assert.strictEqual(apiKeyOf(), expected);
    });
  }

  it('always-admin methods throw a clear error without an apiKey instead of sending a public request', async () => {
    const c = await client();
    await assert.rejects(c.getUnchainedContentItems('posts'), /Cockpit: useAdminAccess requires an apiKey/);
    await assert.rejects(c.uploadAssets([new File(['x'], 'x.txt')]), /Cockpit: useAdminAccess requires an apiKey/);
    assert.strictEqual(mockFetch.mock.callCount(), 0);
  });
});

describe('caching', () => {
  it('caches identical reads; cache: false disables it', async () => {
    const cached = await client();
    assert.deepStrictEqual(await cached.getContentItems('posts'), await cached.getContentItems('posts'));
    assert.strictEqual(mockFetch.mock.callCount(), 1);

    const uncached = await client({ cache: false });
    await uncached.getContentItems('posts');
    await uncached.getContentItems('posts');
    assert.strictEqual(await uncached.clearCache(), undefined);
    assert.strictEqual(mockFetch.mock.callCount(), 3);
  });

  it('keys reads by path, effective access and query', async () => {
    const { store, map } = mapStore();
    const c = await client({ cache: { store }, apiKey: 'k' });
    await c.getContentItems('posts');
    await c.getContentItem({ model: 'posts', id: '1', populate: 1 });
    await c.getContentItem({ model: 'posts', id: '1', populate: 2 });
    await c.pages({ useAdminAccess: true });

    assert.strictEqual(mockFetch.mock.callCount(), 4);
    const keys = keysOf(map);
    assert.strictEqual(keys.length, 4);
    for (const key of keys) assert.match(key, /^\/[a-z/0-9]+\|(public|admin-[0-9a-f]{12})\|[0-9a-f]{40}$/);
    assert.ok(keys.some((key) => key.startsWith('/pages/pages|admin-')));
    assert.ok(keys.some((key) => key.startsWith('/content/items/posts|public|')));
  });

  it('shares entries between the defaultLanguage and the default locale', async () => {
    const c = await client({ defaultLanguage: 'de' });
    const pairs: Call[] = [
      (x) => x.getContentItem({ model: 'posts', id: '1', locale: 'de' }),
      (x) => x.getContentItem({ model: 'posts', id: '1' }),
      (x) => x.getContentItems('posts', { locale: 'de' }),
      (x) => x.getContentItems('posts', { locale: 'default' }),
      (x) => x.getContentTree('posts', { locale: 'de' }),
      (x) => x.getContentTree('posts'),
      (x) => x.getAggregateModel({ model: 'posts', pipeline: [], locale: 'de' }),
      (x) => x.getAggregateModel({ model: 'posts', pipeline: [] }),
      (x) => x.pageByRoute('/test', { locale: 'de' }),
      (x) => x.pageByRoute('/test'),
      (x) => x.pageById('1', { locale: 'de' }),
      (x) => x.pageById('1'),
      (x) => x.pages({ locale: 'de' }),
      (x) => x.pages(),
      (x) => x.pagesMenus({ locale: 'de' }),
      (x) => x.pagesMenus(),
      (x) => x.pagesMenu('main', { locale: 'de' }),
      (x) => x.pagesMenu('main', { locale: 'default' }),
    ];
    for (const call of pairs) await call(c);
    assert.strictEqual(mockFetch.mock.callCount(), pairs.length / 2);
  });

  it('does not cache getUnchainedContentItems, search, localize, assetById and healthCheck', async () => {
    const c = await client({ apiKey: 'k' });
    const calls: Call[] = [
      (x) => x.getUnchainedContentItems('posts', { includeUnpublished: true }),
      (x) => x.search({ index: 'idx' }),
      (x) => x.localize('proj'),
      (x) => x.assetById('a1'),
      (x) => x.healthCheck(),
    ];
    for (const call of calls) {
      await call(c);
      await call(c);
    }
    assert.strictEqual(mockFetch.mock.callCount(), calls.length * 2);
  });

  it('isolates admin and public clients sharing one store, without leaking the key', async () => {
    respond((_url, init) => createMockResponse({ body: { admin: (init?.headers as Record<string, string>)['api-Key'] !== undefined } }));
    const { store, map } = mapStore();
    const admin = await client({ apiKey: 'secret', useAdminAccess: true, cache: { store } });
    const pub = await client({ apiKey: 'secret', cache: { store } });

    assert.deepStrictEqual(await admin.getContentItem({ model: 'posts', id: '1' }), { admin: true });
    assert.deepStrictEqual(await pub.getContentItem({ model: 'posts', id: '1' }), { admin: false });
    assert.deepStrictEqual(await admin.pagesMenus(), { admin: true });
    assert.deepStrictEqual(await pub.pagesMenus(), { admin: false });
    assert.strictEqual(mockFetch.mock.callCount(), 4);
    for (const key of map.keys()) assert.ok(!key.includes('secret'), `raw apiKey leaked into ${key}`);

    // Per-request overrides are keyed by the effective access
    assert.deepStrictEqual(await admin.getContentItem({ model: 'posts', id: '1', useAdminAccess: true }), { admin: true });
    assert.deepStrictEqual(await admin.getContentItem({ model: 'posts', id: '1', useAdminAccess: false }), { admin: false });
    assert.strictEqual(mockFetch.mock.callCount(), 5);
  });

  it('uses a custom async store', async () => {
    const { store, map } = mapStore();
    const get = mock.method(store, 'get');
    const set = mock.method(store, 'set');
    const c = await client({ cache: { store } });

    await c.getContentItems('posts');
    await c.getContentItems('posts');
    assert.strictEqual(mockFetch.mock.callCount(), 1);
    assert.strictEqual(get.mock.callCount(), 2);
    assert.strictEqual(set.mock.callCount(), 1);
    assert.ok(String(set.mock.calls[0]!.arguments[0]).startsWith(`${PREFIX}/content/items/posts|public|`));

    await c.clearCache();
    assert.strictEqual(map.size, 0);
  });

  it('reads COCKPIT_CACHE_MAX; the cache.max option takes precedence', async () => {
    env.set({ COCKPIT_CACHE_MAX: '1' });
    const readABA = async (c: CockpitAPIClient) => {
      for (const id of ['a', 'b', 'a']) await c.getContentItem({ model: 'posts', id });
    };
    await readABA(await client());
    assert.strictEqual(mockFetch.mock.callCount(), 3); // max 1: b evicts a
    await readABA(await client({ cache: { max: 10 } }));
    assert.strictEqual(mockFetch.mock.callCount(), 5);
  });

  it('clearCache clears everything, or the entries starting with a pattern', async () => {
    const c = await client();
    await c.getContentItems('posts');
    await c.pagesMenus();
    await c.clearCache('/content/items/posts|');
    await c.getContentItems('posts');
    await c.pagesMenus();
    assert.deepStrictEqual([callsTo('/content/items/posts'), callsTo('/pages/menus')], [2, 1]);

    await c.clearCache();
    await c.getContentItems('posts');
    await c.pagesMenus();
    assert.deepStrictEqual([callsTo('/content/items/posts'), callsTo('/pages/menus')], [3, 2]);
  });

  describe('invalidation', () => {
    const readModel = async (c: CockpitAPIClient, model: string): Promise<void> => {
      await c.getContentItems(model);
      await c.getContentItem({ model });
      await c.getContentItem({ model, id: '1' });
      await c.getContentTree(model);
      await c.getAggregateModel({ model, pipeline: [] });
    };

    for (const [name, write] of [
      ['postContentItem', (c: CockpitAPIClient) => c.postContentItem('posts', { title: 'new' })],
      ['deleteContentItem', (c: CockpitAPIClient) => c.deleteContentItem('posts', '1')],
    ] as const) {
      it(`${name} clears all cached reads of that model only (no prefix collisions)`, async () => {
        const { store, map } = mapStore();
        const c = await client({ cache: { store } });
        for (const model of ['posts', 'postsArchive', 'posts-x', 'posts_x']) await readModel(c, model);
        await c.pagesMenus();
        const others = keysOf(map).filter((key) => !/\/posts[|/]/.test(key));
        assert.strictEqual(keysOf(map).length - others.length, 5);

        await write(c);
        assert.deepStrictEqual(keysOf(map), others);
        assert.strictEqual(others.length, 16);
      });
    }

    it('keeps the cache when the write fails', async () => {
      const c = await client();
      await c.getContentItems('posts');
      respondWith({ ok: false, status: 500, textBody: 'boom' });
      await assert.rejects(c.postContentItem('posts', { title: 'x' }));
      await c.getContentItems('posts');
      assert.strictEqual(callsTo('/content/items/posts'), 0);
    });

    it('clearRouteCache clears route maps, route lookups, routes and sitemap only', async () => {
      respond((url) =>
        createMockResponse({ body: url.pathname.endsWith('/pages/pages') ? [{ _id: 'p', _r: '/x', data: { collection: 'posts' } }] : {} }),
      );
      const { store, map } = mapStore();
      const c = await client({ cache: { store } });
      await c.getRouteForCollection('posts');
      await c.getRouteForCollection('posts', 'en');
      await c.pageByRoute('/x');
      await c.pageByRoute('/x', { locale: 'en' });
      await c.pagesRoutes();
      await c.pagesSitemap();
      const kept: Call[] = [
        (x) => x.pageById('p'),
        (x) => x.pages(),
        (x) => x.pagesSetting(),
        (x) => x.pagesMenus(),
        (x) => x.pagesMenu('main'),
        (x) => x.getContentItems('posts'),
      ];
      for (const call of kept) await call(c);
      const before = keysOf(map);

      await c.clearRouteCache();

      const after = keysOf(map);
      assert.strictEqual(after.length, kept.length);
      assert.deepStrictEqual(
        before.filter((key) => !after.includes(key)).map((key) => key.split('|')[0]).sort(),
        ['/pages/page', '/pages/page', '/pages/routes', '/pages/sitemap', 'ROUTE_MAPS:v4:default', 'ROUTE_MAPS:v4:en'],
      );
    });
  });
});

describe('resolvePageLinks', () => {
  // Serves the route map for /pages/pages and an item linking pages://page1 otherwise
  const routeAware = (route: () => string, body: unknown = { link: 'pages://page1' }) =>
    respond((url) =>
      url.pathname.endsWith('/pages/pages')
        ? createMockResponse({ body: [{ _id: 'page1', _r: route() }] })
        : createMockResponse({ body }),
    );
  const linkOf = async (c: CockpitAPIClient, id = '1') => (await c.getContentItem<{ link: string }>({ model: 'posts', id }))?.link;

  it('resolves pages:// links when enabled, never fetching the map at creation', async () => {
    routeAware(() => '/about');
    const c = await client({ resolvePageLinks: true });
    assert.strictEqual(mockFetch.mock.callCount(), 0);
    assert.strictEqual(await linkOf(c), '/about');
  });

  for (const options of [{}, { resolvePageLinks: false }]) {
    it(`leaves links alone and never fetches route maps with ${JSON.stringify(options)}`, async () => {
      routeAware(() => '/about');
      assert.strictEqual(await linkOf(await client(options)), 'pages://page1');
      assert.strictEqual(callsTo('/pages/pages'), 0);
    });
  }

  it('re-resolves links of cached responses after the route map changes', async () => {
    let route = '/about';
    routeAware(() => route);
    const c = await client({ resolvePageLinks: true });
    assert.strictEqual(await linkOf(c), '/about');

    route = '/about-us';
    await c.clearCache('ROUTE');
    assert.strictEqual(await linkOf(c), '/about-us');
    assert.strictEqual(callsTo('/content/item/posts/1'), 1);
    assert.strictEqual(callsTo('/pages/pages'), 2);
  });

  it('resolves links in graphQL responses, including cache hits', async () => {
    let route = '/about';
    routeAware(() => route, { data: { post: { link: 'pages://page1' } } });
    const c = await client({ resolvePageLinks: true });
    const query = parse('query Post { post { link } }');

    assert.deepStrictEqual(await c.graphQL(query), { data: { post: { link: '/about' } } });
    route = '/about-us';
    await c.clearRouteCache();
    assert.deepStrictEqual(await c.graphQL(query), { data: { post: { link: '/about-us' } } });
    assert.strictEqual(callsTo('/graphql'), 1);
  });

  it('serves a stale route map without waiting and picks up the refresh', async () => {
    let route = '/about';
    routeAware(() => route);
    // freshMs 0: every read of the cached route map is stale
    const c = await client({ resolvePageLinks: true, cache: { swr: { freshMs: 0, staleMs: 60_000 } } });

    assert.strictEqual(await linkOf(c, '1'), '/about');
    route = '/about-us';
    assert.strictEqual(await linkOf(c, '2'), '/about'); // stale map; refresh started
    assert.strictEqual(callsTo('/pages/pages'), 2);
    await waitFor(async () => (await linkOf(c, '3')) === '/about-us', 'the refreshed route map');
  });

  it('without a cache, loads the map per link-bearing response only and never memoizes failures', async () => {
    let up = false;
    respond((url) => {
      if (!url.pathname.endsWith('/pages/pages')) {
        return createMockResponse({ body: url.pathname.endsWith('/none') ? { title: 'no links' } : { link: 'pages://page1' } });
      }
      return up ? createMockResponse({ body: [{ _id: 'page1', _r: '/about' }] }) : createMockResponse({ ok: false, status: 503 });
    });
    const c = await client({ resolvePageLinks: true, cache: false });

    assert.deepStrictEqual(await c.getContentItem({ model: 'posts', id: 'none' }), { title: 'no links' });
    assert.strictEqual(callsTo('/pages/pages'), 0);
    assert.strictEqual(await linkOf(c), 'pages://page1');
    up = true;
    assert.strictEqual(await linkOf(c), '/about');
    assert.strictEqual(await linkOf(c), '/about');
    assert.strictEqual(callsTo('/pages/pages'), 3);
  });

  it('resolves links with the route map of the call locale', async () => {
    respond((url) => {
      if (url.pathname.endsWith('/pages/pages')) {
        const locale = url.searchParams.get('locale');
        return createMockResponse({ body: [{ _id: 'page1', _r: locale === 'default' ? '/ueber-uns' : `/${locale}/about` }] });
      }
      return createMockResponse({ body: url.pathname.endsWith('/graphql') ? { data: { link: 'pages://page1' } } : { link: 'pages://page1' } });
    });
    const c = await client({ resolvePageLinks: true, defaultLanguage: 'de' });
    const linkOfCall = async (call: Call) => ((await call(c)) as { link: string } | null)?.link;

    const cases: [Call, string][] = [
      [(x) => x.getContentItem({ model: 'posts', id: '1', locale: 'en' }), '/en/about'],
      [(x) => x.getContentItem({ model: 'posts', id: '1' }), '/ueber-uns'],
      [(x) => x.getContentItem({ model: 'posts', id: '1', locale: 'de' }), '/ueber-uns'],
      [(x) => x.pageByRoute('/x', { locale: 'fr' }), '/fr/about'],
      [(x) => x.pageById('p', { locale: 'en' }), '/en/about'],
      [(x) => x.pagesMenu('main', { locale: 'fr' }), '/fr/about'],
      [(x) => x.pagesMenus({ locale: 'it' }), '/it/about'],
      [(x) => x.localize('proj', { locale: 'en' }), '/en/about'],
      [(x) => x.pagesSetting('it'), '/it/about'],
    ];
    for (const [call, expected] of cases) assert.strictEqual(await linkOfCall(call), expected);
    assert.deepStrictEqual(await c.graphQL(parse('query Q { link }')), { data: { link: '/ueber-uns' } });

    const routeMapLocales = fetchUrls(mockFetch)
      .map((url) => new URL(url))
      .filter((url) => url.pathname.endsWith('/pages/pages'))
      .map((url) => url.searchParams.get('locale'));
    // One map per locale; 'de' (defaultLanguage) shares the default map
    assert.deepStrictEqual(routeMapLocales.sort(), ['default', 'en', 'fr', 'it']);
  });

  it('fetches the tenant-scoped route map with the client credentials', async () => {
    routeAware(() => '/about');
    const c = await client({ resolvePageLinks: true, tenant: 'mytenant', useAdminAccess: true, apiKey: 'secret-key' });
    assert.strictEqual(await linkOf(c), '/about');

    const index = fetchUrls(mockFetch).findIndex((url) => url.includes('/pages/pages'));
    const [url, init] = fetchCall(mockFetch, index);
    assert.strictEqual(new URL(url).pathname, '/:mytenant/api/pages/pages');
    assert.strictEqual(init.headers['api-Key'], 'secret-key');
    assert.strictEqual(callsTo('/pages/pages'), 1);
  });

  it('leaves links unresolved without failing when the route map request fails', async () => {
    respond((url) =>
      url.pathname.endsWith('/pages/pages')
        ? createMockResponse({ ok: false, status: 500, textBody: 'boom' })
        : createMockResponse({ body: { link: 'pages://page1' } }),
    );
    assert.strictEqual(await linkOf(await client({ resolvePageLinks: true })), 'pages://page1');
  });

  it('loads the route map concurrently with the request on a cold cache', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    respond(async (url) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight--;
      return url.pathname.endsWith('/pages/pages')
        ? createMockResponse({ body: [{ _id: 'page1', _r: '/about' }] })
        : createMockResponse({ body: { link: 'pages://page1' } });
    });

    assert.strictEqual(await linkOf(await client({ resolvePageLinks: true })), '/about');
    assert.strictEqual(maxInFlight, 2);
    assert.strictEqual(callsTo('/pages/pages'), 1);
  });

  it('does not leak an unhandled rejection when an unneeded route map load fails', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      respond((url) => {
        if (url.pathname.endsWith('/pages/pages') || url.pathname.endsWith('/fail')) {
          return createMockResponse({ ok: false, status: 500, textBody: 'boom' });
        }
        return createMockResponse({ body: { title: 'no links' } });
      });
      const c = await client({ resolvePageLinks: true });

      assert.deepStrictEqual(await c.getContentItem({ model: 'posts', id: '1' }), { title: 'no links' });
      await assert.rejects(c.getContentItem({ model: 'posts', id: 'fail' }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepStrictEqual(unhandled, []);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('resolves links in HTML strings, keeps anchors and never mutates the cached copy', async () => {
    routeAware(() => '/about', { html: '<a href="pages://page1#team">x</a>', list: ['pages://page1', 'pages://unknown'] });
    const c = await client({ resolvePageLinks: true });
    const expected = { html: '<a href="/about#team">x</a>', list: ['/about', 'pages://unknown'] };
    assert.deepStrictEqual(await c.getContentItem({ model: 'posts', id: '1' }), expected);
    assert.deepStrictEqual(await c.getContentItem({ model: 'posts', id: '1' }), expected);
    assert.strictEqual(callsTo('/content/item'), 1);
  });

  it('never resolves links in writes, uploads and getUnchainedContentItems', async () => {
    respond((url) => {
      if (url.pathname.endsWith('/pages/pages')) return createMockResponse({ body: [{ _id: 'page1', _r: '/about' }] });
      if (url.pathname.endsWith('/unchained/assets/upload')) return createMockResponse({ body: { assets: [{ _id: 'a', link: 'pages://page1' }] } });
      if (url.pathname.includes('/unchained/content/items')) return createMockResponse({ body: [{ link: 'pages://page1' }] });
      return createMockResponse({ body: { link: 'pages://page1' } });
    });
    const c = await client({ resolvePageLinks: true, apiKey: 'k' });

    assert.deepStrictEqual(await c.postContentItem('posts', { link: 'pages://page1' }), { link: 'pages://page1' });
    assert.deepStrictEqual(await c.deleteContentItem('posts', '1'), { link: 'pages://page1' });
    assert.deepStrictEqual(await c.getUnchainedContentItems('posts'), { data: [{ link: 'pages://page1' }] });
    const uploaded = await c.uploadAssets([new File(['x'], 'x.txt')]);
    assert.strictEqual((uploaded?.assets[0] as unknown as { link: string }).link, 'pages://page1');
    assert.strictEqual(callsTo('/pages/pages'), 0);
  });

  it('never writes resolved links into a store that returns shared references', async () => {
    routeAware(() => '/about');
    const { store, map } = mapStore();
    const c = await client({ cache: { store }, resolvePageLinks: true });

    assert.strictEqual(await linkOf(c), '/about');
    assert.strictEqual(await linkOf(c), '/about');
    const stored = [...map.entries()].find(([key]) => key.includes('/content/item/posts/1|'));
    assert.ok(stored, 'item should be cached');
    assert.match(JSON.stringify(stored[1]), /pages:\/\/page1/);
  });
});
