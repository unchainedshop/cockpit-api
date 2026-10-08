import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createMockResponse, EnvManager, TEST_ENDPOINT, fetchCall, fetchUrl, fetchUrls, withRedirectServer } from "../__tests__/test-helpers.ts";
import { createFetchClient, type FetchClient, type FetchClientOptions } from "./client.ts";
import { CockpitHttpError } from "../index.ts";

describe("createFetchClient", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;
  let body: unknown;
  const envManager = new EnvManager();

  const respond = (impl: () => Promise<Response>) => {
    mockFetch.mock.mockImplementation(impl);
  };
  const client = (options: FetchClientOptions = {}) => createFetchClient({ endpoint: TEST_ENDPOINT, ...options });
  const url = (i = 0) => new URL(fetchUrl(mockFetch, i));
  const init = (i = 0) => fetchCall(mockFetch, i)[1];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    body = { data: "test" };
    mockFetch = mock.fn(async () => createMockResponse({ body }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    envManager.reset();
    mock.reset();
  });

  describe("endpoint", () => {
    it("throws without endpoint option or env var", () => {
      envManager.clear("COCKPIT_GRAPHQL_ENDPOINT");
      assert.throws(() => createFetchClient(), /endpoint is required/);
    });

    it("falls back to COCKPIT_GRAPHQL_ENDPOINT; the option wins", async () => {
      envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: "https://env.cockpit.com/api/graphql" });
      await createFetchClient().pages();
      await client().pages();
      assert.deepStrictEqual(fetchUrls(mockFetch).map((u) => new URL(u).origin), [
        "https://env.cockpit.com",
        "https://test.cockpit.com",
      ]);
    });

    it("works on runtimes without a process global", async () => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, "process");
      assert.ok(descriptor);
      Object.defineProperty(globalThis, "process", { value: undefined, configurable: true, writable: true });
      let pending: Promise<unknown>;
      try {
        assert.throws(() => createFetchClient(), /endpoint is required/);
        pending = client().pages();
      } finally {
        Object.defineProperty(globalThis, "process", descriptor);
      }
      await pending;
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });

    it("stays edge-safe (runtime imports: core/url.ts and the import-free core/errors.ts)", () => {
      const source = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
      const runtimeImports = [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)"/gms)].map((m) => m[1]);
      assert.deepStrictEqual(runtimeImports, ["../core/url.ts", "../core/errors.ts"]);
      const errors = readFileSync(new URL("../core/errors.ts", import.meta.url), "utf8");
      assert.deepStrictEqual([...errors.matchAll(/^import /gm)], []);
    });
  });

  describe("URLs", () => {
    const cases: [string, (c: FetchClient) => Promise<unknown>, string, Record<string, string>][] = [
      ["pageByRoute", (c) => c.pageByRoute("/about", { locale: "en", populate: 2 }), "/api/pages/page", { route: "/about", locale: "en", populate: "2" }],
      ["pages", (c) => c.pages({ limit: 10, skip: 0 }), "/api/pages/pages", { limit: "10", skip: "0", locale: "default" }],
      ["pageById", (c) => c.pageById("65a94b56f3c1b3ff040f00e5", { locale: "en", populate: 2 }), "/api/pages/page/65a94b56f3c1b3ff040f00e5", { locale: "en", populate: "2" }],
      ["getContentItems", (c) => c.getContentItems("news", { limit: 10, filter: { a: 1 } }), "/api/content/items/news", { limit: "10", filter: '{"a":1}', locale: "default" }],
      ["getContentItem", (c) => c.getContentItem("news", "abc123"), "/api/content/item/news/abc123", { locale: "default" }],
      ["getContentItem (singleton)", (c) => c.getContentItem("settings"), "/api/content/item/settings", { locale: "default" }],
      ["fetchRaw", (c) => c.fetchRaw("/pages/menus", { inactive: true, nested: false, skip: 0, undef: undefined }), "/api/pages/menus", { inactive: "1", skip: "0", locale: "default" }],
    ];
    for (const [name, call, pathname, params] of cases) {
      it(`${name} → ${pathname}`, async () => {
        await call(client());
        assert.strictEqual(url().pathname, pathname);
        assert.deepStrictEqual(Object.fromEntries(url().searchParams), params);
      });
    }

    it("prefixes the tenant and keeps ids as single path segments", async () => {
      await client({ tenant: "my-tenant_1" }).getContentItem("news_items", "65a94b56f3c1b3ff040f00e5");
      assert.strictEqual(url().pathname, "/:my-tenant_1/api/content/item/news_items/65a94b56f3c1b3ff040f00e5");
    });

    it("maps defaultLanguage to the default locale (no mapping by default)", async () => {
      await client({ defaultLanguage: "en" }).pageByRoute("/a", { locale: "en" });
      await client({ defaultLanguage: "en" }).pageByRoute("/a", { locale: "de" });
      await client().pageByRoute("/a", { locale: "de" });
      await client({ defaultLanguage: null }).pageByRoute("/a");
      const locales = fetchUrls(mockFetch).map((u) => new URL(u).searchParams.get("locale"));
      assert.deepStrictEqual(locales, ["default", "de", "de", "default"]);
    });

    it("library params (route, locale, populate) win over caller params", async () => {
      await client().pageByRoute("/about", { route: "/admin", locale: "en" });
      await client().pageByRoute("/about?locale=fr&populate=99#x");
      assert.deepStrictEqual(url(0).searchParams.getAll("route"), ["/about"]);
      assert.deepStrictEqual(url(0).searchParams.getAll("locale"), ["en"]);
      assert.strictEqual(url(1).searchParams.get("route"), "/about?locale=fr&populate=99#x");
      assert.deepStrictEqual(url(1).searchParams.getAll("locale"), ["default"]);
      assert.strictEqual(url(1).searchParams.has("populate"), false);
      assert.strictEqual(url(1).hash, "");
    });
  });

  describe("responses", () => {
    it("normalizes list responses to { data, meta? }", async () => {
      body = [{ _id: "1" }];
      assert.deepStrictEqual(await client().pages(), { data: [{ _id: "1" }] });
      assert.deepStrictEqual(await client().getContentItems("news"), { data: [{ _id: "1" }] });
      body = { data: [{ _id: "1" }], meta: { total: 5 } };
      assert.deepStrictEqual(await client().getContentItems("news", { skip: 0 }), body);
      assert.deepStrictEqual(await client().pages({ skip: 0 }), body);
    });

    it("returns null for 404 and throws on other errors", async () => {
      respond(async () => createMockResponse({ ok: false, status: 404 }));
      assert.strictEqual(await client().pages(), null);
      assert.strictEqual(await client().fetchRaw("/custom/path"), null);
      respond(async () => createMockResponse({ ok: false, status: 500, textBody: "boom" }));
      const err = await client().fetchRaw("/custom/path").catch((e: unknown) => e);
      assert.ok(err instanceof CockpitHttpError, "same error class as the main client");
      assert.strictEqual(err.status, 500);
      assert.strictEqual(err.message, "Cockpit: Error accessing /api/custom/path (500)");
      assert.deepStrictEqual(err.cause, { status: 500, url: "https://test.cockpit.com/api/custom/path", body: "boom" });
    });
  });

  describe("request init", () => {
    it("uses cache no-store by default, without headers or redirect override", async () => {
      await client().pages();
      await client({ cache: "force-cache" }).pages();
      assert.strictEqual(init(0).cache, "no-store");
      assert.strictEqual(init(0).headers, undefined);
      assert.strictEqual(init(0).redirect, undefined);
      assert.strictEqual(init(1).cache, "force-cache");
    });

    for (const [name, options, header] of [
      ["apiKey", { apiKey: "mysecret" }, ["api-Key", "mysecret"]],
      ["custom headers", { headers: { "X-Custom": "value" } }, ["X-Custom", "value"]],
    ] as const) {
      it(`sends ${name} and never follows redirects with them`, async () => {
        await client(options).pages();
        assert.strictEqual(init().headers[header[0]], header[1]);
        assert.strictEqual(init().redirect, "error");
      });
    }

    it("aborts after the timeout (default 15 s, 0 disables)", async () => {
      await client().pages();
      await client({ timeout: 0 }).pages();
      assert.ok(init(0).signal instanceof AbortSignal);
      assert.strictEqual(init(1).signal, undefined);

      respond((_url?: unknown, req?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          req?.signal?.addEventListener("abort", () => reject(req.signal?.reason));
        }),
      );
      await assert.rejects(() => client({ timeout: 20 }).pages(), /Cockpit: request timed out after 20ms/);
    });

    for (const reason of ["timeout", "abort"] as const) {
      it(`maps a ${reason} while reading the body to a timeout error`, async () => {
        respond((_url?: unknown, req?: RequestInit) =>
          Promise.resolve({
            ...createMockResponse(),
            json: () =>
              reason === "abort"
                ? Promise.reject(new DOMException("aborted", "AbortError"))
                : new Promise((_resolve, reject) => req?.signal?.addEventListener("abort", () => reject(req.signal?.reason))),
          } as Response),
        );
        await assert.rejects(() => client({ timeout: 20 }).pages(), {
          message: "Cockpit: request timed out after 20ms (/api/pages/pages)",
        });
      });
    }

    it("explains a refused redirect with credentials (real fetch against a local 302)", async () => {
      globalThis.fetch = originalFetch;
      await withRedirectServer(async (endpoint) => {
        const err = await createFetchClient({ endpoint, apiKey: "k" })
          .pages()
          .then(() => assert.fail("expected rejection"), (e: unknown) => e as Error);
        assert.strictEqual(err.message, "Cockpit: refusing to follow redirect for authenticated request (/api/pages/pages)");
        assert.ok(err.cause instanceof TypeError);
      });
    });
  });

  describe("validation (nothing is fetched)", () => {
    afterEach(() => {
      assert.strictEqual(mockFetch.mock.callCount(), 0);
    });

    const badSegments = ["abc?re=1&locale=fr#", "posts/../../../:other/api/content/items/secret", "..", ".", "a/b", "a\\b", "a%2fb", "a#b", "a\nb", ""];
    for (const bad of badSegments) {
      it(`rejects id/model ${JSON.stringify(bad)}`, async () => {
        const c = client();
        await assert.rejects(() => c.pageById(bad), /Cockpit: Invalid id/);
        await assert.rejects(() => c.getContentItems(bad), /Cockpit: Invalid model/);
        await assert.rejects(() => c.getContentItem(bad), /Cockpit: Invalid model/);
        await assert.rejects(() => c.getContentItem("news", bad), /Cockpit: Invalid id/);
      });
    }

    it("rejects invalid tenants at creation", () => {
      for (const tenant of ["../x", "a/b", "a?b", "a#b", "a%2e", "a.b"]) {
        assert.throws(() => client({ tenant }), /Cockpit: Invalid tenant format/);
      }
    });

    const badPaths = ["//evil.com/x", "http://evil.com/x", "evil.com/x", "/../../:other/api/x", "/a/./b", "/a/..", "/a/%2e%2e/b", "/a/%2E%2e/b", "/a/%2fb", "/a/%5cb", "/a\\b", "/a?x=1", "/a#x", "/a\u0000b", "/a//b", ""];
    for (const path of badPaths) {
      it(`rejects fetchRaw path ${JSON.stringify(path)}`, async () => {
        await assert.rejects(() => client({ apiKey: "secret" }).fetchRaw(path), /Cockpit: Invalid request path/);
      });
    }
  });
});
