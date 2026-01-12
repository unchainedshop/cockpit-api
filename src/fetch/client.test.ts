import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { createMockResponse, EnvManager, TEST_ENDPOINT } from "../__tests__/test-helpers.ts";
import { createFetchClient } from "./client.ts";

describe("createFetchClient", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;
  const envManager = new EnvManager();

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn(async () => createMockResponse({ body: { data: "test" } }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    envManager.reset();
    mock.reset();
  });

  it("throws when no endpoint provided", () => {
    envManager.clear("COCKPIT_GRAPHQL_ENDPOINT");
    envManager.clear("NEXT_PUBLIC_COCKPIT_ENDPOINT");
    assert.throws(() => createFetchClient(), /endpoint is required/);
  });

  it("uses provided endpoint", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pages();

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("test.cockpit.com"));
  });

  it("uses COCKPIT_GRAPHQL_ENDPOINT env var as fallback", async () => {
    envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: "https://env.cockpit.com/graphql" });
    const client = createFetchClient();
    await client.pages();

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("env.cockpit.com"));
  });

  it("uses NEXT_PUBLIC_COCKPIT_ENDPOINT as secondary fallback", async () => {
    envManager.clear("COCKPIT_GRAPHQL_ENDPOINT");
    envManager.set({ NEXT_PUBLIC_COCKPIT_ENDPOINT: "https://next.cockpit.com/api" });
    const client = createFetchClient();
    await client.pages();

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("next.cockpit.com"));
  });

  it("includes tenant in URL path", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT, tenant: "mytenant" });
    await client.pages();

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes(":mytenant/api"));
  });

  it("uses no-store cache by default", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pages();

    const [, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(options.cache, "no-store");
  });

  it("allows custom cache mode", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT, cache: "force-cache" });
    await client.pages();

    const [, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(options.cache, "force-cache");
  });

  it("includes api-Key header when apiKey provided", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT, apiKey: "mysecret" });
    await client.pages();

    const [, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(options.headers["api-Key"], "mysecret");
  });

  it("includes custom headers", async () => {
    const client = createFetchClient({
      endpoint: TEST_ENDPOINT,
      headers: { "X-Custom": "value" },
    });
    await client.pages();

    const [, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(options.headers["X-Custom"], "value");
  });
});

describe("pageByRoute", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn(async () => createMockResponse({ body: { title: "Test Page" } }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  it("constructs correct URL", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pageByRoute("/about");

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("/pages/page"));
    assert.ok(url.includes("route=%2Fabout"));
  });

  it("passes locale parameter", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pageByRoute("/about", { locale: "en" });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("locale=en"));
  });

  it("normalizes de locale to default", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pageByRoute("/about", { locale: "de" });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("locale=default"));
  });

  it("passes populate parameter", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pageByRoute("/about", { populate: 2 });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("populate=2"));
  });
});

describe("pages", () => {
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

  it("constructs correct URL", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pages();

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("/pages/pages"));
  });

  it("uses default locale when not specified", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pages();

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("locale=default"));
  });

  it("normalizes array response to { data } format", async () => {
    mockFetch = mock.fn(async () => createMockResponse({ body: [{ _id: '1' }, { _id: '2' }] }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    const result = await client.pages();

    assert.ok(result !== null);
    assert.ok('data' in result);
    assert.ok(Array.isArray(result.data));
    assert.strictEqual(result.data.length, 2);
  });

  it("returns wrapped response as-is when API returns { data, meta }", async () => {
    mockFetch = mock.fn(async () => createMockResponse({
      body: { data: [{ _id: '1' }], meta: { total: 5 } }
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    const result = await client.pages({ skip: 0 });

    assert.ok(result !== null);
    assert.ok('data' in result);
    assert.ok('meta' in result);
    assert.strictEqual(result.meta?.total, 5);
  });

  it("returns null for 404 response", async () => {
    mockFetch = mock.fn(async () => createMockResponse({ status: 404, ok: false }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    const result = await client.pages();

    assert.strictEqual(result, null);
  });
});

describe("pageById", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn(async () => createMockResponse({ body: { _id: "123" } }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  it("constructs correct URL with id", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pageById("65a94b56f3c1b3ff040f00e5");

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("/pages/page/65a94b56f3c1b3ff040f00e5"));
  });

  it("passes locale and populate options", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.pageById("page123", { locale: "en", populate: 2 });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("locale=en"));
    assert.ok(url.includes("populate=2"));
  });
});

describe("getContentItems", () => {
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

  it("constructs correct URL with model", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.getContentItems("news");

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("/content/items/news"));
  });

  it("passes additional query params", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.getContentItems("news", { limit: 10, skip: 5 });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("limit=10"));
    assert.ok(url.includes("skip=5"));
  });

  it("normalizes array response to { data } format", async () => {
    mockFetch = mock.fn(async () => createMockResponse({ body: [{ id: 1 }, { id: 2 }] }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    const result = await client.getContentItems("news");

    assert.ok(result !== null);
    assert.ok('data' in result);
    assert.ok(Array.isArray(result.data));
    assert.strictEqual(result.data.length, 2);
  });

  it("returns wrapped response as-is when API returns { data, meta }", async () => {
    mockFetch = mock.fn(async () => createMockResponse({
      body: { data: [{ id: 1 }], meta: { total: 10 } }
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    const result = await client.getContentItems("news", { skip: 0 });

    assert.ok(result !== null);
    assert.ok('data' in result);
    assert.ok('meta' in result);
    assert.strictEqual(result.meta?.total, 10);
  });

  it("returns null for 404 response", async () => {
    mockFetch = mock.fn(async () => createMockResponse({ status: 404, ok: false }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    const result = await client.getContentItems("nonexistent");

    assert.strictEqual(result, null);
  });
});

describe("getContentItem", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn(async () => createMockResponse({ body: { _id: "123" } }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  it("constructs correct URL with model and id", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.getContentItem("news", "abc123");

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("/content/item/news/abc123"));
  });

  it("constructs URL without id for singleton", async () => {
    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.getContentItem("settings");

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("/content/item/settings"));
    assert.ok(!url.includes("/content/item/settings/"));
  });
});

describe("fetchRaw", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  it("returns null for 404 response", async () => {
    mockFetch = mock.fn(async () => createMockResponse({ ok: false, status: 404 }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    const result = await client.fetchRaw("/custom/path");

    assert.strictEqual(result, null);
  });

  it("throws on non-404 error response", async () => {
    mockFetch = mock.fn(async () => createMockResponse({ ok: false, status: 500 }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });

    await assert.rejects(
      () => client.fetchRaw("/custom/path"),
      /Error fetching.*500/
    );
  });

  it("filters undefined params from query string", async () => {
    mockFetch = mock.fn(async () => createMockResponse({ body: {} }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = createFetchClient({ endpoint: TEST_ENDPOINT });
    await client.fetchRaw("/test", { defined: "value", undef: undefined });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.includes("defined=value"));
    assert.ok(!url.includes("undef"));
  });
});
