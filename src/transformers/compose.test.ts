import { describe, it } from "node:test";
import assert from "node:assert";
import { composeTransformers } from "./compose.ts";
import type { ResponseTransformer } from "./image-path.ts";

describe("composeTransformers", () => {
  const addOneTransformer: ResponseTransformer = {
    transform: <T>(data: T) => {
      if (typeof data === "number") {
        return (data + 1) as T;
      }
      if (typeof data === "object" && data !== null && "value" in data) {
        return { ...data, value: (data as { value: number }).value + 1 } as T;
      }
      return data;
    },
  };

  const doubleTransformer: ResponseTransformer = {
    transform: <T>(data: T) => {
      if (typeof data === "number") {
        return (data * 2) as T;
      }
      if (typeof data === "object" && data !== null && "value" in data) {
        return { ...data, value: (data as { value: number }).value * 2 } as T;
      }
      return data;
    },
  };

  const uppercaseTransformer: ResponseTransformer = {
    transform: <T>(data: T) => {
      if (typeof data === "string") {
        return data.toUpperCase() as T;
      }
      if (typeof data === "object" && data !== null && "name" in data) {
        return {
          ...data,
          name: ((data as { name: string }).name as string).toUpperCase(),
        } as T;
      }
      return data;
    },
  };

  it("returns identity transformer when no transformers provided", () => {
    const composed = composeTransformers();
    const input = { foo: "bar", value: 42 };

    const result = composed.transform(input);

    assert.deepStrictEqual(result, input);
  });

  it("applies single transformer", () => {
    const composed = composeTransformers(doubleTransformer);

    const result = composed.transform({ value: 5 });

    assert.deepStrictEqual(result, { value: 10 });
  });

  it("applies multiple transformers left to right", () => {
    // addOne first (5 + 1 = 6), then double (6 * 2 = 12)
    const composed = composeTransformers(addOneTransformer, doubleTransformer);

    const result = composed.transform({ value: 5 });

    assert.deepStrictEqual(result, { value: 12 });
  });

  it("order matters - different order gives different result", () => {
    // double first (5 * 2 = 10), then addOne (10 + 1 = 11)
    const composed = composeTransformers(doubleTransformer, addOneTransformer);

    const result = composed.transform({ value: 5 });

    assert.deepStrictEqual(result, { value: 11 });
  });

  it("composes three or more transformers", () => {
    // addOne (5 + 1 = 6), double (6 * 2 = 12), addOne (12 + 1 = 13)
    const composed = composeTransformers(
      addOneTransformer,
      doubleTransformer,
      addOneTransformer,
    );

    const result = composed.transform({ value: 5 });

    assert.deepStrictEqual(result, { value: 13 });
  });

  it("handles different data types", () => {
    const composed = composeTransformers(uppercaseTransformer);

    const result = composed.transform({ name: "hello" });

    assert.deepStrictEqual(result, { name: "HELLO" });
  });

  it("preserves data when transformer does not match", () => {
    // numeric transformers don't affect string data
    const composed = composeTransformers(addOneTransformer, doubleTransformer);

    const result = composed.transform({ name: "unchanged" });

    assert.deepStrictEqual(result, { name: "unchanged" });
  });

  it("works with primitive values", () => {
    const composed = composeTransformers(addOneTransformer, doubleTransformer);

    const result = composed.transform(5);

    // (5 + 1) * 2 = 12
    assert.strictEqual(result, 12);
  });

  it("handles null and undefined gracefully", () => {
    const composed = composeTransformers(addOneTransformer);

    assert.strictEqual(composed.transform(null), null);
    assert.strictEqual(composed.transform(undefined), undefined);
  });

  it("handles arrays", () => {
    const arrayTransformer: ResponseTransformer = {
      transform: <T>(data: T) => {
        if (Array.isArray(data)) {
          return data.map((item) => (typeof item === "number" ? item * 2 : item)) as T;
        }
        return data;
      },
    };

    const composed = composeTransformers(arrayTransformer);

    const result = composed.transform([1, 2, 3]);

    assert.deepStrictEqual(result, [2, 4, 6]);
  });
});
