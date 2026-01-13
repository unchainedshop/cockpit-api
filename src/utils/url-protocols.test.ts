import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseCockpitUrl,
  isCockpitPageUrl,
  isCockpitAssetUrl,
  extractPageId,
  extractAssetId,
} from "./url-protocols.ts";

describe("parseCockpitUrl", () => {
  it("parses pages:// URLs", () => {
    const result = parseCockpitUrl("pages://abc123");
    assert.deepStrictEqual(result, {
      protocol: "pages",
      id: "abc123",
      original: "pages://abc123",
    });
  });

  it("parses assets:// URLs", () => {
    const result = parseCockpitUrl("assets://xyz789");
    assert.deepStrictEqual(result, {
      protocol: "assets",
      id: "xyz789",
      original: "assets://xyz789",
    });
  });

  it("parses external URLs (https)", () => {
    const result = parseCockpitUrl("https://example.com");
    assert.deepStrictEqual(result, {
      protocol: "external",
      id: "https://example.com",
      original: "https://example.com",
    });
  });

  it("parses external URLs (http)", () => {
    const result = parseCockpitUrl("http://example.com");
    assert.deepStrictEqual(result, {
      protocol: "external",
      id: "http://example.com",
      original: "http://example.com",
    });
  });

  it("strips query params from pages:// URLs", () => {
    const result = parseCockpitUrl("pages://abc123?foo=bar");
    assert.deepStrictEqual(result, {
      protocol: "pages",
      id: "abc123",
      original: "pages://abc123?foo=bar",
    });
  });

  it("strips query params from assets:// URLs", () => {
    const result = parseCockpitUrl("assets://xyz789?size=large");
    assert.deepStrictEqual(result, {
      protocol: "assets",
      id: "xyz789",
      original: "assets://xyz789?size=large",
    });
  });

  it("trims whitespace from URLs", () => {
    const result = parseCockpitUrl("  pages://abc123  ");
    assert.deepStrictEqual(result, {
      protocol: "pages",
      id: "abc123",
      original: "pages://abc123",
    });
  });

  it("returns null for null input", () => {
    const result = parseCockpitUrl(null);
    assert.strictEqual(result, null);
  });

  it("returns null for undefined input", () => {
    const result = parseCockpitUrl(undefined);
    assert.strictEqual(result, null);
  });

  it("returns null for empty string", () => {
    const result = parseCockpitUrl("");
    assert.strictEqual(result, null);
  });

  it("returns null for whitespace-only string", () => {
    const result = parseCockpitUrl("   ");
    assert.strictEqual(result, null);
  });

  it("returns null for non-string input", () => {
    const result = parseCockpitUrl(123 as unknown as string);
    assert.strictEqual(result, null);
  });

  it("handles pages:// with empty ID", () => {
    const result = parseCockpitUrl("pages://");
    assert.deepStrictEqual(result, {
      protocol: "pages",
      id: "",
      original: "pages://",
    });
  });

  it("handles assets:// with empty ID", () => {
    const result = parseCockpitUrl("assets://");
    assert.deepStrictEqual(result, {
      protocol: "assets",
      id: "",
      original: "assets://",
    });
  });

  it("handles pages:// with only query params", () => {
    const result = parseCockpitUrl("pages://?param=value");
    assert.deepStrictEqual(result, {
      protocol: "pages",
      id: "",
      original: "pages://?param=value",
    });
  });

  it("handles assets:// with only query params", () => {
    const result = parseCockpitUrl("assets://?param=value");
    assert.deepStrictEqual(result, {
      protocol: "assets",
      id: "",
      original: "assets://?param=value",
    });
  });
});

describe("isCockpitPageUrl", () => {
  it("returns true for pages:// URLs", () => {
    assert.strictEqual(isCockpitPageUrl("pages://123"), true);
  });

  it("returns false for assets:// URLs", () => {
    assert.strictEqual(isCockpitPageUrl("assets://456"), false);
  });

  it("returns false for external URLs", () => {
    assert.strictEqual(isCockpitPageUrl("https://example.com"), false);
  });

  it("returns false for null", () => {
    assert.strictEqual(isCockpitPageUrl(null), false);
  });

  it("returns false for undefined", () => {
    assert.strictEqual(isCockpitPageUrl(undefined), false);
  });

  it("returns false for empty string", () => {
    assert.strictEqual(isCockpitPageUrl(""), false);
  });
});

describe("isCockpitAssetUrl", () => {
  it("returns true for assets:// URLs", () => {
    assert.strictEqual(isCockpitAssetUrl("assets://456"), true);
  });

  it("returns false for pages:// URLs", () => {
    assert.strictEqual(isCockpitAssetUrl("pages://123"), false);
  });

  it("returns false for external URLs", () => {
    assert.strictEqual(isCockpitAssetUrl("https://example.com"), false);
  });

  it("returns false for null", () => {
    assert.strictEqual(isCockpitAssetUrl(null), false);
  });

  it("returns false for undefined", () => {
    assert.strictEqual(isCockpitAssetUrl(undefined), false);
  });

  it("returns false for empty string", () => {
    assert.strictEqual(isCockpitAssetUrl(""), false);
  });
});

describe("extractPageId", () => {
  it("extracts page ID from pages:// URL", () => {
    assert.strictEqual(extractPageId("pages://abc123"), "abc123");
  });

  it("returns null for assets:// URL", () => {
    assert.strictEqual(extractPageId("assets://456"), null);
  });

  it("returns null for external URL", () => {
    assert.strictEqual(extractPageId("https://example.com"), null);
  });

  it("returns null for null", () => {
    assert.strictEqual(extractPageId(null), null);
  });

  it("returns null for undefined", () => {
    assert.strictEqual(extractPageId(undefined), null);
  });

  it("returns null for empty string", () => {
    assert.strictEqual(extractPageId(""), null);
  });
});

describe("extractAssetId", () => {
  it("extracts asset ID from assets:// URL", () => {
    assert.strictEqual(extractAssetId("assets://xyz789"), "xyz789");
  });

  it("returns null for pages:// URL", () => {
    assert.strictEqual(extractAssetId("pages://123"), null);
  });

  it("returns null for external URL", () => {
    assert.strictEqual(extractAssetId("https://example.com"), null);
  });

  it("returns null for null", () => {
    assert.strictEqual(extractAssetId(null), null);
  });

  it("returns null for undefined", () => {
    assert.strictEqual(extractAssetId(undefined), null);
  });

  it("returns null for empty string", () => {
    assert.strictEqual(extractAssetId(""), null);
  });
});
