import { describe, it, mock, type TestContext } from "node:test";
import assert from "node:assert";
import {
  createCacheManager,
  createLRUCacheStore,
  createNoOpCacheManager,
  DEFAULT_SWR_FRESH_MS,
  DEFAULT_SWR_STALE_MS,
  hashOpts,
  type AsyncCacheStore,
} from "./cache.ts";
import { logger } from "../cockpit-logger.ts";
import { CockpitHttpError, createHttpClient } from "./http.ts";
import { createConfig } from "./config.ts";

const T0 = 1_000_000;
const flush = () => new Promise<void>((r) => setImmediate(r));

/** Plain Map-backed store (shares references) so tests can inspect raw entries */
const createMapStore = () => {
  const map = new Map<string, unknown>();
  const clears: (string | undefined)[] = [];
  const store: AsyncCacheStore = {
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value);
    },
    clear: async (pattern) => {
      clears.push(pattern);
      for (const key of map.keys()) {
        if (pattern === undefined || key.startsWith(pattern)) map.delete(key);
      }
    },
  };
  return { map, store, clears };
};

/** Fetcher whose pending promise is settled manually from the test */
const deferredFetcher = <T>() => {
  const state = { calls: 0, resolve: (_v: T) => {}, reject: (_e: unknown) => {} };
  const fetcher = () => {
    state.calls += 1;
    return new Promise<T>((resolve, reject) => {
      state.resolve = resolve;
      state.reject = reject;
    });
  };
  return { state, fetcher };
};

const counting = <T>(produce: (calls: number) => T) => {
  let calls = 0;
  const fetcher = async () => produce(++calls);
  return { fetcher, calls: () => calls };
};

const staleEnvelope = (data: unknown, staleFor = 60_000) => ({
  data,
  freshUntil: T0 - 1000,
  staleUntil: T0 + staleFor,
});

describe("createCacheManager get/set/clear", () => {
  for (const kind of ["built-in", "custom"] as const) {
    const make = (prefix: string) =>
      kind === "built-in" ? createCacheManager(prefix) : createCacheManager(prefix, { store: createMapStore().store });

    it(`stores, prefixes and clears by pattern (${kind} store)`, async () => {
      const cache = make("test:");
      await cache.set("ROUTE_1", "a");
      await cache.set("ROUTE_2", { v: "b" });
      await cache.set("OTHER", "c");
      assert.deepStrictEqual(await cache.get("ROUTE_2"), { v: "b" });
      assert.strictEqual(await cache.get("missing"), undefined);

      await cache.clear("NONE");
      await cache.clear("ROUTE");
      assert.strictEqual(await cache.get("ROUTE_1"), undefined);
      assert.strictEqual(await cache.get("OTHER"), "c");
      await cache.clear();
      assert.strictEqual(await cache.get("OTHER"), undefined);
    });
  }

  it("passes prefixed keys and patterns to a custom store", async () => {
    const { map, store, clears } = createMapStore();
    const cache = createCacheManager("prefix:", { store, max: 1 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    assert.deepStrictEqual([...map.keys()], ["prefix:a", "prefix:b"], "max is ignored with a custom store");
    await cache.clear();
    await cache.clear("ROUTE");
    assert.deepStrictEqual(clears, ["prefix:", "prefix:ROUTE"]);
  });

  it("isolates managers by prefix on a shared store", async () => {
    const store = createLRUCacheStore();
    const a = createCacheManager("a:", { store });
    const b = createCacheManager("b:", { store });
    await a.set("key", "A");
    await b.set("key", "B");
    await a.clear();
    assert.strictEqual(await a.get("key"), undefined);
    assert.strictEqual(await b.get("key"), "B");
  });

  it("evicts least recently used entries beyond max", async () => {
    const cache = createCacheManager("test:", { max: 2 });
    await cache.set("k1", "v1");
    await cache.set("k2", "v2");
    await cache.set("k3", "v3");
    assert.strictEqual(await cache.get("k1"), undefined);
    assert.strictEqual(await cache.get("k3"), "v3");
  });

  it("propagates store errors", async () => {
    const fail = async () => {
      throw new Error("Store error");
    };
    const cache = createCacheManager("error:", { store: { get: fail, set: fail, clear: fail } });
    await assert.rejects(() => cache.get("key"), { message: "Store error" });
    await assert.rejects(() => cache.set("key", "value"), { message: "Store error" });
    await assert.rejects(() => cache.clear(), { message: "Store error" });
    await assert.rejects(() => cache.swr("key", async () => 1), { message: "Store error" });
  });
});

describe("createNoOpCacheManager", () => {
  it("stores nothing and always fetches", async () => {
    const cache = createNoOpCacheManager();
    await cache.set("key", "value");
    await cache.clear("PATTERN");
    assert.strictEqual(await cache.get("key"), undefined);
    const { fetcher, calls } = counting((n) => ({ v: n }));
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: 1 });
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: 2 });
    assert.strictEqual(calls(), 2);
  });
});

