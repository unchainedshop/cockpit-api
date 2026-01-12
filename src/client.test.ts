import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { createMockResponse, EnvManager, TEST_ENDPOINT, assertThrows } from './__tests__/test-helpers.ts';
import { CockpitAPI } from './index.ts';

describe('CockpitAPI', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  describe('factory function', () => {
    const envManager = new EnvManager();

    afterEach(() => {
      envManager.reset();
    });

    it('creates client with endpoint', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });
      assert.ok(client);
      assert.ok(typeof client.graphQL === 'function');
    });

    it('handles tenant option', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT, tenant: 'mytenant' });
      assert.ok(client);
    });

    it('throws on invalid tenant format (path traversal)', async () => {
      await assertThrows(
        () => CockpitAPI({ endpoint: TEST_ENDPOINT, tenant: '../admin' }),
        'Invalid tenant format'
      );
    });

    it('throws on invalid tenant format (special chars)', async () => {
      await assertThrows(
        () => CockpitAPI({ endpoint: TEST_ENDPOINT, tenant: 'tenant/bad' }),
        'Invalid tenant format'
      );
    });

    it('falls back to COCKPIT_GRAPHQL_ENDPOINT env var', async () => {
      envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: TEST_ENDPOINT });
      const client = await CockpitAPI();
      assert.ok(client);
      assert.ok(typeof client.graphQL === 'function');
    });

    it('throws when no endpoint provided via options or env', async () => {
      envManager.clear('COCKPIT_GRAPHQL_ENDPOINT');
      await assertThrows(
        () => CockpitAPI(),
        'endpoint is required'
      );
    });

    it('options endpoint takes precedence over env var', async () => {
      envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: 'https://env.example.com/api/graphql' });

      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItem({ model: 'posts' });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('test.cockpit.com'));
      assert.ok(!url.toString().includes('env.example.com'));
    });
  });

  describe('graphQL', () => {
    it('sends POST request with correct Content-Type', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { data: 'test' } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const mockDocument = { kind: 'Document', definitions: [] } as import('graphql').DocumentNode;
      await client.graphQL(mockDocument, { var1: 'value1' });

      assert.strictEqual(mockFetch.mock.calls.length, 1);
      const [url, options] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('graphql'));
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.headers['Content-Type'], 'application/json');
    });

    it('includes query and variables in body', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { data: 'test' } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const mockDocument = { kind: 'Document', definitions: [] } as import('graphql').DocumentNode;
      await client.graphQL(mockDocument, { var1: 'value1' });

      const [, options] = mockFetch.mock.calls[0].arguments;
      const body = JSON.parse(options.body);
      assert.ok('query' in body);
      assert.ok('variables' in body);
      assert.strictEqual(body.variables.var1, 'value1');
    });

    it('prepends tenant to endpoint path when tenant set', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT, tenant: 'mytenant' });

      mockFetch = mock.fn(async () => createMockResponse({ body: { data: 'test' } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const mockDocument = { kind: 'Document', definitions: [] } as import('graphql').DocumentNode;
      await client.graphQL(mockDocument);

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes(':mytenant'));
    });
  });

  describe('getContentItem', () => {
    it('throws when model not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.getContentItem({ model: '' }),
        'Please provide a model'
      );
    });

    it('constructs correct URL with model', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { id: '123' } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItem({ model: 'posts' });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/content/item/posts'));
    });

    it('constructs correct URL with model and id', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { id: '123' } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItem({ model: 'posts', id: '123' });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/content/item/posts/123'));
    });

    it('passes locale to query params', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItem({ model: 'posts', locale: 'en' });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('locale=en'));
    });

    it('throws on invalid model format', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.getContentItem({ model: 'posts/../admin' }),
        'Invalid model format'
      );
    });

    it('throws on invalid id format', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.getContentItem({ model: 'posts', id: '123/../../etc' }),
        'Invalid id format'
      );
    });
  });

  describe('getContentItems', () => {
    it('throws when model not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.getContentItems(''),
        'Please provide a model'
      );
    });

    it('constructs correct URL', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItems('posts');

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/content/items/posts'));
    });
  });

  describe('postContentItem', () => {
    it('throws when model not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.postContentItem('', {}),
        'Please provide a model'
      );
    });

    it('sends POST request', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { _id: 'new123' } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.postContentItem('posts', { title: 'Test' });

      const [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.method, 'POST');
    });

    it('wraps item in { data: item } body', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.postContentItem('posts', { title: 'Test' });

      const [, options] = mockFetch.mock.calls[0].arguments;
      const body = JSON.parse(options.body);
      assert.ok('data' in body);
      assert.strictEqual(body.data.title, 'Test');
    });
  });

  describe('deleteContentItem', () => {
    it('throws when model not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.deleteContentItem('', '123'),
        'Please provide a model'
      );
    });

    it('throws when id not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.deleteContentItem('posts', ''),
        'Please provide an id'
      );
    });

    it('sends DELETE request', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.deleteContentItem('posts', '123');

      const [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.method, 'DELETE');
    });
  });

  describe('pages', () => {
    it('constructs correct URL', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pages();

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/pages/pages'));
    });
  });

  describe('pageById', () => {
    it('throws when id not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.pageById(''),
        'Please provide a page id'
      );
    });

    it('constructs correct URL with id', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { _id: '123' } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pageById('65a94b56f3c1b3ff040f00e5');

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/pages/page/65a94b56f3c1b3ff040f00e5'));
    });

    it('passes locale and populate options', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pageById('page123', { locale: 'en', populate: 2 });

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = url.toString();
      assert.ok(urlStr.includes('locale=en'));
      assert.ok(urlStr.includes('populate=2'));
    });
  });

  describe('localize', () => {
    it('throws when projectName not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.localize(''),
        'Please provide projectName'
      );
    });

    it('constructs correct URL with projectName', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.localize('myproject');

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/lokalize/project/myproject'));
    });
  });

  describe('assetById', () => {
    it('throws when assetId not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.assetById(''),
        'Please provide assetId'
      );
    });
  });

  describe('imageAssetById', () => {
    it('throws when assetId not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.imageAssetById(''),
        'Please provide assetId'
      );
    });
  });

  describe('error handling', () => {
    it('returns null on 404 response', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ ok: false, status: 404 }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await client.getContentItem({ model: 'posts', id: 'notfound' });
      assert.strictEqual(result, null);
    });

    it('throws on non-OK response (500)', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({
        ok: false,
        status: 500,
        textBody: 'Internal Server Error',
      }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await assertThrows(
        () => client.getContentItem({ model: 'posts' }),
        '500'
      );
    });
  });

  describe('authentication', () => {
    const envManager = new EnvManager();

    afterEach(() => {
      envManager.reset();
    });

    it('injects api-Key header when useAdminAccess=true with apiKey option', async () => {
      const client = await CockpitAPI({
        endpoint: TEST_ENDPOINT,
        useAdminAccess: true,
        apiKey: 'mysecret123',
      });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItem({ model: 'posts' });

      const [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.headers['api-Key'], 'mysecret123');
    });

    it('uses COCKPIT_SECRET env var when apiKey not provided', async () => {
      envManager.set({ COCKPIT_SECRET: 'envsecret' });

      const client = await CockpitAPI({
        endpoint: TEST_ENDPOINT,
        useAdminAccess: true,
      });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItem({ model: 'posts' });

      const [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.headers['api-Key'], 'envsecret');
    });

    it('uses COCKPIT_SECRET_<TENANT> for tenant-specific keys', async () => {
      envManager.set({ COCKPIT_SECRET_MYTENANT: 'tenantsecret' });

      const client = await CockpitAPI({
        endpoint: TEST_ENDPOINT,
        tenant: 'mytenant',
        useAdminAccess: true,
      });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItem({ model: 'posts' });

      const [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.headers['api-Key'], 'tenantsecret');
    });

    it('per-request useAdminAccess=true injects api-Key header when factory-level is false', async () => {
      const client = await CockpitAPI({
        endpoint: TEST_ENDPOINT,
        useAdminAccess: false,
        apiKey: 'mysecret123',
      });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      // Request WITHOUT useAdminAccess - should NOT have api-Key
      await client.getContentItem({ model: 'posts' });
      const [, optionsNoAdmin] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(optionsNoAdmin.headers['api-Key'], undefined);

      // Request WITH useAdminAccess - should have api-Key
      await client.getContentItem({ model: 'posts', useAdminAccess: true });
      const [, optionsWithAdmin] = mockFetch.mock.calls[1].arguments;
      assert.strictEqual(optionsWithAdmin.headers['api-Key'], 'mysecret123');
    });

    it('per-request useAdminAccess=false overrides factory-level useAdminAccess=true', async () => {
      const client = await CockpitAPI({
        endpoint: TEST_ENDPOINT,
        useAdminAccess: true,
        apiKey: 'mysecret123',
      });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      // Request with explicit useAdminAccess=false - should NOT have api-Key
      await client.getContentItem({ model: 'posts', useAdminAccess: false });
      const [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.headers['api-Key'], undefined);
    });

    it('per-request useAdminAccess works with getContentItems', async () => {
      const client = await CockpitAPI({
        endpoint: TEST_ENDPOINT,
        apiKey: 'mysecret123',
      });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItems('posts', { useAdminAccess: true });
      const [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.headers['api-Key'], 'mysecret123');
    });
  });

  describe('clearCache', () => {
    it('clears cache without error', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });
      client.clearCache();
      assert.ok(true);
    });

    it('clears cache with pattern without error', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });
      client.clearCache('ROUTE');
      assert.ok(true);
    });
  });
});

