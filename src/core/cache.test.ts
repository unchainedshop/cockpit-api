import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createCacheManager,
  createNoOpCacheManager,
  type AsyncCacheStore,
} from "./cache.ts";

describe("createCacheManager", () => {
  it("creates cache with default options when none provided", async () => {
    // Test with no options object at all
    const cache = createCacheManager("test:");
    await cache.set("key", "value");
    assert.strictEqual(await cache.get("key"), "value");
    await cache.clear();
    assert.strictEqual(await cache.get("key"), undefined);
  });

  it("stores and retrieves values with prefix (async)", async () => {
    const cache = createCacheManager("test:prefix:");
    await cache.set("key1", { data: "value1" });

    const result = (await cache.get("key1")) as { data: string } | undefined;
    assert.deepStrictEqual(result, { data: "value1" });
  });

  it("returns undefined for missing keys (async)", async () => {
    const cache = createCacheManager("test:prefix:");
    const result = await cache.get("nonexistent");
    assert.strictEqual(result, undefined);
  });

  it("clears all entries without pattern (async)", async () => {
    const cache = createCacheManager("test:prefix:");
    await cache.set("key1", "value1");
    await cache.set("key2", "value2");
    await cache.set("key3", "value3");

    // Call clear with undefined pattern explicitly to cover that branch
    await cache.clear(undefined);

    assert.strictEqual(await cache.get("key1"), undefined);
    assert.strictEqual(await cache.get("key2"), undefined);
    assert.strictEqual(await cache.get("key3"), undefined);
  });

  it("clears entries matching pattern (async)", async () => {
    const cache = createCacheManager("test:prefix:");
    await cache.set("ROUTE_key1", "value1");
    await cache.set("ROUTE_key2", "value2");
    await cache.set("OTHER_key3", "value3");

    await cache.clear("ROUTE");

    assert.strictEqual(await cache.get("ROUTE_key1"), undefined);
    assert.strictEqual(await cache.get("ROUTE_key2"), undefined);
    assert.strictEqual(await cache.get("OTHER_key3"), "value3");
  });

  it("clears with pattern that matches no entries", async () => {
    const cache = createCacheManager("test:prefix:");
    await cache.set("key1", "value1");
    await cache.set("key2", "value2");

    // Clear with pattern that doesn't match anything
    await cache.clear("NONEXISTENT");

    // All entries should still exist
    assert.strictEqual(await cache.get("key1"), "value1");
    assert.strictEqual(await cache.get("key2"), "value2");
  });

  it("clears empty cache without error", async () => {
    const cache = createCacheManager("test:prefix:");

    // Clear empty cache with no pattern
    await cache.clear();

    // Clear empty cache with pattern
    await cache.clear("PATTERN");

    assert.ok(true); // Should not throw
  });

  it("uses custom max and ttl options with default LRU store", async () => {
    const cache = createCacheManager("test:", { max: 2, ttl: 1000 });
    await cache.set("key1", "value1");
    await cache.set("key2", "value2");
    await cache.set("key3", "value3"); // Should evict key1

    // key3 should exist, key1 may have been evicted
    assert.strictEqual(await cache.get("key3"), "value3");
  });

  it("clears all entries using default LRU store clear method", async () => {
    // This test specifically ensures the LRU cache.clear() call is executed
    const cache = createCacheManager("test:lru:");
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("c", 3);
    await cache.set("d", 4);
    await cache.set("e", 5);

    // Verify entries exist
    assert.strictEqual(await cache.get("a"), 1);
    assert.strictEqual(await cache.get("c"), 3);

    // Clear without pattern - should trigger LRU cache.clear()
    await cache.clear();

    // Verify all entries are gone
    assert.strictEqual(await cache.get("a"), undefined);
    assert.strictEqual(await cache.get("b"), undefined);
    assert.strictEqual(await cache.get("c"), undefined);
    assert.strictEqual(await cache.get("d"), undefined);
    assert.strictEqual(await cache.get("e"), undefined);
  });

  it("works with custom async store", async () => {
    // Create a simple in-memory async store
    const store = new Map<string, unknown>();
    const customStore: AsyncCacheStore = {
      async get(key: string) {
        return store.get(key);
      },
      async set(key: string, value: unknown) {
        store.set(key, value);
      },
      async clear(pattern?: string) {
        if (pattern) {
          for (const key of store.keys()) {
            if (key.startsWith(pattern)) {
              store.delete(key);
            }
          }
        } else {
          store.clear();
        }
      },
    };

    const cache = createCacheManager("custom:", { store: customStore });

    await cache.set("test", { foo: "bar" });
    const result = await cache.get("test");
    assert.deepStrictEqual(result, { foo: "bar" });

    // Verify it's using the custom store (check the prefixed key)
    assert.ok(store.has("custom:test"));
  });

  it("custom store ignores max and ttl options", async () => {
    const store = new Map<string, unknown>();
    const customStore: AsyncCacheStore = {
      async get(key: string) {
        return store.get(key);
      },
      async set(key: string, value: unknown) {
        store.set(key, value);
      },
      async clear() {
        store.clear();
      },
    };

    // These options should be ignored when custom store is provided
    const cache = createCacheManager("test:", {
      max: 1,
      ttl: 100,
      store: customStore,
    });

    // Should be able to store more than max=1 because custom store is used
    await cache.set("key1", "value1");
    await cache.set("key2", "value2");
    await cache.set("key3", "value3");

    assert.strictEqual(await cache.get("key1"), "value1");
    assert.strictEqual(await cache.get("key2"), "value2");
    assert.strictEqual(await cache.get("key3"), "value3");
  });

  it("custom store clear handles pattern correctly", async () => {
    const store = new Map<string, unknown>();
    let lastClearPattern: string | undefined;

    const customStore: AsyncCacheStore = {
      async get(key: string) {
        return store.get(key);
      },
      async set(key: string, value: unknown) {
        store.set(key, value);
      },
      async clear(pattern?: string) {
        lastClearPattern = pattern;
        if (pattern) {
          for (const key of store.keys()) {
            if (key.startsWith(pattern)) {
              store.delete(key);
            }
          }
        } else {
          store.clear();
        }
      },
    };

    const cache = createCacheManager("prefix:", { store: customStore });

    // Test clear with no pattern (should pass "prefix:" to store)
    await cache.clear();
    assert.strictEqual(lastClearPattern, "prefix:");

    // Reset and test clear with pattern (should pass "prefix:ROUTE" to store)
    await cache.set("ROUTE_1", "val1");
    await cache.set("OTHER_1", "val2");
    await cache.clear("ROUTE");
    assert.strictEqual(lastClearPattern, "prefix:ROUTE");
  });

  it("handles async store errors gracefully", async () => {
    const errorStore: AsyncCacheStore = {
      async get() {
        throw new Error("Store error");
      },
      async set() {
        throw new Error("Store error");
      },
      async clear() {
        throw new Error("Store error");
      },
    };

    const cache = createCacheManager("error:", { store: errorStore });

    // Errors should propagate to caller
    await assert.rejects(() => cache.get("key"), { message: "Store error" });

    await assert.rejects(() => cache.set("key", "value"), {
      message: "Store error",
    });

    await assert.rejects(() => cache.clear(), { message: "Store error" });
  });
});

