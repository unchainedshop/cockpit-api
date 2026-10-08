import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { CockpitHttpError, createHttpClient, type HttpClient } from "./http.ts";
import { createConfig, type CockpitAPIOptions } from "./config.ts";
import { fetchCall, withRedirectServer } from "../__tests__/test-helpers.ts";

const url = (path = "/api/test", query = ""): URL => new URL(`https://cms.example.com${path}${query}`);
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const client = (options: CockpitAPIOptions = {}, transform?: (json: unknown) => unknown): HttpClient =>
  createHttpClient(createConfig({ endpoint: "https://cms.example.com/api/graphql", ...options }), transform);
const admin: CockpitAPIOptions = { apiKey: "secret-key", useAdminAccess: true };

describe("createHttpClient", () => {
  let mockFetch: ReturnType<typeof mock.fn<typeof fetch>>;
  const originalFetch = globalThis.fetch;
  const sent = (index = 0) => fetchCall(mockFetch, index)[1];

  beforeEach(() => {
    mockFetch = mock.fn<typeof fetch>(async () => json({ value: 1 }));
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  describe("requests", () => {
    it("GETs and returns transformed JSON (transform may work in place)", async () => {
      const http = client({}, (data) => {
        (data as { value: number }).value *= 2;
        return data;
      });
      assert.deepStrictEqual(await http.fetch(url()), { value: 2 });
      assert.strictEqual(sent().method, "GET");
    });

    it("returns the raw JSON when the transform throws", async () => {
      const http = client({}, () => {
        throw new Error("boom");
      });
      assert.deepStrictEqual(await http.fetch(url()), { value: 1 });
    });

    it("POSTs JSON bodies", async () => {
      await client().post(url(), { name: "test" });
      assert.strictEqual(sent().method, "POST");
      assert.strictEqual(sent().headers["Content-Type"], "application/json");
      assert.strictEqual(sent().body, JSON.stringify({ name: "test" }));
    });

    it("sends no body for DELETE and undefined POST bodies", async () => {
      await client().delete(url());
      await client().post(url(), undefined);
      assert.strictEqual(sent(0).method, "DELETE");
      for (const i of [0, 1]) {
        assert.strictEqual(sent(i).body, undefined);
        assert.deepStrictEqual(sent(i).headers, {});
      }
    });

    it("POSTs FormData without a Content-Type (fetch adds the boundary)", async () => {
      const form = new FormData();
      form.append("field", "x");
      assert.deepStrictEqual(await client().request("POST", url(), { form }), { value: 1 });
      assert.strictEqual(sent().body, form);
      assert.deepStrictEqual(sent().headers, {});
    });

    it("returns text without transforming it", async () => {
      mockFetch.mock.mockImplementation(async () => new Response("https://example.com/image.jpg"));
      const transform = mock.fn((data: unknown) => data);
      const text = await client({}, transform).request<string>("GET", url(), { text: true });
      assert.strictEqual(text, "https://example.com/image.jpg");
      assert.strictEqual(transform.mock.callCount(), 0);
    });

    for (const text of [false, true]) {
      it(`returns null for 404 (text: ${String(text)})`, async () => {
        mockFetch.mock.mockImplementation(async () => new Response("missing", { status: 404 }));
        assert.strictEqual(await client().request("GET", url(), { text }), null);
      });
    }
  });

  describe("authentication", () => {
    const cases: [name: string, options: CockpitAPIOptions, perRequest: boolean | undefined, key: string | undefined][] = [
      ["public by default", { apiKey: "secret-key" }, undefined, undefined],
      ["admin from the factory", admin, undefined, "secret-key"],
      ["per-request true overrides factory false", { apiKey: "secret-key" }, true, "secret-key"],
      ["per-request false overrides factory true", admin, false, undefined],
      ["per-request false without a key", { useAdminAccess: true }, false, undefined],
    ];
    for (const [name, options, useAdminAccess, key] of cases) {
      it(name, async () => {
        const http = client(options);
        const access = useAdminAccess === undefined ? {} : { useAdminAccess };
        await http.fetch(url(), access);
        await http.post(url(), {}, access);
        await http.request("POST", url(), { form: new FormData(), ...access });
        for (const i of [0, 1, 2]) assert.strictEqual(sent(i).headers["api-Key"], key);
      });
    }

    const missingKey: [name: string, options: CockpitAPIOptions, perRequest: boolean | undefined][] = [
      ["factory admin without apiKey", { useAdminAccess: true }, undefined],
      ["per-request admin without apiKey", {}, true],
    ];
    for (const [name, options, useAdminAccess] of missingKey) {
      it(`throws instead of sending a public request: ${name}`, async () => {
        const http = client(options);
        const access = useAdminAccess === undefined ? {} : { useAdminAccess };
        await assert.rejects(http.fetch(url(), access), /Cockpit: useAdminAccess requires an apiKey/);
        await assert.rejects(
          http.request("POST", url(), { form: new FormData(), ...access }),
          /Cockpit: useAdminAccess requires an apiKey/,
        );
        assert.strictEqual(mockFetch.mock.callCount(), 0);
      });
    }

    it("accessScope reflects the effective access without exposing the key", () => {
      const pub = client({ apiKey: "secret-key" });
      const adm = client(admin);
      assert.strictEqual(pub.accessScope(), "public");
      assert.strictEqual(adm.accessScope(false), "public");
      assert.match(adm.accessScope(), /^admin-[0-9a-f]{12}$/);
      assert.strictEqual(pub.accessScope(true), adm.accessScope());
      assert.ok(!adm.accessScope().includes("secret-key"));
    });

    it("never follows redirects with the api-Key (credentials stay on the origin)", async () => {
      await client(admin).fetch(url());
      assert.strictEqual(sent().redirect, "error");
    });

    it("explains a refused redirect (real fetch against a local 302)", async () => {
      globalThis.fetch = originalFetch;
      await withRedirectServer(async (endpoint) => {
        const http = createHttpClient(createConfig({ endpoint, ...admin }));
        const err = await http
          .fetch(new URL("/api/content/items/posts?x=1", endpoint))
          .then(() => assert.fail("expected rejection"), (e: unknown) => e as Error);
        assert.strictEqual(err.message, "Cockpit: refusing to follow redirect for authenticated request (/api/content/items/posts)");
        assert.ok(err.cause instanceof TypeError);
      });
    });

    it("keeps the default redirect behaviour for unauthenticated requests", async () => {
      await client({ apiKey: "secret-key" }).fetch(url());
      assert.strictEqual(sent().redirect, undefined);
    });
  });

  describe("timeouts", () => {
    const hangUntilAborted: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason as Error));
      });

    it("rejects a hung request with a timeout error (path only, no query)", async () => {
      mockFetch.mock.mockImplementation(hangUntilAborted);
      await assert.rejects(
        () => client({ timeout: 20 }).fetch(url("/api/pages/pages", "?limit=1")),
        /^Error: Cockpit: request timed out after 20ms \(\/api\/pages\/pages\)$/,
      );
    });

    it("passes a signal for every request type, none when disabled", async () => {
      const http = client({ timeout: 1000 });
      await http.fetch(url());
      await http.request("GET", url(), { text: true });
      await http.post(url(), {});
      await http.request("POST", url(), { form: new FormData() });
      await http.delete(url());
      for (const i of [0, 1, 2, 3, 4]) assert.ok(sent(i).signal instanceof AbortSignal, `call ${String(i)}`);
      await client({ timeout: 0 }).fetch(url());
      assert.strictEqual(sent(5).signal, undefined);
    });
  });

  describe("errors", () => {
    for (const text of [false, true]) {
      it(`throws CockpitHttpError with status and url without query (text: ${String(text)})`, async () => {
        mockFetch.mock.mockImplementation(async () => new Response("denied", { status: 403 }));
        const err = await client()
          .request("GET", url("/api/content/items/posts", "?filter=secret"), { text })
          .then(() => assert.fail("expected rejection"), (e: unknown) => e);

        assert.ok(err instanceof CockpitHttpError);
        assert.strictEqual(err.name, "CockpitHttpError");
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.url, "https://cms.example.com/api/content/items/posts");
        assert.strictEqual(err.message, "Cockpit: Error accessing /api/content/items/posts (403)");
      });
    }

    it("puts the truncated upstream body into cause", async () => {
      mockFetch.mock.mockImplementation(async () => new Response("x".repeat(5000), { status: 502 }));
      const err = await client()
        .fetch(url("/api/x", "?filter=secret"))
        .then(
          () => assert.fail("expected rejection"),
          (e: unknown) => e as Error & { cause: { status: number; url: string; body: string } },
        );
      assert.strictEqual(err.cause.status, 502);
      assert.strictEqual(err.cause.url, "https://cms.example.com/api/x");
      assert.strictEqual(err.cause.body, "x".repeat(500));
    });
  });
});
