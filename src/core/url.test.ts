import { describe, it } from "node:test";
import assert from "node:assert";
import {
  assertSafePath,
  buildQueryString,
  createUrlBuilder,
  normalizeLocale,
  requestLocale,
  requireParam,
  validatePathSegment,
} from "./url.ts";

const endpoint = new URL("https://test.example.com/api/graphql");
const builder = (tenant?: string, defaultLanguage: string | null = "de") =>
  createUrlBuilder({ endpoint, defaultLanguage, ...(tenant !== undefined && { tenant }) });

describe("createUrlBuilder.build", () => {
  it("builds API paths below /api or /:<tenant>/api", () => {
    const url = builder().build("/content/items/articles");
    assert.strictEqual(url.origin, "https://test.example.com");
    assert.strictEqual(url.pathname, "/api/content/items/articles");
    assert.strictEqual(
      builder("mytenant").build("/content/items/articles").pathname,
      "/:mytenant/api/content/items/articles",
    );
  });

  const locales: [locale: string | undefined, defaultLanguage: string | null, sent: string][] = [
    [undefined, "de", "default"],
    ["de", "de", "default"],
    ["en", "de", "en"],
    ["en", "en", "default"],
    ["de", null, "de"],
  ];
  for (const [locale, defaultLanguage, sent] of locales) {
    it(`sends locale ${String(locale)} as ${sent} (defaultLanguage ${String(defaultLanguage)})`, () => {
      const url = builder(undefined, defaultLanguage).build("/x", locale === undefined ? {} : { locale });
      assert.strictEqual(url.searchParams.get("locale"), sent);
      assert.strictEqual(requestLocale(url), sent);
      assert.strictEqual(normalizeLocale(locale, defaultLanguage), sent);
    });
  }

  it("encodes query params and lets the normalized locale win", () => {
    const url = builder().build("/content/items/articles", {
      locale: "de",
      queryParams: { locale: "fr", limit: 10, filter: { status: "published" }, fields: ["title"], empty: null },
    });
    assert.strictEqual(url.searchParams.getAll("locale").join(), "default");
    assert.strictEqual(url.searchParams.get("limit"), "10");
    assert.strictEqual(url.searchParams.get("filter"), '{"status":"published"}');
    assert.strictEqual(url.searchParams.get("fields"), '["title"]');
    assert.strictEqual(url.searchParams.has("empty"), false);
  });

  const unsafePaths = [
    "/pages/page/../../content/items/private",
    "/pages/page/..",
    "/pages/./page",
    "/pages/page/%2e%2e/x",
    "/pages/page/%2E%2E%2Fx",
    "/pages/page/..%2fx",
    "/pages/page/..\\x",
    "/pages/page/a%5cb",
    "/pages/page/a?locale=x",
    "/pages/page/a#frag",
    "/pages/page/a\nb",
    "/pages/page/a\u0000b",
    "pages/page/x",
    "//evil.example.com/x",
  ];
  for (const path of unsafePaths) {
    it(`rejects unsafe path ${JSON.stringify(path)}`, () => {
      assert.throws(() => builder("mytenant").build(path), /Cockpit: Invalid request path/);
      assert.throws(() => assertSafePath(path), /Cockpit: Invalid request path/);
    });
  }

  it("still builds legitimate paths", () => {
    assert.strictEqual(
      builder("mytenant").build("/pages/page/64f0c2a1b2c3d4e5f6a7b8c9").pathname,
      "/:mytenant/api/pages/page/64f0c2a1b2c3d4e5f6a7b8c9",
    );
    assert.strictEqual(builder().build("/content/items/my_model-2").pathname, "/api/content/items/my_model-2");
  });
});

describe("createUrlBuilder.graphqlEndpoint", () => {
  const cases: [endpoint: string, tenant: string | undefined, pathname: string][] = [
    ["https://test.example.com/api/graphql", undefined, "/api/graphql"],
    ["https://test.example.com/api/graphql", "mytenant", "/:mytenant/api/graphql"],
    ["https://test.example.com/custom/graphql", "mytenant", "/:mytenant/custom/graphql"],
  ];
  for (const [href, tenant, pathname] of cases) {
    it(`${href} with tenant ${String(tenant)} -> ${pathname}`, () => {
      const url = createUrlBuilder({
        endpoint: new URL(href),
        defaultLanguage: null,
        ...(tenant !== undefined && { tenant }),
      }).graphqlEndpoint();
      assert.strictEqual(url.pathname, pathname);
    });
  }
});

describe("buildQueryString", () => {
  const cases: [params: Record<string, unknown>, expected: string][] = [
    [{ a: "foo", b: "bar" }, "a=foo&b=bar"],
    [{ name: "hello world" }, "name=hello%20world"],
    [{ a: "foo", b: null, c: undefined, d: "baz" }, "a=foo&d=baz"],
    [{ skip: 0, b: "" }, "skip=0&b="],
    // Cockpit reads flags as ints and ignores `flag=true`: true -> 1, false omitted
    [{ inactive: true }, "inactive=1"],
    [{ a: "x", inactive: false }, "a=x"],
    [{ filter: { active: true, hidden: false } }, `filter=${encodeURIComponent('{"active":true,"hidden":false}')}`],
    [
      { limit: 10, fields: ["title", "slug"], sort: { _created: -1 } },
      `limit=10&fields=${encodeURIComponent('["title","slug"]')}&sort=${encodeURIComponent('{"_created":-1}')}`,
    ],
    [{}, ""],
    [{ a: null, b: undefined, c: false }, ""],
  ];
  for (const [params, expected] of cases) {
    it(`${JSON.stringify(params)} -> ${JSON.stringify(expected)}`, () => {
      assert.strictEqual(buildQueryString(params), expected);
    });
  }
});

describe("validatePathSegment / requireParam", () => {
  for (const value of ["abc", "64f0c2a1b2c3", "my_model-2"]) {
    it(`accepts ${value}`, () => {
      assert.doesNotThrow(() => validatePathSegment(value, "id"));
    });
  }
  for (const value of ["", "a.b", "a/b", "..", "a%2f", "a b", "a?b", "a#b", "a\\b", 42 as unknown as string]) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      assert.throws(() => validatePathSegment(value, "id"), /Cockpit: Invalid id format/);
    });
  }

  it("requireParam rejects undefined, null and empty strings", () => {
    for (const value of [undefined, null, ""]) {
      assert.throws(() => requireParam(value, "a model"), /Cockpit: Please provide a model/);
    }
    assert.doesNotThrow(() => requireParam(0, "a value"));
  });
});
