import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { parse, type DocumentNode } from "graphql";
import { createMockResponse, EnvManager, TEST_ENDPOINT } from "../__tests__/test-helpers.ts";
import { createRemoteExecutor, type CockpitExecutorContext, type MakeCockpitSchemaOptions } from "./executor.ts";

const document: DocumentNode = { kind: "Document", definitions: [] };

const tenantContext = (tenant: string | string[]): CockpitExecutorContext => ({
  req: { headers: { "x-cockpit-space": tenant } },
});

const errorsOf = (result: unknown) =>
  (result as { errors?: { message: string }[] }).errors?.map((e) => e.message) ?? [];

type FetchArgs = [url: string | URL, init?: RequestInit];

// Registered via COCKPIT_SECRET_<TENANT>, so the default allowlist accepts them
const CONFIGURED_TENANTS = ["mytenant", "customtenant", "fromextractor", "t1", "t2", "t3", "acme"];

/** Tenant of a request URL ("default" without one) */
const tenantOf = (url: string | URL) =>
  /\/:([^/]+)\/api\//.exec(new URL(url.toString()).pathname)?.[1] ?? "default";

describe("createRemoteExecutor", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn<(...args: FetchArgs) => Promise<Response>>>;
  let graphqlBody: unknown;
  let pagesBody: unknown;
  const envManager = new EnvManager();

  const urls = () => mockFetch.mock.calls.map((call) => new URL(call.arguments[0].toString()));
  const graphqlPaths = () => urls().filter((url) => url.pathname.endsWith("/graphql")).map((url) => url.pathname);
  const sentKeys = () =>
    mockFetch.mock.calls
      .filter((call) => call.arguments[0].toString().endsWith("/graphql"))
      .map((call) => new Headers(call.arguments[1]?.headers).get("api-key"));

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    graphqlBody = undefined;
    pagesBody = [];
    mockFetch = mock.fn(async (url: string | URL) =>
      url.toString().includes("/pages/pages")
        ? createMockResponse({ body: pagesBody })
        : createMockResponse({ body: graphqlBody ?? { data: { tenant: tenantOf(url) } } }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    envManager.clear("COCKPIT_SECRET");
    envManager.clear("COCKPIT_CACHE_MAX");
    envManager.set({
      COCKPIT_GRAPHQL_ENDPOINT: TEST_ENDPOINT,
      ...Object.fromEntries(CONFIGURED_TENANTS.map((t) => [`COCKPIT_SECRET_${t.toUpperCase()}`, `${t}-key`])),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    envManager.reset();
    mock.reset();
  });

  describe("tenant selection", () => {
    const cases: [string, MakeCockpitSchemaOptions, CockpitExecutorContext | undefined, string][] = [
      ["default header", {}, tenantContext("mytenant"), "/:mytenant/api/graphql"],
      ["custom header", { tenantHeader: "x-custom" }, { req: { headers: { "x-custom": "customtenant" } } }, "/:customtenant/api/graphql"],
      ["first of array header values", {}, tenantContext(["t1", "t2"]), "/:t1/api/graphql"],
      ["extractTenant overrides the header", { extractTenant: () => "fromextractor" }, tenantContext("t1"), "/:fromextractor/api/graphql"],
      ["lower-cased tenant", {}, tenantContext("ACME"), "/:acme/api/graphql"],
      ["no context: default space", {}, undefined, "/api/graphql"],
      ["no headers: default space", {}, { req: {} }, "/api/graphql"],
      ["empty tenant: default space", {}, tenantContext(""), "/api/graphql"],
    ];
    for (const [name, options, context, path] of cases) {
      it(name, async () => {
        const result = await createRemoteExecutor(options)({ document, ...(context && { context }) });
        assert.deepStrictEqual(graphqlPaths(), [path]);
        assert.deepStrictEqual(errorsOf(result), []);
      });
    }

    it("passes variables and uses cockpitOptions.endpoint", async () => {
      const endpoint = "https://custom.cockpit.com/api/graphql";
      await createRemoteExecutor({ cockpitOptions: { endpoint } })({ document, variables: { id: "123" } });
      const [url, init] = mockFetch.mock.calls.find((c) => c.arguments[0].toString().endsWith("/graphql"))?.arguments ?? [];
      assert.strictEqual(url?.toString(), endpoint);
      assert.deepStrictEqual(JSON.parse(init?.body as string).variables, { id: "123" });
    });
  });

  describe("tenant allowlist", () => {
    const rejected: [string, MakeCockpitSchemaOptions, string, RegExp][] = [
      ["unconfigured tenant", {}, "evil", /Unknown tenant/],
      ["tenant outside an explicit list", { allowedTenants: ["Other"] }, "acme", /Unknown tenant/],
      ["tenant refused by a predicate", { allowedTenants: (t) => t === "dynamic" }, "nope", /Unknown tenant/],
      ["malformed tenant, even if allowed", { allowedTenants: () => true }, "../admin", /Invalid tenant/],
      ["tenant with a dot", { allowedTenants: () => true }, "a.b", /Invalid tenant/],
    ];
    for (const [name, options, tenant, error] of rejected) {
      it(`rejects ${name} without any request`, async () => {
        const result = await createRemoteExecutor(options)({ document, context: tenantContext(tenant) });
        assert.match(errorsOf(result)[0] ?? "", error);
        assert.strictEqual(mockFetch.mock.callCount(), 0);
      });
    }

    it("compares explicit lists case-insensitively and calls predicates with the lower-cased tenant", async () => {
      const seen: string[] = [];
      await createRemoteExecutor({ allowedTenants: ["Other"] })({ document, context: tenantContext("OTHER") });
      await createRemoteExecutor({ allowedTenants: (t) => (seen.push(t), true) })({ document, context: tenantContext("DYNAMIC") });
      assert.deepStrictEqual(seen, ["dynamic"]);
      assert.deepStrictEqual(graphqlPaths(), ["/:other/api/graphql", "/:dynamic/api/graphql"]);
    });

    it("keeps a tenant named __default__ apart from the default space", async () => {
      const executor = createRemoteExecutor({ allowedTenants: () => true });
      await executor({ document, context: tenantContext("__default__") });
      await executor({ document, context: {} });
      assert.deepStrictEqual(graphqlPaths(), ["/:__default__/api/graphql", "/api/graphql"]);
    });

    it("never pools (or evicts for) unknown tenants", async () => {
      const executor = createRemoteExecutor({ maxClients: 1 });
      await executor({ document, context: tenantContext("acme") });
      for (let i = 0; i < 20; i++) await executor({ document, context: tenantContext(`random${i}`) });
      await executor({ document, context: tenantContext("acme") });
      assert.deepStrictEqual(graphqlPaths(), ["/:acme/api/graphql"]);
    });
  });

  describe("api keys", () => {
    const admin = { apiKey: "global-key", useAdminAccess: true, cache: false } as const;

    it("never sends cockpitOptions.apiKey to a caller-selected tenant", async () => {
      const executor = createRemoteExecutor({ cockpitOptions: admin });
      await executor({ document, context: {} });
      await executor({ document, context: tenantContext("acme") });
      assert.deepStrictEqual(sentKeys(), ["global-key", "acme-key"]);
    });

    it("fails instead of falling back to the global key for a tenant without own key", async () => {
      const executor = createRemoteExecutor({ allowedTenants: ["nokey"], cockpitOptions: admin });
      await assert.rejects(executor({ document, context: tenantContext("nokey") }), /useAdminAccess requires an apiKey/);
      assert.ok(!sentKeys().includes("global-key"));
    });

    it("resolves keys per space through the apiKey resolver", async () => {
      const executor = createRemoteExecutor({
        apiKey: (tenant) => (tenant === undefined ? "resolved-default" : `resolved-${tenant}`),
        cockpitOptions: admin,
      });
      await executor({ document, context: {} });
      await executor({ document, context: tenantContext("acme") });
      assert.deepStrictEqual(sentKeys(), ["resolved-default", "resolved-acme"]);
    });

    it("falls back to the space's own key when the resolver yields nothing", async () => {
      const executor = createRemoteExecutor({ apiKey: () => undefined, cockpitOptions: admin });
      await executor({ document, context: {} });
      await executor({ document, context: tenantContext("acme") });
      assert.deepStrictEqual(sentKeys(), ["global-key", "acme-key"]);
    });
  });

  describe("filterMutations", () => {
    const mutation = parse('mutation Save { saveItem(name: "x") }');

    it("forwards mutations by default (raw executor)", async () => {
      await createRemoteExecutor()({ document: mutation });
      assert.strictEqual(graphqlPaths().length, 1);
    });

    for (const [name, doc, operationName] of [
      ["a mutation", mutation, undefined],
      ["the mutation selected by operationName", parse('query Q { hello } mutation M { saveItem(name: "x") }'), "M"],
    ] as const) {
      it(`rejects ${name} without a request when set`, async () => {
        const result = await createRemoteExecutor({ filterMutations: true })({
          document: doc,
          ...(operationName && { operationName }),
        });
        assert.match(errorsOf(result)[0] ?? "", /Only queries/);
        assert.strictEqual(mockFetch.mock.callCount(), 0);
      });
    }

    it("still forwards queries when set", async () => {
      const result = await createRemoteExecutor({ filterMutations: true })({ document: parse("query Q { hello }") });
      assert.deepStrictEqual(result, { data: { tenant: "default" } });
    });
  });

  describe("client pool", () => {
    it("reuses one client per tenant, also for concurrent requests", async () => {
      const executor = createRemoteExecutor();
      const context = tenantContext("t1");
      await Promise.all([executor({ document, context }), executor({ document, context })]);
      await executor({ document, context });
      // Separate clients would each fetch: the pooled one answers from cache
      assert.strictEqual(graphqlPaths().length, 1);
    });

    it("re-created clients find their entries in the shared store after eviction", async () => {
      const executor = createRemoteExecutor({ maxClients: 2 });
      for (const tenant of ["t1", "t2", "t3", "t1", "t3"]) {
        await executor({ document, context: tenantContext(tenant) });
      }
      assert.strictEqual(graphqlPaths().length, 3);
    });

    it("retries client creation after a failed attempt", async () => {
      envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: undefined });
      const executor = createRemoteExecutor();
      await assert.rejects(executor({ document }), /endpoint is required/);

      envManager.set({ COCKPIT_GRAPHQL_ENDPOINT: TEST_ENDPOINT });
      assert.deepStrictEqual(await executor({ document }), { data: { tenant: "default" } });
    });
  });

  describe("shared cache store", () => {
    const opts = (cache?: NonNullable<MakeCockpitSchemaOptions["cockpitOptions"]>["cache"]) =>
      ({ cockpitOptions: { resolvePageLinks: false, ...(cache !== undefined && { cache }) } });

    for (const [name, setup] of [
      ["cache.max", () => opts({ max: 2 })],
      ["COCKPIT_CACHE_MAX", () => (envManager.set({ COCKPIT_CACHE_MAX: "2" }), opts())],
    ] as const) {
      it(`bounds the whole pool by ${name}`, async () => {
        const executor = createRemoteExecutor(setup());
        for (const tenant of ["t1", "t2", "t3", "t1"]) {
          await executor({ document, context: tenantContext(tenant) });
        }
        // t1's entry was evicted from the shared store by t3's
        assert.strictEqual(graphqlPaths().length, 4);
      });
    }

    it("keeps spaces' entries apart", async () => {
      const executor = createRemoteExecutor(opts());
      for (const tenant of ["t1", "t2", "t1", "t2", "default"]) {
        const context = tenant === "default" ? {} : tenantContext(tenant);
        assert.deepStrictEqual(await executor({ document, context }), { data: { tenant } });
      }
      assert.strictEqual(graphqlPaths().length, 3);
    });

    it("is not shared between executors", async () => {
      await createRemoteExecutor(opts())({ document, context: tenantContext("t1") });
      await createRemoteExecutor(opts())({ document, context: tenantContext("t1") });
      assert.strictEqual(graphqlPaths().length, 2);
    });

    it("uses a store from cockpitOptions.cache as-is", async () => {
      const entries = new Map<string, unknown>();
      const store = {
        get: async (key: string) => entries.get(key),
        set: async (key: string, value: unknown) => void entries.set(key, value),
        clear: async () => entries.clear(),
      };
      const executor = createRemoteExecutor(opts({ store }));
      await executor({ document, context: tenantContext("t1") });
      await executor({ document, context: tenantContext("t2") });
      const keys = [...entries.keys()];
      assert.ok(keys.some((k) => k.includes(":t1:")) && keys.some((k) => k.includes(":t2:")));
    });

    it("stays disabled with cache: false", async () => {
      const executor = createRemoteExecutor(opts(false));
      await executor({ document, context: tenantContext("t1") });
      await executor({ document, context: tenantContext("t1") });
      assert.strictEqual(graphqlPaths().length, 2);
    });
  });

  describe("resolvePageLinks", () => {
    beforeEach(() => {
      graphqlBody = { data: { page: { link: "pages://abc123" } } };
      pagesBody = [{ _id: "abc123", _r: "/about" }];
    });

    it("resolves pages:// links by default, with the tenant's route map", async () => {
      const result = await createRemoteExecutor()({ document, context: tenantContext("acme") });
      assert.deepStrictEqual(result, { data: { page: { link: "/about" } } });
      assert.ok(urls().some((url) => url.pathname === "/:acme/api/pages/pages"));
    });

    it("leaves links alone with resolvePageLinks: false", async () => {
      const result = await createRemoteExecutor({ cockpitOptions: { resolvePageLinks: false } })({ document });
      assert.deepStrictEqual(result, { data: { page: { link: "pages://abc123" } } });
      assert.ok(!urls().some((url) => url.pathname.endsWith("/pages/pages")));
    });
  });
});