describe('Extended API methods', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  describe('search', () => {
    it('throws when index not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.search({ index: '' }),
        'Please provide a search index'
      );
    });

    it('constructs correct URL for search', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { hits: [], total: 0 } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.search({ index: 'content' });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/detektivo/search/content'));
    });

    it('includes search query parameters', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { hits: [], total: 0 } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.search({ index: 'pages', q: 'restaurant', limit: 10, offset: 5 });

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = url.toString();
      assert.ok(urlStr.includes('q=restaurant'));
      assert.ok(urlStr.includes('limit=10'));
      assert.ok(urlStr.includes('offset=5'));
    });
  });

  describe('getContentItems with extended options', () => {
    it('passes pagination parameters', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItems('news', { limit: 10, skip: 5 });

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = url.toString();
      assert.ok(urlStr.includes('limit=10'));
      assert.ok(urlStr.includes('skip=5'));
    });

    it('passes sort parameter', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItems('news', { sort: { _created: -1 } });

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = decodeURIComponent(url.toString());
      assert.ok(urlStr.includes('sort'));
      assert.ok(urlStr.includes('_created'));
    });

    it('passes filter parameter', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItems('news', { filter: { published: true } });

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = decodeURIComponent(url.toString());
      assert.ok(urlStr.includes('filter'));
      assert.ok(urlStr.includes('published'));
    });

    it('passes populate parameter', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentItems('news', { populate: 2 });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('populate=2'));
    });
  });

  describe('getContentTree with extended options', () => {
    it('passes parent parameter', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getContentTree('categories', { parent: 'parent123' });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('parent=parent123'));
    });
  });

  describe('pagesMenus with options', () => {
    it('supports string locale (legacy)', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pagesMenus('en');

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('locale=en'));
    });

    it('supports options object with inactive', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pagesMenus({ locale: 'de', inactive: true });

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = url.toString();
      assert.ok(urlStr.includes('inactive=true'));
    });
  });

  describe('pagesMenu with options', () => {
    it('supports string locale (legacy)', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pagesMenu('footer', 'en');

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/pages/menu/footer'));
      assert.ok(url.toString().includes('locale=en'));
    });

    it('supports options object with inactive', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pagesMenu('header', { inactive: true });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('inactive=true'));
    });
  });

  describe('pageByRoute with options', () => {
    it('supports string locale (legacy)', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pageByRoute('/about', 'en');

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = decodeURIComponent(url.toString());
      assert.ok(urlStr.includes('route=/about'));
      assert.ok(urlStr.includes('locale=en'));
    });

    it('supports options object with populate', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pageByRoute('/contact', { locale: 'de', populate: 3 });

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('populate=3'));
    });
  });

  describe('pages with extended options', () => {
    it('passes pagination and filter parameters', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pages({ limit: 5, filter: { type: 'layout' } });

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = decodeURIComponent(url.toString());
      assert.ok(urlStr.includes('limit=5'));
      assert.ok(urlStr.includes('filter'));
      assert.ok(urlStr.includes('layout'));
    });
  });

  describe('getAggregateModel', () => {
    it('throws when model not provided', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      await assertThrows(
        () => client.getAggregateModel({ model: '', pipeline: [] }),
        'Please provide a model'
      );
    });

    it('constructs correct URL with pipeline', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.getAggregateModel({
        model: 'posts',
        pipeline: [{ $match: { published: true } }],
      });

      const [url] = mockFetch.mock.calls[0].arguments;
      const urlStr = decodeURIComponent(url.toString());
      assert.ok(urlStr.includes('/content/aggregate/posts'));
      assert.ok(urlStr.includes('pipeline'));
    });
  });

  describe('pagesRoutes', () => {
    it('constructs correct URL', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pagesRoutes('en');

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/pages/routes'));
      assert.ok(url.toString().includes('locale=en'));
    });
  });

  describe('pagesSitemap', () => {
    it('constructs correct URL', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pagesSitemap();

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/pages/sitemap'));
    });
  });

  describe('pagesSetting', () => {
    it('constructs correct URL', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await client.pagesSetting('fr');

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/pages/settings'));
      assert.ok(url.toString().includes('locale=fr'));
    });
  });

  describe('getFullRouteForSlug', () => {
    it('returns route for matching slug', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      // Mock the route map fetch
      mockFetch = mock.fn(async () => createMockResponse({
        body: [
          { data: { collection: 'posts' }, _r: '/blog' },
        ],
      }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const route = await client.getFullRouteForSlug('posts');
      assert.strictEqual(route, '/blog');
    });

    it('returns undefined for non-matching slug', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({
        body: [],
      }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const route = await client.getFullRouteForSlug('nonexistent');
      assert.strictEqual(route, undefined);
    });
  });

  describe('healthCheck', () => {
    it('constructs correct URL', async () => {
      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });

      mockFetch = mock.fn(async () => createMockResponse({ body: { status: 'ok' } }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await client.healthCheck();

      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/system/healthcheck'));
      assert.deepStrictEqual(result, { status: 'ok' });
    });
  });

  describe('cache options from env vars', () => {
    const envManager = new EnvManager();

    afterEach(() => {
      envManager.reset();
    });

    it('uses COCKPIT_CACHE_MAX env var', async () => {
      envManager.set({ COCKPIT_CACHE_MAX: '50' });

      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });
      assert.ok(client); // Client created successfully with env var
    });

    it('uses COCKPIT_CACHE_TTL env var', async () => {
      envManager.set({ COCKPIT_CACHE_TTL: '5000' });

      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT });
      assert.ok(client); // Client created successfully with env var
    });

    it('uses direct cache options over env vars', async () => {
      envManager.set({ COCKPIT_CACHE_MAX: '50', COCKPIT_CACHE_TTL: '5000' });

      const client = await CockpitAPI({
        endpoint: TEST_ENDPOINT,
        cache: { max: 200, ttl: 30000 },
      });
      assert.ok(client); // Client created successfully with direct cache options
    });
  });

  describe('preloadRoutes option', () => {
    it('preloads route replacements when preloadRoutes is true', async () => {
      const mockResponse = [
        { _id: 'page1', _r: '/about', slug: 'about' },
        { _id: 'page2', _r: '/contact', slug: 'contact' },
      ];
      mockFetch = mock.fn(async () => createMockResponse({ body: mockResponse }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT, preloadRoutes: true });
      assert.ok(client);

      // Should have made a fetch call for route replacements during init
      assert.ok(mockFetch.mock.calls.length >= 1);
      const [url] = mockFetch.mock.calls[0].arguments;
      assert.ok(url.toString().includes('/pages/pages'));
    });

    it('skips route preloading when preloadRoutes is false (default)', async () => {
      mockFetch = mock.fn(async () => createMockResponse({ body: [] }));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = await CockpitAPI({ endpoint: TEST_ENDPOINT, preloadRoutes: false });
      assert.ok(client);

      // Should NOT have made any fetch calls during init
      assert.strictEqual(mockFetch.mock.calls.length, 0);
    });
  });
});