describe("createNoOpCacheManager", () => {
  it("returns undefined for all get operations", async () => {
    const cache = createNoOpCacheManager();
    await cache.set("key", "value");

    const result = await cache.get("key");
    assert.strictEqual(result, undefined);
  });

  it("ignores set operations", async () => {
    const cache = createNoOpCacheManager();
    await cache.set("key1", "value1");
    await cache.set("key2", { data: "value2" });

    // Should not throw and should return undefined
    assert.strictEqual(await cache.get("key1"), undefined);
    assert.strictEqual(await cache.get("key2"), undefined);
  });

  it("ignores clear operations", async () => {
    const cache = createNoOpCacheManager();
    await cache.set("key", "value");
    await cache.clear();
    await cache.clear("PATTERN");

    // Should not throw
    assert.ok(true);
  });
});

describe("cache prefix handling", () => {
  it("isolates cache entries by prefix", async () => {
    const cache1 = createCacheManager("prefix1:");
    const cache2 = createCacheManager("prefix2:");

    await cache1.set("key", "value1");
    await cache2.set("key", "value2");

    assert.strictEqual(await cache1.get("key"), "value1");
    assert.strictEqual(await cache2.get("key"), "value2");
  });

  it("clears only entries with matching prefix", async () => {
    const cache1 = createCacheManager("prefix1:");
    const cache2 = createCacheManager("prefix2:");

    await cache1.set("key", "value1");
    await cache2.set("key", "value2");

    await cache1.clear();

    assert.strictEqual(await cache1.get("key"), undefined);
    assert.strictEqual(await cache2.get("key"), "value2");
  });
});