describe("cache.swr", () => {
  it("fetches on a cold cache and serves fresh hits from the cache", async () => {
    const cache = createCacheManager("swr:");
    const { fetcher, calls } = counting(() => ({ v: "fresh" }));
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "fresh" });
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "fresh" });
    assert.strictEqual(calls(), 1);
  });

  it("writes envelopes with the default windows", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: T0 });
    const cache = createCacheManager("swr:");
    await cache.set("k", { data: { v: "old" }, freshUntil: T0 - 2000, staleUntil: T0 - 1000 });
    assert.deepStrictEqual(await cache.swr("k", async () => ({ v: "new" })), { v: "new" });
    assert.deepStrictEqual(await cache.get("k"), {
      data: { v: "new" },
      freshUntil: T0 + DEFAULT_SWR_FRESH_MS,
      staleUntil: T0 + DEFAULT_SWR_STALE_MS,
    });
  });

  it("does not cache null (404) and writes nothing on a cold 404", async () => {
    const { map, store } = createMapStore();
    const cache = createCacheManager("swr:", { store });
    const { fetcher, calls } = counting(() => null);
    assert.strictEqual(await cache.swr("k", fetcher), null);
    assert.strictEqual(await cache.swr("k", fetcher), null);
    assert.strictEqual(calls(), 2);
    assert.strictEqual(map.size, 0);
  });

  it("treats non-envelope values as a cold miss and replaces them", async () => {
    const cache = createCacheManager("swr:");
    await cache.set("obj", { v: "raw" });
    await cache.set("str", "raw");
    const { fetcher, calls } = counting(() => ({ v: "fetched" }));
    assert.deepStrictEqual(await cache.swr("obj", fetcher), { v: "fetched" });
    assert.deepStrictEqual(await cache.swr("str", fetcher), { v: "fetched" });
    assert.strictEqual(calls(), 2);
    assert.deepStrictEqual(((await cache.get("obj")) as { data: unknown }).data, { v: "fetched" });
  });

  it("dedupes concurrent cold callers (thundering herd)", async () => {
    const cache = createCacheManager("swr:");
    const { state, fetcher } = deferredFetcher<{ v: string }>();
    const pending = [cache.swr("hot", fetcher), cache.swr("hot", fetcher), cache.swr("hot", fetcher)];
    await flush();
    state.resolve({ v: "shared" });
    for (const r of await Promise.all(pending)) assert.deepStrictEqual(r, { v: "shared" });
    assert.strictEqual(state.calls, 1);
  });

  it("isolates in-flight fetches across managers", async () => {
    const a = deferredFetcher<string>();
    const b = deferredFetcher<string>();
    const pa = createCacheManager("A:").swr<string>("k", a.fetcher);
    const pb = createCacheManager("B:").swr<string>("k", b.fetcher);
    await flush();
    a.state.resolve("A");
    b.state.resolve("B");
    assert.deepStrictEqual([await pa, await pb], ["A", "B"]);
  });

  it("rethrows errors without data or past staleUntil, and retries next time", async () => {
    const cache = createCacheManager("swr:");
    await cache.set("expired", { data: { v: "stale" }, freshUntil: 0, staleUntil: 0 });
    let fail = true;
    const fetcher = async () => {
      if (fail) throw new Error("upstream down");
      return { v: "recovered" };
    };
    for (const key of ["cold", "expired"]) {
      await assert.rejects(() => cache.swr(key, fetcher), { message: "upstream down" });
    }
    fail = false;
    assert.deepStrictEqual(await cache.swr("cold", fetcher), { v: "recovered" });
  });

  it("serves stale immediately and revalidates once in the background", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: T0 });
    const cache = createCacheManager("swr:");
    await cache.set("k", staleEnvelope({ v: "old" }));
    const { state, fetcher } = deferredFetcher<{ v: string }>();

    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
    assert.strictEqual(state.calls, 1, "background revalidation must dedupe");

    state.resolve({ v: "new" });
    await flush();
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "new" });
    assert.strictEqual(state.calls, 1);
  });

  it("respects manager-level freshMs/staleMs", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: T0 });
    const cache = createCacheManager("swr:", { swr: { freshMs: 1000, staleMs: 5000 } });
    const { fetcher, calls } = counting((n) => ({ v: n }));

    await cache.swr("k", fetcher);
    t.mock.timers.tick(999);
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: 1 });
    assert.strictEqual(calls(), 1, "within freshMs");

    t.mock.timers.tick(1);
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: 1 }, "stale hit");
    await flush();
    assert.strictEqual(calls(), 2, "stale hit revalidates in the background");

    // Revalidated at T0+1000, so it expires at T0+6000
    t.mock.timers.tick(5000);
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: 3 }, "beyond staleMs blocks on a fetch");
  });

  it("keeps serving stale when the background refresh fails, without unhandled rejection", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: T0 });
    const warn = t.mock.method(logger, "warn", () => {});
    let unhandled: unknown;
    const onUnhandled = (reason: unknown) => {
      unhandled = reason;
    };
    process.once("unhandledRejection", onUnhandled);
    t.after(() => process.off("unhandledRejection", onUnhandled));

    const cache = createCacheManager("swr:");
    const envelope = staleEnvelope({ v: "old" });
    await cache.set("k", envelope);
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      throw new Error("upstream down");
    };

    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
    await flush();
    assert.strictEqual(unhandled, undefined);
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /background revalidate failed/);
    assert.deepStrictEqual(await cache.get("k"), envelope, "old envelope must survive");
    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
    assert.strictEqual(calls, 2, "in-flight entry released after the failure");
  });

  describe("callers joining a failing refresh get the error", () => {
    it("cold caller (entry evicted meanwhile)", async (t) => {
      t.mock.timers.enable({ apis: ["Date"], now: T0 });
      t.mock.method(logger, "warn", () => {});
      const { map, store } = createMapStore();
      const cache = createCacheManager("swr:", { store });
      await cache.set("k", staleEnvelope({ v: "old" }));
      const { state, fetcher } = deferredFetcher<{ v: string }>();

      assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
      map.delete("swr:k");
      const cold = cache.swr("k", fetcher);
      await flush();
      assert.strictEqual(state.calls, 1, "must join the in-flight refresh");
      state.reject(new Error("upstream down"));
      await assert.rejects(cold, { message: "upstream down" });
    });

    it("caller whose stale window elapsed meanwhile", async (t) => {
      t.mock.timers.enable({ apis: ["Date"], now: T0 });
      t.mock.method(logger, "warn", () => {});
      const cache = createCacheManager("swr:");
      await cache.set("k", staleEnvelope({ v: "old" }, 1000));
      const { state, fetcher } = deferredFetcher<{ v: string }>();

      assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
      t.mock.timers.tick(1000);
      const expired = cache.swr("k", fetcher);
      await flush();
      assert.strictEqual(state.calls, 1);
      state.reject(new Error("upstream down"));
      await assert.rejects(expired, { message: "upstream down" });
    });
  });

  it("clear() during a refresh prevents the write-back and is not joined", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: T0 });
    const cache = createCacheManager("swr:");
    await cache.set("k", staleEnvelope({ v: "old" }));
    const { state, fetcher } = deferredFetcher<{ v: string }>();

    assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
    const resolveFirst = state.resolve;
    await cache.clear();

    const after = cache.swr("k", fetcher);
    await flush();
    assert.strictEqual(state.calls, 2, "a cold caller after clear() starts its own fetch");

    resolveFirst({ v: "pre-clear" });
    await flush();
    assert.strictEqual(await cache.get("k"), undefined, "pre-clear result must not be written back");

    const joiner = cache.swr("k", fetcher);
    await flush();
    assert.strictEqual(state.calls, 2, "the settled pre-clear fetch must not evict the new in-flight entry");

    state.resolve({ v: "post-clear" });
    assert.deepStrictEqual(await after, { v: "post-clear" });
    assert.deepStrictEqual(await joiner, { v: "post-clear" });
    assert.deepStrictEqual(((await cache.get("k")) as { data: unknown }).data, { v: "post-clear" });
  });

  describe("404 expires cached data (tombstone)", () => {
    it("stale envelope: deleted data is never served again, not even on upstream failure", async (t) => {
      t.mock.timers.enable({ apis: ["Date"], now: T0 });
      const cache = createCacheManager("swr:");
      await cache.set("k", staleEnvelope({ v: "deleted upstream" }));
      const { state, fetcher } = deferredFetcher<{ v: string } | null>();

      assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "deleted upstream" });
      state.resolve(null);
      await flush();

      const nulls = counting(() => null);
      assert.strictEqual(await cache.swr("k", nulls.fetcher), null);
      assert.strictEqual(nulls.calls(), 1, "a 404 is not cached as fresh");
      await assert.rejects(
        () =>
          cache.swr("k", async () => {
            throw new Error("upstream down");
          }),
        { message: "upstream down" },
      );
    });

    it("refills a tombstoned key once upstream has data again", async () => {
      const cache = createCacheManager("swr:");
      await cache.set("k", { data: { v: "old" }, freshUntil: 0, staleUntil: 0 });
      await cache.swr("k", async () => null);
      assert.deepStrictEqual(await cache.swr("k", async () => ({ v: "back" })), { v: "back" });
      assert.deepStrictEqual(await cache.swr("k", async () => assert.fail("fresh hit expected")), { v: "back" });
    });
  });

  describe("background refresh errors by status", () => {
    const httpError = (status: number) => new CockpitHttpError(status, new URL("https://cms.example.com/api/x"));
    const setup = async (t: TestContext) => {
      t.mock.timers.enable({ apis: ["Date"], now: T0 });
      t.mock.method(logger, "warn", () => {});
      const cache = createCacheManager("bg:");
      await cache.set("k", staleEnvelope({ v: "old" }));
      return cache;
    };

    for (const status of [401, 403]) {
      it(`expires the entry on ${String(status)} (revoked credentials)`, async (t) => {
        const cache = await setup(t);
        const { fetcher, calls } = counting(() => {
          throw httpError(status);
        });
        assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
        await flush();
        await flush();
        await assert.rejects(() => cache.swr("k", fetcher), { status });
        assert.strictEqual(calls(), 2);
      });
    }

    for (const status of [400, 422, 429, 500, 503]) {
      it(`keeps serving stale on ${String(status)}`, async (t) => {
        const cache = await setup(t);
        const fetcher = async () => {
          throw httpError(status);
        };
        assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
        await flush();
        await flush();
        assert.deepStrictEqual(await cache.swr("k", fetcher), { v: "old" });
      });
    }
  });

  it("serves stale data when the revalidating request times out", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    t.mock.method(logger, "warn", () => undefined);
    let hang = false;
    globalThis.fetch = mock.fn<typeof fetch>((_input, init) => {
      if (!hang) return Promise.resolve(new Response(JSON.stringify({ v: 1 })));
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason as Error));
      });
    });
    const http = createHttpClient(createConfig({ endpoint: "https://cms.example.com/api/graphql", timeout: 20 }));
    const url = new URL("https://cms.example.com/api/pages/pages");
    const cache = createCacheManager("timeout:", { swr: { freshMs: 0, staleMs: 60_000 } });

    assert.deepStrictEqual(await cache.swr("k", () => http.fetch(url)), { v: 1 });
    hang = true;
    assert.deepStrictEqual(await cache.swr("k", () => http.fetch(url)), { v: 1 });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepStrictEqual(await cache.swr("k", () => http.fetch(url)), { v: 1 });
    await assert.rejects(() => cache.swr("other", () => http.fetch(url)), /Cockpit: request timed out after 20ms/);
  });
});

