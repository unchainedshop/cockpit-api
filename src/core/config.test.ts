import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createConfig } from "./config.ts";
import { EnvManager } from "../__tests__/test-helpers.ts";

describe("createConfig", () => {
  const env = new EnvManager();

  beforeEach(() => {
    env.reset();
    env.clear("COCKPIT");
  });

  afterEach(() => {
    env.reset();
  });

  describe("endpoint configuration", () => {
    it("uses endpoint from options", () => {
      const config = createConfig({
        endpoint: "https://example.com/api/graphql",
      });
      assert.strictEqual(config.endpoint.href, "https://example.com/api/graphql");
    });

    it("falls back to COCKPIT_GRAPHQL_ENDPOINT env var", () => {
      env.set({ COCKPIT_GRAPHQL_ENDPOINT: "https://env.example.com/api/graphql" });
      const config = createConfig();
      assert.strictEqual(config.endpoint.href, "https://env.example.com/api/graphql");
    });

    it("throws when no endpoint is provided", () => {
      assert.throws(
        () => createConfig(),
        /endpoint is required/,
      );
    });

    it("options endpoint takes precedence over env var", () => {
      env.set({ COCKPIT_GRAPHQL_ENDPOINT: "https://env.example.com/api" });
      const config = createConfig({
        endpoint: "https://options.example.com/api",
      });
      assert.strictEqual(config.endpoint.href, "https://options.example.com/api");
    });
  });

  describe("tenant configuration", () => {
    it("sets tenant when provided", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
        tenant: "mytenant",
      });
      assert.strictEqual(config.tenant, "mytenant");
    });

    it("allows alphanumeric tenants", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
        tenant: "tenant123",
      });
      assert.strictEqual(config.tenant, "tenant123");
    });

    it("allows hyphens and underscores in tenant", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
        tenant: "my-tenant_123",
      });
      assert.strictEqual(config.tenant, "my-tenant_123");
    });

    it("throws on invalid tenant format (path traversal)", () => {
      assert.throws(
        () =>
          createConfig({
            endpoint: "https://example.com/api",
            tenant: "../malicious",
          }),
        /Invalid tenant format/,
      );
    });

    it("throws on invalid tenant format (special chars)", () => {
      assert.throws(
        () =>
          createConfig({
            endpoint: "https://example.com/api",
            tenant: "tenant/path",
          }),
        /Invalid tenant format/,
      );
    });

    it("tenant is undefined when not provided", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
      });
      assert.strictEqual(config.tenant, undefined);
    });
  });

  describe("API key configuration", () => {
    it("uses apiKey from options", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
        apiKey: "my-api-key",
      });
      assert.strictEqual(config.apiKey, "my-api-key");
    });

    it("falls back to COCKPIT_SECRET env var", () => {
      env.set({ COCKPIT_SECRET: "env-secret" });
      const config = createConfig({
        endpoint: "https://example.com/api",
      });
      assert.strictEqual(config.apiKey, "env-secret");
    });

    it("uses tenant-specific COCKPIT_SECRET_<TENANT> env var", () => {
      env.set({ COCKPIT_SECRET_MYTENANT: "tenant-secret" });
      const config = createConfig({
        endpoint: "https://example.com/api",
        tenant: "mytenant",
      });
      assert.strictEqual(config.apiKey, "tenant-secret");
    });

    it("options apiKey takes precedence over env vars", () => {
      env.set({
        COCKPIT_SECRET: "env-secret",
        COCKPIT_SECRET_MYTENANT: "tenant-secret",
      });
      const config = createConfig({
        endpoint: "https://example.com/api",
        tenant: "mytenant",
        apiKey: "options-key",
      });
      assert.strictEqual(config.apiKey, "options-key");
    });

    it("apiKey is undefined when not provided", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
      });
      assert.strictEqual(config.apiKey, undefined);
    });
  });

  describe("default values", () => {
    it("useAdminAccess defaults to false", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
      });
      assert.strictEqual(config.useAdminAccess, false);
    });

    it("sets useAdminAccess when provided", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
        useAdminAccess: true,
      });
      assert.strictEqual(config.useAdminAccess, true);
    });

    it("defaultLanguage defaults to null", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
      });
      assert.strictEqual(config.defaultLanguage, null);
    });

    it("sets defaultLanguage when provided", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
        defaultLanguage: "en",
      });
      assert.strictEqual(config.defaultLanguage, "en");
    });
  });

  describe("cachePrefix", () => {
    it("generates cachePrefix with endpoint and default tenant", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
      });
      assert.strictEqual(config.cachePrefix, "https://example.com/api:default:");
    });

    it("generates cachePrefix with endpoint and tenant", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
        tenant: "mytenant",
      });
      assert.strictEqual(config.cachePrefix, "https://example.com/api:mytenant:");
    });
  });

  describe("immutability", () => {
    it("returns a frozen config object", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
      });
      assert.strictEqual(Object.isFrozen(config), true);
    });

    it("cannot modify frozen config properties", () => {
      const config = createConfig({
        endpoint: "https://example.com/api",
      });
      assert.throws(() => {
        (config as unknown as { tenant: string }).tenant = "hacked";
      });
    });
  });
});
