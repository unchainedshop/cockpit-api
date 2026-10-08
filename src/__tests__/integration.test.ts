/**
 * Integration tests for the Cockpit API client against a real Cockpit CMS
 * instance. They are not part of `npm test`; the whole suite is skipped unless
 * COCKPIT_TEST_ENDPOINT is set.
 *
 * Run with:
 *   COCKPIT_TEST_ENDPOINT=https://cms.example.com npm run test:integration
 *
 * Required:
 *   COCKPIT_TEST_ENDPOINT=https://cms.example.com   (Cockpit instance to test against)
 *
 * Optional:
 *   COCKPIT_TEST_SECRET=your-api-key        (authenticated requests via admin access)
 *   COCKPIT_TEST_TENANT=mytenant            (multi-tenant tests)
 *   COCKPIT_TEST_SEARCH_INDEX=pages         (Detektivo search tests)
 *   COCKPIT_TEST_LOKALIZE_PROJECT=default   (Lokalize tests)
 *
 * Tests that depend on content the instance may not have (pages, menus,
 * assets, pages:// links, addons) are reported as skipped when it is absent.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert";
import {
  CockpitAPI,
  type CockpitAPIClient,
  type CockpitAPIOptions,
} from "../index.ts";
import {
  createFetchClient,
  type FetchClient,
  type FetchClientOptions,
} from "../fetch/client.ts";

const TEST_ENDPOINT = process.env["COCKPIT_TEST_ENDPOINT"];
const TEST_SECRET = process.env["COCKPIT_TEST_SECRET"];
const TEST_TENANT = process.env["COCKPIT_TEST_TENANT"];
const TEST_SEARCH_INDEX = process.env["COCKPIT_TEST_SEARCH_INDEX"];
const TEST_LOKALIZE_PROJECT = process.env["COCKPIT_TEST_LOKALIZE_PROJECT"];

// Only read inside the suite, which is skipped when the endpoint is unset.
const endpoint = TEST_ENDPOINT ?? "";

const NONEXISTENT_ID = "000000000000000000000000";

interface PageSummary {
  _id: string;
  _r?: string;
  route?: string;
}

interface DiscoveredPage {
  id: string;
  route: string | undefined;
}

interface DiscoveredData {
  pages: DiscoveredPage[];
  menuNames: string[];
  assetIds: string[];
  imageAssetIds: string[];
}

function clientOptions(
  extra: Partial<CockpitAPIOptions> = {},
): CockpitAPIOptions {
  return {
    endpoint,
    ...(TEST_SECRET && { apiKey: TEST_SECRET, useAdminAccess: true }),
    ...extra,
  };
}

function fetchClientOptions(
  extra: Partial<FetchClientOptions> = {},
): FetchClientOptions {
  return {
    endpoint,
    ...(TEST_SECRET && { apiKey: TEST_SECRET }),
    ...extra,
  };
}

function toPages(list: PageSummary[]): DiscoveredPage[] {
  return list
    .filter((p) => typeof p._id === "string" && p._id !== "")
    .map((p) => ({ id: p._id, route: p._r ?? p.route }));
}

function extractAssetIds(obj: unknown): string[] {
  const ids: string[] = [];

  function walk(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const record = value as Record<string, unknown>;
    // Asset objects have an _id and a path under /storage/
    if (
      typeof record["_id"] === "string" &&
      typeof record["path"] === "string" &&
      record["path"].includes("/storage/")
    ) {
      ids.push(record["_id"]);
    }
    Object.values(record).forEach(walk);
  }

  walk(obj);
  return [...new Set(ids)];
}

function isImageAsset(asset: unknown): boolean {
  if (typeof asset !== "object" || asset === null) return false;
  const mime = (asset as Record<string, unknown>)["mime"];
  return typeof mime === "string" && mime.startsWith("image/");
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  assert.ok(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${label} should be a non-null object, got ${JSON.stringify(value)}`,
  );
}

function assertPageList(
  response: { data: unknown[] } | null,
  label: string,
): asserts response is { data: PageSummary[] } {
  assert.ok(response !== null, `${label} should not be null`);
  assert.ok(Array.isArray(response.data), `${label}.data should be an array`);
  for (const page of response.data) {
    assertPlainObject(page, `${label} item`);
    assert.strictEqual(typeof page["_id"], "string", "page should have _id");
  }
}

/**
 * Count every fetch made while `fn` runs by wrapping globalThis.fetch.
 */
async function countFetches<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; urls: string[] }> {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (input, init): Promise<Response> => {
    urls.push(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );
    return original(input, init);
  };
  try {
    return { result: await fn(), urls };
  } finally {
    globalThis.fetch = original;
  }
}

