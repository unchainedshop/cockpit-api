import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createConfig, accessCacheScope, type CockpitAPIOptions } from "./config.ts";
import { EnvManager } from "../__tests__/test-helpers.ts";

const endpoint = "https://example.com/api";

describe("createConfig", () => {
  const env = new EnvManager();

  beforeEach(() => {
    env.reset();
    env.clear("COCKPIT");
  });

  afterEach(() => {
    env.reset();
  });

  it("requires an endpoint (option wins over COCKPIT_GRAPHQL_ENDPOINT)", () => {
    assert.throws(() => createConfig(), /endpoint is required/);
    env.set({ COCKPIT_GRAPHQL_ENDPOINT: "https://env.example.com/api/graphql" });
    assert.strictEqual(createConfig().endpoint.href, "https://env.example.com/api/graphql");
    assert.strictEqual(createConfig({ endpoint }).endpoint.href, endpoint);
  });

  it("validates the tenant (path traversal) and normalizes an empty one", () => {
    assert.strictEqual(createConfig({ endpoint, tenant: "my-tenant_123" }).tenant, "my-tenant_123");
    assert.strictEqual(createConfig({ endpoint, tenant: "" }).tenant, undefined);
    assert.strictEqual(createConfig({ endpoint }).tenant, undefined);
    for (const tenant of ["../malicious", "tenant/path"]) {
      assert.throws(() => createConfig({ endpoint, tenant }), /Invalid tenant format/);
    }
  });

  describe("apiKey", () => {
    const cases: [name: string, vars: Record<string, string>, options: CockpitAPIOptions, expected: string | undefined][] = [
      ["option", {}, { apiKey: "my-api-key" }, "my-api-key"],
      ["COCKPIT_SECRET", { COCKPIT_SECRET: "env-secret" }, {}, "env-secret"],
      ["COCKPIT_SECRET_<TENANT>", { COCKPIT_SECRET_MYTENANT: "t" }, { tenant: "mytenant" }, "t"],
      ["option over env", { COCKPIT_SECRET_MYTENANT: "t" }, { tenant: "mytenant", apiKey: "o" }, "o"],
      ["empty option as missing", { COCKPIT_SECRET: "env-secret" }, { apiKey: "" }, "env-secret"],
      ["empty env as missing", { COCKPIT_SECRET: "" }, {}, undefined],
      ["no default key for a tenant", { COCKPIT_SECRET: "env-secret" }, { tenant: "other" }, undefined],
    ];
    for (const [name, vars, options, expected] of cases) {
      it(name, () => {
        env.set(vars);
        assert.strictEqual(createConfig({ endpoint, ...options }).apiKey, expected);
      });
    }
  });

  it("applies defaults", () => {
    const config = createConfig({ endpoint });
    assert.strictEqual(config.useAdminAccess, false);
    assert.strictEqual(config.defaultLanguage, null);
    assert.strictEqual(config.relativeAssetPaths, false);
    assert.strictEqual(config.resolvePageLinks, false);
    assert.strictEqual(config.timeout, 15000);
    assert.deepStrictEqual(config.cache, {});
    assert.strictEqual("publicUrl" in config, false);
    assert.strictEqual(Object.isFrozen(config), true);
  });

  it("reads publicUrl / relativeAssetPaths from env, options win", () => {
    env.set({ COCKPIT_PUBLIC_URL: "https://env.example.com", COCKPIT_RELATIVE_ASSET_PATHS: "true" });
    assert.strictEqual(createConfig({ endpoint }).publicUrl, "https://env.example.com");
    assert.strictEqual(createConfig({ endpoint }).relativeAssetPaths, true);
    const config = createConfig({ endpoint, publicUrl: "https://o.example.com", relativeAssetPaths: false });
    assert.strictEqual(config.publicUrl, "https://o.example.com");
    assert.strictEqual(config.relativeAssetPaths, false);
  });

  it("strips trailing slashes from publicUrl", () => {
    assert.strictEqual(createConfig({ endpoint, publicUrl: "https://cdn.example.com//" }).publicUrl, "https://cdn.example.com");
    env.set({ COCKPIT_PUBLIC_URL: "https://env.example.com/" });
    assert.strictEqual(createConfig({ endpoint }).publicUrl, "https://env.example.com");
  });

  describe("timeout", () => {
    it("uses the option, then COCKPIT_TIMEOUT, then 15000; 0 disables", () => {
      assert.strictEqual(createConfig({ endpoint, timeout: 2500 }).timeout, 2500);
      assert.strictEqual(createConfig({ endpoint, timeout: 0 }).timeout, 0);
      env.set({ COCKPIT_TIMEOUT: "3000" });
      assert.strictEqual(createConfig({ endpoint }).timeout, 3000);
      assert.strictEqual(createConfig({ endpoint, timeout: 100 }).timeout, 100);
      env.set({ COCKPIT_TIMEOUT: "0" });
      assert.strictEqual(createConfig({ endpoint }).timeout, 0);
    });

    it("rejects invalid timeouts", () => {
      assert.throws(() => createConfig({ endpoint, timeout: -1 }), /Cockpit: Invalid timeout/);
      assert.throws(() => createConfig({ endpoint, timeout: Number.NaN }), /Cockpit: Invalid timeout/);
      env.set({ COCKPIT_TIMEOUT: "false" });
      assert.throws(() => createConfig({ endpoint }), /Cockpit: Invalid COCKPIT_TIMEOUT/);
    });
  });

  describe("cache", () => {
    it("resolves max from the option, then COCKPIT_CACHE_MAX", () => {
      env.set({ COCKPIT_CACHE_MAX: "5" });
      assert.deepStrictEqual(createConfig({ endpoint }).cache, { max: 5 });
      const swr = { freshMs: 1, staleMs: 2 };
      assert.deepStrictEqual(createConfig({ endpoint, cache: { max: 7, swr } }).cache, { max: 7, swr });
      assert.strictEqual(createConfig({ endpoint, cache: false }).cache, false);
    });

    it("ignores COCKPIT_CACHE_MAX (even invalid) with a custom store or caching off", () => {
      env.set({ COCKPIT_CACHE_MAX: "lots" });
      assert.throws(() => createConfig({ endpoint }), /Invalid COCKPIT_CACHE_MAX/);
      const store = { get: async () => undefined, set: async () => {}, clear: async () => {} };
      assert.deepStrictEqual(createConfig({ endpoint, cache: { store } }).cache, { store });
      assert.strictEqual(createConfig({ endpoint, cache: false }).cache, false);
    });
  });

  describe("cachePrefix", () => {
    it("scopes keys by endpoint and tenant", () => {
      assert.strictEqual(createConfig({ endpoint }).cachePrefix, `cockpit-api:${endpoint}:default:public:`);
      assert.strictEqual(
        createConfig({ endpoint, tenant: "mytenant" }).cachePrefix,
        `cockpit-api:${endpoint}:mytenant:public:`,
      );
      assert.notStrictEqual(
        createConfig({ endpoint: "https://a.example.com/api" }).cachePrefix,
        createConfig({ endpoint: "https://b.example.com/api" }).cachePrefix,
      );
    });

    it("isolates admin clients by a short hash of the apiKey, public clients share", () => {
      const pub = createConfig({ endpoint, apiKey: "secret-a" });
      const adminA = createConfig({ endpoint, apiKey: "secret-a", useAdminAccess: true });
      const adminB = createConfig({ endpoint, apiKey: "secret-b", useAdminAccess: true });
      assert.match(adminA.cachePrefix, /^cockpit-api:https:\/\/example\.com\/api:default:admin-[0-9a-f]{12}:$/);
      assert.notStrictEqual(pub.cachePrefix, adminA.cachePrefix);
      assert.notStrictEqual(adminA.cachePrefix, adminB.cachePrefix);
      assert.ok(!adminA.cachePrefix.includes("secret-a"), "raw key must not leak into keys");
      assert.strictEqual(pub.cachePrefix, createConfig({ endpoint }).cachePrefix);
    });
  });

  it("accessCacheScope: per-request override wins over the factory setting", () => {
    const pub = createConfig({ endpoint, apiKey: "k" });
    const admin = createConfig({ endpoint, apiKey: "k", useAdminAccess: true });
    assert.strictEqual(accessCacheScope(pub), "public");
    assert.strictEqual(accessCacheScope(admin, false), "public");
    assert.match(accessCacheScope(pub, true), /^admin-[0-9a-f]{12}$/);
    assert.strictEqual(accessCacheScope(pub, true), accessCacheScope(admin));
  });
});