describe("cached values are private copies", () => {
  type Doc = { items: { title: string }[] };
  const doc = (): Doc => ({ items: [{ title: "original" }] });

  for (const kind of ["built-in", "custom (shared references)"] as const) {
    const make = () =>
      kind === "built-in" ? createCacheManager("iso:") : createCacheManager("iso:", { store: createMapStore().store });

    it(`mutating swr results never affects the next caller (${kind} store)`, async () => {
      const cache = make();
      const first = (await cache.swr<Doc>("k", async () => doc())) as Doc;
      first.items[0]!.title = "mutated";
      first.items.push({ title: "extra" });
      const second = (await cache.swr<Doc>("k", async () => assert.fail("should hit cache"))) as Doc;
      assert.deepStrictEqual(second, doc());
      second.items[0]!.title = "mutated again";
      assert.deepStrictEqual(await cache.swr<Doc>("k", async () => assert.fail("should hit cache")), doc());
    });

    it(`get/set do not share references (${kind} store)`, async () => {
      const cache = make();
      const value = doc();
      await cache.set("k", value);
      value.items[0]!.title = "mutated after set";
      const read = (await cache.get("k")) as Doc;
      assert.deepStrictEqual(read, doc());
      read.items[0]!.title = "mutated after get";
      assert.deepStrictEqual(await cache.get("k"), doc());
    });
  }

  it("concurrent callers joining one fetch get independent objects", async () => {
    const cache = createCacheManager("iso:");
    const { state, fetcher } = deferredFetcher<Doc>();
    const a = cache.swr<Doc>("k", fetcher);
    const b = cache.swr<Doc>("k", fetcher);
    await flush();
    state.resolve(doc());
    const [ra, rb] = (await Promise.all([a, b])) as [Doc, Doc];
    assert.notStrictEqual(ra, rb);
    ra.items[0]!.title = "mutated";
    assert.strictEqual(rb.items[0]!.title, "original");
  });
});

describe("hashOpts", () => {
  it("is independent of object key order (recursively), array order counts", () => {
    assert.strictEqual(
      hashOpts({ a: 1, b: { x: 1, y: [1, { p: 1, q: 2 }] } }),
      hashOpts({ b: { y: [1, { q: 2, p: 1 }], x: 1 }, a: 1 }),
    );
    assert.notStrictEqual(hashOpts({ a: [1, 2] }), hashOpts({ a: [2, 1] }));
  });

  it("distinguishes values and ignores undefined like JSON", () => {
    assert.notStrictEqual(hashOpts({ a: 1 }), hashOpts({ a: 2 }));
    assert.strictEqual(hashOpts({ a: 1, b: undefined }), hashOpts({ a: 1 }));
    assert.notStrictEqual(hashOpts({ a: null }), hashOpts({}));
  });
});