describe(
  "Cockpit API Integration Tests",
  {
    skip:
      !TEST_ENDPOINT &&
      "COCKPIT_TEST_ENDPOINT not set (see header of integration.test.ts)",
  },
  () => {
    let client: CockpitAPIClient;
    const discovered: DiscoveredData = {
      pages: [],
      menuNames: [],
      assetIds: [],
      imageAssetIds: [],
    };

    before(async () => {
      client = await CockpitAPI(clientOptions());

      const pagesResponse = await client.pages<PageSummary>();
      const pageList = pagesResponse?.data ?? [];
      discovered.pages = toPages(pageList);
      discovered.assetIds = extractAssetIds(pageList);

      const menus = await client.pagesMenus<{ name?: string }>();
      discovered.menuNames = (menus ?? [])
        .map((m) => m.name)
        .filter((n): n is string => typeof n === "string" && n !== "");

      for (const assetId of discovered.assetIds.slice(0, 5)) {
        const asset = await client.assetById(assetId);
        if (isImageAsset(asset)) discovered.imageAssetIds.push(assetId);
      }
    });

    describe("System API", () => {
      it("GET /api/system/healthcheck - returns an object", async (t) => {
        let result: unknown;
        try {
          result = await client.healthCheck();
        } catch (error) {
          // Cockpit answers 500 here when debug mode is disabled.
          if (error instanceof Error && error.message.includes("(500)")) {
            t.skip("healthcheck returned 500 (debug mode disabled on server)");
            return;
          }
          throw error;
        }
        assertPlainObject(result, "healthCheck result");
      });
    });

    describe("Content API", () => {
      it("GET /api/content/items/{model} - returns null for non-existent model", async () => {
        const result = await client.getContentItems(
          "nonexistent_model_xyz_12345",
        );
        assert.strictEqual(result, null);
      });

      it("GET /api/content/item/{model}/{id} - returns null for non-existent item", async () => {
        const result = await client.getContentItem({
          model: "nonexistent_model",
          id: NONEXISTENT_ID,
        });
        assert.strictEqual(result, null);
      });

      it("GET /api/content/tree/{model} - returns null for non-existent model", async () => {
        const result = await client.getContentTree("nonexistent_model");
        assert.strictEqual(result, null);
      });

      it("GET /api/content/aggregate/{model} - returns null for non-existent model", async () => {
        const result = await client.getAggregateModel({
          model: "nonexistent_model",
          pipeline: [{ $match: { _state: 1 } }],
        });
        assert.strictEqual(result, null);
      });
    });

    describe("Pages API", () => {
      it("GET /api/pages/pages - returns { data } with _id on every page", async () => {
        const response = await client.pages();
        assertPageList(response, "pages()");
      });

      it("GET /api/pages/pages - respects limit parameter", async () => {
        const response = await client.pages({ limit: 2 });
        assertPageList(response, "pages({ limit: 2 })");
        assert.ok(response.data.length <= 2, "should respect limit");
      });

      it("GET /api/pages/pages - skip offsets the sorted list", async (t) => {
        const sort = { _created: -1 } as const;
        const first = await client.pages({ limit: 2, skip: 0, sort });
        assertPageList(first, "pages({ skip: 0 })");
        if (first.data.length < 2) {
          t.skip("needs at least 2 pages");
          return;
        }
        const skipped = await client.pages({ limit: 1, skip: 1, sort });
        assertPageList(skipped, "pages({ skip: 1 })");

        assert.strictEqual(skipped.data.length, 1);
        assert.strictEqual(skipped.data[0]?._id, first.data[1]?._id);
        assert.notStrictEqual(skipped.data[0]?._id, first.data[0]?._id);
      });

      it("GET /api/pages/page/{id} - returns null for non-existent page", async () => {
        const result = await client.pageById(NONEXISTENT_ID);
        assert.strictEqual(result, null);
      });

      it("GET /api/pages/page/{id} - fetches existing page by ID", async (t) => {
        const page = discovered.pages[0];
        if (!page) {
          t.skip("no pages on the instance");
          return;
        }
        const result = await client.pageById<PageSummary>(page.id);
        assertPlainObject(result, "pageById result");
        assert.strictEqual(result["_id"], page.id);
      });

      it("GET /api/pages/page?route=... - returns null for non-existent route", async () => {
        const result = await client.pageByRoute("/nonexistent-route-xyz-12345");
        assert.strictEqual(result, null);
      });

      it("GET /api/pages/page?route=... - fetches the page for a route", async (t) => {
        const page = discovered.pages.find((p) => p.route);
        if (!page?.route) {
          t.skip("no routed pages on the instance");
          return;
        }
        const result = await client.pageByRoute<PageSummary>(page.route);
        assertPlainObject(result, `pageByRoute(${page.route})`);
        assert.strictEqual(result["_id"], page.id);
      });

      it("GET /api/pages/settings - returns an object", async () => {
        const result = await client.pagesSetting();
        assertPlainObject(result, "pagesSetting result");
      });

      // Cockpit answers locale=default (configured) with a bare array and an
      // unconfigured locale with an object keyed by locale; the client
      // normalizes both to routes keyed by locale.
      it("GET /api/pages/routes - returns routes keyed by locale", async () => {
        const result = await client.pagesRoutes();
        assertPlainObject(result, "pagesRoutes result");
        assert.ok(Array.isArray(result["default"]), "routes keyed by the requested 'default' locale");
        for (const [locale, routes] of Object.entries(result)) {
          assert.ok(Array.isArray(routes), `routes for ${locale} should be an array`);
          for (const route of routes) assert.strictEqual(typeof route.route, "string");
        }
      });

      it("GET /api/pages/routes?locale=<unconfigured> - returns routes keyed by locale", async () => {
        const result = await client.pagesRoutes("zz-unconfigured");
        assertPlainObject(result, "pagesRoutes result");
        for (const routes of Object.values(result)) {
          assert.ok(Array.isArray(routes), "routes per locale should be an array");
        }
      });

      it("GET /api/pages/sitemap - returns entries with routes per locale", async () => {
        const result = await client.pagesSitemap();
        assert.ok(Array.isArray(result), "sitemap should be an array");
        for (const entry of result) {
          assertPlainObject(entry.routes, "sitemap entry routes");
        }
      });
    });

    describe("Menus API", () => {
      it("GET /api/pages/menus - returns an array of named menus", async () => {
        const result = await client.pagesMenus();
        assert.ok(Array.isArray(result), "menus should be an array");
        for (const menu of result) {
          assert.strictEqual(typeof menu.name, "string");
        }
      });

      it("GET /api/pages/menu/{name} - returns null for non-existent menu", async () => {
        const result = await client.pagesMenu("nonexistent_menu_xyz_12345");
        assert.strictEqual(result, null);
      });

      it("GET /api/pages/menu/{name} - fetches menu by name", async (t) => {
        const menuName = discovered.menuNames[0];
        if (!menuName) {
          t.skip("no menus on the instance");
          return;
        }
        const result = await client.pagesMenu(menuName);
        assertPlainObject(result, `pagesMenu(${menuName})`);
        assert.strictEqual(result["name"], menuName);
      });
    });

    describe("Assets API", () => {
      it("GET /api/assets/{id} - returns null for non-existent asset", async () => {
        const result = await client.assetById(NONEXISTENT_ID);
        assert.strictEqual(result, null);
      });

      it("GET /api/assets/{id} - fetches asset by ID", async (t) => {
        const assetId = discovered.assetIds[0];
        if (!assetId) {
          t.skip("no assets referenced by pages");
          return;
        }
        const result = await client.assetById(assetId);
        assertPlainObject(result, `assetById(${assetId})`);
        assert.strictEqual(result["_id"], assetId);
        assert.strictEqual(typeof result["path"], "string");
      });

      it("GET /api/assets/image/{id} - rejects with 400 for non-existent asset", async () => {
        // Cockpit answers 400 "Asset not found" (not 404) here, so the
        // client throws instead of returning null.
        await assert.rejects(
          client.imageAssetById(NONEXISTENT_ID, { w: 100 }),
          /\(400\)/,
        );
      });

      it("GET /api/assets/image/{id} - returns a URL for an image asset", async (t) => {
        const assetId = discovered.imageAssetIds[0];
        if (!assetId) {
          t.skip("no image assets referenced by pages");
          return;
        }
        const result = await client.imageAssetById(assetId, {
          w: 200,
          h: 200,
          q: 80,
        });
        assert.strictEqual(typeof result, "string");
        assert.match(result ?? "", /^https?:\/\//);
      });
    });

    describe("Search API (Detektivo)", () => {
      it("GET /api/detektivo/search/{index} - returns an object", async (t) => {
        if (!TEST_SEARCH_INDEX) {
          t.skip("COCKPIT_TEST_SEARCH_INDEX not set");
          return;
        }
        const result = await client.search({
          index: TEST_SEARCH_INDEX,
          q: "test",
          limit: 5,
        });
        if (result === null) {
          t.skip("Detektivo addon not installed (404)");
          return;
        }
        assertPlainObject(result, "search result");
      });
    });

    describe("Localization API (Lokalize)", () => {
      it("GET /api/lokalize/project/{name} - returns an object", async (t) => {
        if (!TEST_LOKALIZE_PROJECT) {
          t.skip("COCKPIT_TEST_LOKALIZE_PROJECT not set");
          return;
        }
        const result = await client.localize(TEST_LOKALIZE_PROJECT, {
          nested: true,
        });
        if (result === null) {
          t.skip("Lokalize addon or project not found (404)");
          return;
        }
        assertPlainObject(result, "localize result");
      });
    });

    describe("resolvePageLinks (pages:// link resolution)", () => {
      it("resolves pages:// links and serves the repeat call from cache", async (t) => {
        const rawClient = await CockpitAPI(clientOptions({ cache: false }));
        const published = await rawClient.pages({
          fields: { _id: 1, _r: 1 },
          filter: { _state: 1 },
        });
        const routeMap: Record<string, string> = Object.fromEntries(
          (published?.data ?? []).flatMap((page) =>
            typeof page._r === "string"
              ? [[`pages://${page._id}`, page._r] as const]
              : [],
          ),
        );
        const linkKeys = Object.keys(routeMap);
        if (linkKeys.length === 0) {
          t.skip("instance has no routed pages");
          return;
        }

        // Find a page whose raw (unresolved) response links to another page.
        let target: { id: string; links: string[] } | undefined;
        for (const page of discovered.pages.slice(0, 20)) {
          const raw = JSON.stringify(await rawClient.pageById(page.id));
          const links = linkKeys.filter((key) => raw.includes(`"${key}"`));
          if (links.length > 0) {
            target = { id: page.id, links };
            break;
          }
        }
        if (!target) {
          t.skip("no page containing pages:// links found");
          return;
        }

        const resolving = await CockpitAPI(
          clientOptions({ resolvePageLinks: true }),
        );

        const first = await countFetches(() => resolving.pageById(target.id));
        assert.ok(first.urls.length >= 1, "first call should hit the server");
        const resolved = JSON.stringify(first.result);
        for (const link of target.links) {
          assert.ok(
            !resolved.includes(`"${link}"`),
            `${link} should be resolved`,
          );
          assert.ok(
            resolved.includes(JSON.stringify(routeMap[link])),
            `${link} should be replaced by its route ${String(routeMap[link])}`,
          );
        }

        const second = await countFetches(() => resolving.pageById(target.id));
        assert.deepStrictEqual(
          second.urls,
          [],
          "repeat call should be served from cache",
        );
        assert.deepStrictEqual(second.result, first.result);
      });
    });

    describe("Lightweight Fetch Client", () => {
      let fetchClient: FetchClient;

      before(() => {
        fetchClient = createFetchClient(fetchClientOptions());
      });

      it("pages() returns { data } with _id on every page", async () => {
        const response = await fetchClient.pages();
        assertPageList(response, "fetchClient.pages()");
      });

      it("pages() respects limit", async () => {
        const response = await fetchClient.pages({ limit: 2 });
        assertPageList(response, "fetchClient.pages({ limit: 2 })");
        assert.ok(response.data.length <= 2, "should respect limit");
      });

      it("pageByRoute returns null for non-existent route", async () => {
        const result = await fetchClient.pageByRoute(
          "/nonexistent-route-xyz-12345",
        );
        assert.strictEqual(result, null);
      });

      it("pageByRoute fetches the page for a route", async (t) => {
        const page = discovered.pages.find((p) => p.route);
        if (!page?.route) {
          t.skip("no routed pages on the instance");
          return;
        }
        const result = await fetchClient.pageByRoute(page.route);
        assertPlainObject(result, `fetchClient.pageByRoute(${page.route})`);
        assert.strictEqual(result["_id"], page.id);
      });

      it("pageById returns null for non-existent page", async () => {
        const result = await fetchClient.pageById(NONEXISTENT_ID);
        assert.strictEqual(result, null);
      });

      it("pageById fetches page by ID", async (t) => {
        const page = discovered.pages[0];
        if (!page) {
          t.skip("no pages on the instance");
          return;
        }
        const result = await fetchClient.pageById(page.id);
        assertPlainObject(result, "fetchClient.pageById result");
        assert.strictEqual(result["_id"], page.id);
      });

      it("getContentItems returns null for non-existent model", async () => {
        const response = await fetchClient.getContentItems(
          "nonexistent_model_xyz_12345",
        );
        assert.strictEqual(response, null);
      });

      it("getContentItem returns null for non-existent item", async () => {
        const result = await fetchClient.getContentItem(
          "nonexistent_model",
          NONEXISTENT_ID,
        );
        assert.strictEqual(result, null);
      });

      it("fetchRaw fetches custom paths", async () => {
        const result = await fetchClient.fetchRaw("/pages/settings");
        assertPlainObject(result, "fetchRaw(/pages/settings)");
      });
    });

    describe(
      "Multi-Tenant API",
      { skip: !TEST_TENANT && "COCKPIT_TEST_TENANT not set" },
      () => {
        const tenant = TEST_TENANT ?? "";
        let tenantClient: CockpitAPIClient;
        let tenantFetchClient: FetchClient;
        let tenantPages: DiscoveredPage[] = [];
        let tenantMenuNames: string[] = [];

        before(async () => {
          tenantClient = await CockpitAPI(clientOptions({ tenant }));
          tenantFetchClient = createFetchClient(fetchClientOptions({ tenant }));

          const response = await tenantClient.pages<PageSummary>();
          tenantPages = toPages(response?.data ?? []);
          const menus = await tenantClient.pagesMenus<{ name?: string }>();
          tenantMenuNames = (menus ?? [])
            .map((m) => m.name)
            .filter((n): n is string => typeof n === "string" && n !== "");
        });

        it("fetches tenant pages list", async () => {
          const response = await tenantClient.pages();
          assertPageList(response, "tenant pages()");
        });

        it("fetches tenant page by ID", async (t) => {
          const page = tenantPages[0];
          if (!page) {
            t.skip("tenant has no pages");
            return;
          }
          const result = await tenantClient.pageById(page.id);
          assertPlainObject(result, "tenant pageById result");
          assert.strictEqual(result["_id"], page.id);
        });

        it("fetches tenant page by route", async (t) => {
          const page = tenantPages.find((p) => p.route);
          if (!page?.route) {
            t.skip("tenant has no routed pages");
            return;
          }
          const result = await tenantClient.pageByRoute(page.route);
          assertPlainObject(result, `tenant pageByRoute(${page.route})`);
          assert.strictEqual(result["_id"], page.id);
        });

        it("fetches tenant settings", async () => {
          const result = await tenantClient.pagesSetting();
          assertPlainObject(result, "tenant pagesSetting result");
        });

        it("fetches tenant routes", async () => {
          const result = await tenantClient.pagesRoutes();
          assertPlainObject(result, "tenant pagesRoutes result");
        });

        it("fetches tenant sitemap", async () => {
          const result = await tenantClient.pagesSitemap();
          assert.ok(Array.isArray(result), "sitemap should be an array");
        });

        it("fetches tenant menus", async () => {
          const result = await tenantClient.pagesMenus();
          assert.ok(Array.isArray(result), "menus should be an array");
        });

        it("fetches tenant menu by name", async (t) => {
          const menuName = tenantMenuNames[0];
          if (!menuName) {
            t.skip("tenant has no menus");
            return;
          }
          const result = await tenantClient.pagesMenu(menuName);
          assertPlainObject(result, `tenant pagesMenu(${menuName})`);
          assert.strictEqual(result["name"], menuName);
        });

        it("fetch client: fetches tenant pages", async () => {
          const response = await tenantFetchClient.pages();
          assertPageList(response, "tenant fetchClient.pages()");
        });

        it("fetch client: fetches tenant page by route", async (t) => {
          const page = tenantPages.find((p) => p.route);
          if (!page?.route) {
            t.skip("tenant has no routed pages");
            return;
          }
          const result = await tenantFetchClient.pageByRoute(page.route);
          assertPlainObject(result, "tenant fetchClient.pageByRoute result");
          assert.strictEqual(result["_id"], page.id);
        });

        it("fetch client: fetches tenant settings via fetchRaw", async () => {
          const result = await tenantFetchClient.fetchRaw("/pages/settings");
          assertPlainObject(result, "tenant fetchRaw(/pages/settings)");
        });

        it("tenant client requests the tenant-scoped API path", async () => {
          const isTenantUrl = (url: string): boolean =>
            new URL(url).pathname.startsWith(`/:${tenant}/api/`);

          const viaClient = await countFetches(() =>
            tenantClient.pages({ limit: 1, skip: 0 }),
          );
          assert.ok(viaClient.urls.length > 0, "should hit the server");
          assert.ok(
            viaClient.urls.every(isTenantUrl),
            `all requests should be tenant-scoped: ${viaClient.urls.join(", ")}`,
          );

          const viaDefault = await countFetches(() =>
            client.pages({ limit: 1, skip: 0 }),
          );
          assert.ok(
            !viaDefault.urls.some(isTenantUrl),
            "default client should not use the tenant path",
          );
        });
      },
    );
  },
);
