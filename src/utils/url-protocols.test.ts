import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractAssetId,
  extractPageId,
  parseCockpitUrl,
} from "./url-protocols.ts";

describe("parseCockpitUrl", () => {
  const cases: [unknown, ReturnType<typeof parseCockpitUrl>][] = [
    ["pages://abc123", { protocol: "pages", id: "abc123", original: "pages://abc123" }],
    ["assets://xyz789", { protocol: "assets", id: "xyz789", original: "assets://xyz789" }],
    ["https://example.com", { protocol: "external", id: "https://example.com", original: "https://example.com" }],
    ["http://example.com/x", { protocol: "external", id: "http://example.com/x", original: "http://example.com/x" }],
    ["/relative", { protocol: "external", id: "/relative", original: "/relative" }],
    ["pages://abc?x=1", { protocol: "pages", id: "abc", original: "pages://abc?x=1" }],
    ["assets://a?size=large", { protocol: "assets", id: "a", original: "assets://a?size=large" }],
    ["pages://abc#section", { protocol: "pages", id: "abc", original: "pages://abc#section" }],
    ["assets://a?size=large#top", { protocol: "assets", id: "a", original: "assets://a?size=large#top" }],
    ["pages://abc#frag?x=1", { protocol: "pages", id: "abc", original: "pages://abc#frag?x=1" }],
    ["  pages://abc  ", { protocol: "pages", id: "abc", original: "pages://abc" }],
    [null, null],
    [undefined, null],
    ["", null],
    ["   ", null],
    [123, null],
    ["pages://", null],
    ["assets://", null],
    ["pages://?param=value", null],
    ["assets://?param=value", null],
    ["pages://#section", null],
    ["assets://#x", null],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input) ?? "undefined"} → ${JSON.stringify(expected)}`, () => {
      assert.deepStrictEqual(parseCockpitUrl(input as string), expected);
    });
  }
});

describe("extractPageId / extractAssetId", () => {
  const cases: [string | null | undefined, string | null, string | null][] = [
    ["pages://abc123", "abc123", null],
    ["assets://xyz789", null, "xyz789"],
    ["pages://abc#x", "abc", null],
    ["https://example.com", null, null],
    ["pages://", null, null],
    ["", null, null],
    [null, null, null],
    [undefined, null, null],
  ];
  for (const [input, pageId, assetId] of cases) {
    it(`${JSON.stringify(input) ?? "undefined"}`, () => {
      assert.strictEqual(extractPageId(input), pageId);
      assert.strictEqual(extractAssetId(input), assetId);
    });
  }
});
