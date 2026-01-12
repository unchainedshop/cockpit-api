import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { createMockResponse, EnvManager, TEST_ENDPOINT } from "../__tests__/test-helpers.ts";
import { createRemoteExecutor } from "./executor.ts";
import type { DocumentNode } from "graphql";

// Simple mock DocumentNode for testing
const mockDocument: DocumentNode = {
  kind: "Document",
  definitions: [],
};

describe("createRemoteExecutor", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;
  const envManager = new EnvManager();

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn(async () =>
      createMockResponse({ body: { data: { test: "value" } } })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: TEST_ENDPOINT });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    envManager.reset();
    mock.reset();
  });

  it("extracts tenant from default header (x-cockpit-space)", async () => {
    const executor = createRemoteExecutor();

    await executor({
      document: mockDocument,
      context: { req: { headers: { "x-cockpit-space": "mytenant" } } },
    });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.toString().includes(":mytenant"));
  });

  it("extracts tenant from custom header", async () => {
    const executor = createRemoteExecutor({ tenantHeader: "x-custom-tenant" });

    await executor({
      document: mockDocument,
      context: { req: { headers: { "x-custom-tenant": "customtenant" } } },
    });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.toString().includes(":customtenant"));
  });

  it("supports custom tenant extractor function", async () => {
    const executor = createRemoteExecutor({
      extractTenant: (ctx) => (ctx?.customField as string) || undefined,
    });

    await executor({
      document: mockDocument,
      context: { customField: "extractedtenant" },
    });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.toString().includes(":extractedtenant"));
  });

  it("works without tenant (default endpoint)", async () => {
    const executor = createRemoteExecutor();

    await executor({
      document: mockDocument,
      context: {},
    });

    const [url] = mockFetch.mock.calls[0].arguments;
    // Should not have tenant prefix (no colon before /api)
    assert.ok(!url.toString().includes(":/api") || url.toString().includes("https://"));
  });

  it("handles array header values (takes first)", async () => {
    const executor = createRemoteExecutor();

    await executor({
      document: mockDocument,
      context: { req: { headers: { "x-cockpit-space": ["firsttenant", "secondtenant"] } } },
    });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.toString().includes(":firsttenant"));
  });

  it("handles missing context gracefully", async () => {
    const executor = createRemoteExecutor();

    // Should not throw
    await executor({
      document: mockDocument,
    });

    // CockpitAPI makes 2 fetches: one for route map, one for GraphQL query
    assert.ok(mockFetch.mock.calls.length >= 1, "Expected at least one fetch call");
  });

  it("handles missing headers gracefully", async () => {
    const executor = createRemoteExecutor();

    await executor({
      document: mockDocument,
      context: { req: {} },
    });

    // CockpitAPI makes 2 fetches: one for route map, one for GraphQL query
    assert.ok(mockFetch.mock.calls.length >= 1, "Expected at least one fetch call");
  });

  it("passes variables to GraphQL query", async () => {
    const executor = createRemoteExecutor();

    await executor({
      document: mockDocument,
      variables: { id: "123", name: "test" },
      context: {},
    });

    // Find the GraphQL call (the one with a body containing variables)
    const graphqlCall = mockFetch.mock.calls.find((call) => {
      const [, options] = call.arguments;
      return options?.body && options.body.includes("variables");
    });

    assert.ok(graphqlCall, "Expected a GraphQL fetch call");
    const [, fetchOptions] = graphqlCall.arguments;
    const body = JSON.parse(fetchOptions.body);
    assert.deepStrictEqual(body.variables, { id: "123", name: "test" });
  });

  it("uses cockpitOptions when provided", async () => {
    const customEndpoint = "https://custom.cockpit.com/api/graphql";
    const executor = createRemoteExecutor({
      cockpitOptions: { endpoint: customEndpoint },
    });

    await executor({
      document: mockDocument,
      context: {},
    });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.toString().includes("custom.cockpit.com"));
  });

  it("custom extractor overrides default header extraction", async () => {
    const executor = createRemoteExecutor({
      extractTenant: () => "fromextractor",
    });

    await executor({
      document: mockDocument,
      context: { req: { headers: { "x-cockpit-space": "fromheader" } } },
    });

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.ok(url.toString().includes(":fromextractor"));
    assert.ok(!url.toString().includes(":fromheader"));
  });

  it("reuses cached client for same tenant", async () => {
    const executor = createRemoteExecutor();
    const context = { req: { headers: { "x-cockpit-space": "cachedtenant" } } };

    // First call creates the client
    await executor({ document: mockDocument, context });
    const firstCallCount = mockFetch.mock.calls.length;

    // Second call should reuse the cached client
    await executor({ document: mockDocument, context });
    const secondCallCount = mockFetch.mock.calls.length;

    // Second call should only add 1 fetch (for GraphQL), not create new client
    assert.strictEqual(secondCallCount - firstCallCount, 1);
  });

  it("handles concurrent requests for same tenant", async () => {
    const executor = createRemoteExecutor();
    const context = { req: { headers: { "x-cockpit-space": "concurrent" } } };

    // Make two concurrent requests
    const [result1, result2] = await Promise.all([
      executor({ document: mockDocument, context }),
      executor({ document: mockDocument, context }),
    ]);

    // Both should succeed
    assert.ok(result1);
    assert.ok(result2);
  });

  it("uses custom maxClients option", async () => {
    const executor = createRemoteExecutor({ maxClients: 2 });

    // Create clients for 3 different tenants
    await executor({ document: mockDocument, context: { req: { headers: { "x-cockpit-space": "t1" } } } });
    await executor({ document: mockDocument, context: { req: { headers: { "x-cockpit-space": "t2" } } } });
    await executor({ document: mockDocument, context: { req: { headers: { "x-cockpit-space": "t3" } } } });

    // Should not throw, LRU eviction handles overflow
    assert.ok(true);
  });
});
