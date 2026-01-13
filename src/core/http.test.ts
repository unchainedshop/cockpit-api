import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { createHttpClient } from "./http.ts";
import type { CockpitConfig } from "./config.ts";
import type { ResponseTransformer } from "../transformers/image-path.ts";
import { createMockResponse } from "../__tests__/test-helpers.ts";

describe("createHttpClient", () => {
  let mockFetch: ReturnType<typeof mock.fn<typeof fetch>>;
  const originalFetch = globalThis.fetch;

  const createTestConfig = (overrides: Partial<CockpitConfig> = {}): CockpitConfig => ({
    endpoint: new URL("https://test.example.com/api"),
    useAdminAccess: false,
    defaultLanguage: "de",
    cachePrefix: "test:prefix:",
    ...overrides,
  });

  const identityTransformer: ResponseTransformer = {
    transform: <T>(data: T) => data,
  };

  const doubleTransformer: ResponseTransformer = {
    transform: <T>(data: T) => {
      if (typeof data === "object" && data !== null && "value" in data) {
        return { ...data, value: (data as { value: number }).value * 2 } as T;
      }
      return data;
    },
  };

  beforeEach(() => {
    mockFetch = mock.fn<typeof fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  describe("fetch (GET requests)", () => {
    it("makes GET request and returns transformed JSON", async () => {
      const responseData = { name: "test" };
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: responseData })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      const result = await client.fetch<{ name: string }>("https://test.example.com/api/test");

      assert.deepStrictEqual(result, responseData);
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });

    it("applies response transformer", async () => {
      const responseData = { value: 10 };
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: responseData })),
      );

      const client = createHttpClient(createTestConfig(), doubleTransformer);
      const result = await client.fetch<{ value: number }>("https://test.example.com/api/test");

      assert.deepStrictEqual(result, { value: 20 });
    });

    it("returns null for 404 responses", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ ok: false, status: 404 })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      const result = await client.fetch("https://test.example.com/api/notfound");

      assert.strictEqual(result, null);
    });

    it("throws for non-OK non-404 responses", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(
          createMockResponse({
            ok: false,
            status: 500,
            url: "https://test.example.com/api/error",
            textBody: "Internal server error",
          }),
        ),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);

      await assert.rejects(
        () => client.fetch("https://test.example.com/api/error"),
        /Cockpit: Error accessing.*500.*Internal server error/,
      );
    });

    it("does not include api-Key header when useAdminAccess is false", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ apiKey: "secret-key", useAdminAccess: false });
      const client = createHttpClient(config, identityTransformer);
      await client.fetch("https://test.example.com/api/test");

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers?.["api-Key"], undefined);
    });

    it("includes api-Key header when useAdminAccess is true", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ apiKey: "secret-key", useAdminAccess: true });
      const client = createHttpClient(config, identityTransformer);
      await client.fetch("https://test.example.com/api/test");

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers["api-Key"], "secret-key");
    });

    it("per-request useAdminAccess=true overrides config false", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ apiKey: "secret-key", useAdminAccess: false });
      const client = createHttpClient(config, identityTransformer);
      await client.fetch("https://test.example.com/api/test", { useAdminAccess: true });

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers["api-Key"], "secret-key");
    });

    it("per-request useAdminAccess=false overrides config true", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ apiKey: "secret-key", useAdminAccess: true });
      const client = createHttpClient(config, identityTransformer);
      await client.fetch("https://test.example.com/api/test", { useAdminAccess: false });

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers?.["api-Key"], undefined);
    });

    it("does not add api-Key header even when useAdminAccess is true but no apiKey", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ useAdminAccess: true }); // no apiKey
      const client = createHttpClient(config, identityTransformer);
      await client.fetch("https://test.example.com/api/test");

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers?.["api-Key"], undefined);
    });

    it("passes custom headers through", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      await client.fetch("https://test.example.com/api/test", {
        headers: { "X-Custom": "value" },
      });

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers["X-Custom"], "value");
    });
  });

  describe("post (POST requests)", () => {
    it("makes POST request with JSON body", async () => {
      const responseData = { id: "123" };
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: responseData })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      const result = await client.post<{ id: string }>("https://test.example.com/api/items", {
        name: "test",
      });

      assert.deepStrictEqual(result, responseData);

      const call = mockFetch.mock.calls[0];
      const options = call.arguments[1];
      assert.strictEqual(options?.method, "POST");
      assert.strictEqual(
        (options?.headers as Record<string, string>)["Content-Type"],
        "application/json",
      );
      assert.strictEqual(options?.body, JSON.stringify({ name: "test" }));
    });

    it("includes api-Key header when useAdminAccess is true", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ apiKey: "secret-key", useAdminAccess: true });
      const client = createHttpClient(config, identityTransformer);
      await client.post("https://test.example.com/api/items", { data: "test" });

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers["api-Key"], "secret-key");
    });

    it("per-request useAdminAccess overrides config", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ apiKey: "secret-key", useAdminAccess: false });
      const client = createHttpClient(config, identityTransformer);
      await client.post("https://test.example.com/api/items", { data: "test" }, { useAdminAccess: true });

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers["api-Key"], "secret-key");
    });

    it("applies response transformer", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: { value: 5 } })),
      );

      const client = createHttpClient(createTestConfig(), doubleTransformer);
      const result = await client.post<{ value: number }>("https://test.example.com/api/items", {});

      assert.deepStrictEqual(result, { value: 10 });
    });

    it("merges custom headers with Content-Type", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      await client.post(
        "https://test.example.com/api/items",
        { data: "test" },
        { headers: { "X-Custom": "value" } },
      );

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers["Content-Type"], "application/json");
      assert.strictEqual(headers["X-Custom"], "value");
    });
  });

  describe("delete (DELETE requests)", () => {
    it("makes DELETE request", async () => {
      const responseData = { deleted: true };
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: responseData })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      const result = await client.delete<{ deleted: boolean }>(
        "https://test.example.com/api/items/123",
      );

      assert.deepStrictEqual(result, responseData);

      const call = mockFetch.mock.calls[0];
      const options = call.arguments[1];
      assert.strictEqual(options?.method, "DELETE");
      assert.strictEqual(
        (options?.headers as Record<string, string>)["Content-Type"],
        "application/json",
      );
    });

    it("includes api-Key header when useAdminAccess is true", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ apiKey: "secret-key", useAdminAccess: true });
      const client = createHttpClient(config, identityTransformer);
      await client.delete("https://test.example.com/api/items/123");

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers["api-Key"], "secret-key");
    });

    it("per-request useAdminAccess overrides config", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const config = createTestConfig({ apiKey: "secret-key", useAdminAccess: false });
      const client = createHttpClient(config, identityTransformer);
      await client.delete("https://test.example.com/api/items/123", { useAdminAccess: true });

      const call = mockFetch.mock.calls[0];
      const headers = call.arguments[1]?.headers as Record<string, string>;
      assert.strictEqual(headers["api-Key"], "secret-key");
    });
  });

  describe("header normalization edge cases", () => {
    it("handles array headers", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      await client.fetch("https://test.example.com/api/test", {
        headers: ["header1", "header2"] as unknown as Record<string, string>,
      });

      // Should not throw and should ignore invalid headers
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });

    it("handles null headers", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      await client.fetch("https://test.example.com/api/test", {
        headers: null as unknown as Record<string, string>,
      });

      // Should not throw
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });

    it("handles undefined headers", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: {} })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      await client.fetch("https://test.example.com/api/test", {
        headers: undefined,
      });

      // Should not throw
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });
  });

  describe("fetchText method", () => {
    it("returns text response", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ textBody: "https://example.com/image.jpg" })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      const result = await client.fetchText("https://test.example.com/api/asset");

      assert.strictEqual(result, "https://example.com/image.jpg");
    });

    it("returns null for 404 response", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ ok: false, status: 404 })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      const result = await client.fetchText("https://test.example.com/api/notfound");

      assert.strictEqual(result, null);
    });

    it("throws for non-OK non-404 responses", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(
          createMockResponse({
            ok: false,
            status: 500,
            url: "https://test.example.com/api/error",
            textBody: "Server error",
          }),
        ),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);

      await assert.rejects(
        () => client.fetchText("https://test.example.com/api/error"),
        /Cockpit: Error accessing.*500.*Server error/,
      );
    });
  });

  describe("post with undefined body", () => {
    it("handles undefined body correctly", async () => {
      mockFetch.mock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ body: { success: true } })),
      );

      const client = createHttpClient(createTestConfig(), identityTransformer);
      await client.post("https://test.example.com/api/test", undefined);

      const call = mockFetch.mock.calls[0];
      const options = call.arguments[1];
      // When body is undefined, it should not be set in options
      assert.strictEqual(options?.body, undefined);
    });
  });
});
