import { describe, it } from "node:test";
import assert from "node:assert";
import { createUrlBuilder } from "./url-builder.ts";
import type { CockpitConfig } from "./config.ts";

describe("createUrlBuilder", () => {
  const createTestConfig = (overrides: Partial<CockpitConfig> = {}): CockpitConfig => ({
    endpoint: new URL("https://test.example.com/api/graphql"),
    useAdminAccess: false,
    defaultLanguage: "de",
    cachePrefix: "test:prefix:",
    ...overrides,
  });

  describe("build", () => {
    it("builds URL with path", () => {
      const builder = createUrlBuilder(createTestConfig());
      const url = builder.build("/content/items/articles");

      assert.strictEqual(url.pathname, "/api/content/items/articles");
      assert.strictEqual(url.origin, "https://test.example.com");
    });

    it("includes tenant in path when configured", () => {
      const config = createTestConfig({ tenant: "mytenant" });
      const builder = createUrlBuilder(config);
      const url = builder.build("/content/items/articles");

      assert.strictEqual(url.pathname, "/:mytenant/api/content/items/articles");
    });

    it("includes locale in query params", () => {
      const builder = createUrlBuilder(createTestConfig());
      const url = builder.build("/content/items/articles", { locale: "en" });

      assert.strictEqual(url.searchParams.get("locale"), "en");
    });

    it("normalizes default language to default locale", () => {
      const builder = createUrlBuilder(createTestConfig({ defaultLanguage: "de" }));
      const url = builder.build("/content/items/articles", { locale: "de" });

      assert.strictEqual(url.searchParams.get("locale"), "default");
    });

    it("uses default locale when no locale specified", () => {
      const builder = createUrlBuilder(createTestConfig());
      const url = builder.build("/content/items/articles");

      assert.strictEqual(url.searchParams.get("locale"), "default");
    });

    it("preserves non-default languages", () => {
      const builder = createUrlBuilder(createTestConfig({ defaultLanguage: "de" }));
      const url = builder.build("/content/items/articles", { locale: "en" });

      assert.strictEqual(url.searchParams.get("locale"), "en");
    });

    it("handles custom default language", () => {
      const builder = createUrlBuilder(createTestConfig({ defaultLanguage: "en" }));
      const url = builder.build("/content/items/articles", { locale: "en" });

      assert.strictEqual(url.searchParams.get("locale"), "default");
    });

    it("includes additional query params", () => {
      const builder = createUrlBuilder(createTestConfig());
      const url = builder.build("/content/items/articles", {
        queryParams: { limit: 10, skip: 20 },
      });

      assert.strictEqual(url.searchParams.get("limit"), "10");
      assert.strictEqual(url.searchParams.get("skip"), "20");
    });

    it("handles complex query params (objects/arrays)", () => {
      const builder = createUrlBuilder(createTestConfig());
      const url = builder.build("/content/items/articles", {
        queryParams: {
          filter: { status: "published" },
          fields: ["title", "slug"],
        },
      });

      // Objects and arrays should be JSON stringified
      assert.strictEqual(
        url.searchParams.get("filter"),
        JSON.stringify({ status: "published" }),
      );
      assert.strictEqual(
        url.searchParams.get("fields"),
        JSON.stringify(["title", "slug"]),
      );
    });

    it("omits empty query params", () => {
      const builder = createUrlBuilder(createTestConfig());
      const url = builder.build("/content/items/articles", {
        queryParams: { present: "value", empty: null, undef: undefined },
      });

      assert.strictEqual(url.searchParams.get("present"), "value");
      assert.strictEqual(url.searchParams.has("empty"), false);
      assert.strictEqual(url.searchParams.has("undef"), false);
    });

    it("combines tenant, locale, and query params", () => {
      const config = createTestConfig({ tenant: "mytenant", defaultLanguage: "de" });
      const builder = createUrlBuilder(config);
      const url = builder.build("/content/items/articles", {
        locale: "fr",
        queryParams: { limit: 5 },
      });

      assert.strictEqual(url.pathname, "/:mytenant/api/content/items/articles");
      assert.strictEqual(url.searchParams.get("locale"), "fr");
      assert.strictEqual(url.searchParams.get("limit"), "5");
    });
  });

  describe("graphqlEndpoint", () => {
    it("returns GraphQL endpoint URL without tenant", () => {
      const builder = createUrlBuilder(createTestConfig());
      const url = builder.graphqlEndpoint();

      assert.strictEqual(url.href, "https://test.example.com/api/graphql");
    });

    it("includes tenant prefix in GraphQL endpoint", () => {
      const config = createTestConfig({ tenant: "mytenant" });
      const builder = createUrlBuilder(config);
      const url = builder.graphqlEndpoint();

      assert.strictEqual(url.pathname, "/:mytenant/api/graphql");
    });

    it("preserves original endpoint path", () => {
      const config = createTestConfig({
        endpoint: new URL("https://test.example.com/custom/graphql/path"),
      });
      const builder = createUrlBuilder(config);
      const url = builder.graphqlEndpoint();

      assert.strictEqual(url.pathname, "/custom/graphql/path");
    });

    it("preserves endpoint path with tenant", () => {
      const config = createTestConfig({
        endpoint: new URL("https://test.example.com/custom/graphql"),
        tenant: "mytenant",
      });
      const builder = createUrlBuilder(config);
      const url = builder.graphqlEndpoint();

      assert.strictEqual(url.pathname, "/:mytenant/custom/graphql");
    });
  });
});
