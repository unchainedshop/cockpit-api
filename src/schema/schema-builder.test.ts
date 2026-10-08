import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import {
  buildSchema,
  graphql,
  introspectionFromSchema,
  validateSchema,
  type GraphQLSchema,
} from "graphql";
import { FilterRootFields } from "@graphql-tools/wrap";
import { createMockResponse, TEST_ENDPOINT } from "../__tests__/test-helpers.ts";
import { makeCockpitGraphQLSchema } from "./schema-builder.ts";

const introspection = introspectionFromSchema(
  buildSchema(`
    type Query {
      hello: String
      secret: String
    }
    type Mutation {
      saveItem(name: String): String
    }
  `),
);

const cockpitOptions = { endpoint: TEST_ENDPOINT, resolvePageLinks: false };

describe("makeCockpitGraphQLSchema", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn(async () =>
      createMockResponse({ body: { data: { hello: "world" } } })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("builds the schema from a provided introspection without fetching", async () => {
    const schema = await makeCockpitGraphQLSchema({ introspection, cockpitOptions });

    assert.ok(schema.getQueryType()?.getFields()["hello"]);
    assert.strictEqual(mockFetch.mock.calls.length, 0);
  });

  it("removes mutations by default", async () => {
    const schema = await makeCockpitGraphQLSchema({ introspection, cockpitOptions });

    assert.strictEqual(schema.getMutationType() ?? undefined, undefined);
    assert.strictEqual(schema.getType("Mutation"), undefined);
    // An empty `type Mutation` left behind would make the schema invalid
    assert.deepStrictEqual(validateSchema(schema), []);
  });

  it("keeps mutations with filterMutations: false", async () => {
    const schema = await makeCockpitGraphQLSchema({
      introspection,
      cockpitOptions,
      filterMutations: false,
    });

    assert.ok(schema.getMutationType()?.getFields()["saveItem"]);
    assert.deepStrictEqual(validateSchema(schema), []);
  });

  it("applies user transforms after the mutation filter", async () => {
    const seenSchemas: GraphQLSchema[] = [];
    const spy = {
      transformSchema(schema: GraphQLSchema) {
        seenSchemas.push(schema);
        return schema;
      },
    };
    const schema = await makeCockpitGraphQLSchema({
      introspection,
      cockpitOptions,
      transforms: [
        new FilterRootFields((_op: string, fieldName: string) => fieldName !== "secret"),
        spy,
      ],
    });

    assert.ok(schema.getQueryType()?.getFields()["hello"]);
    assert.strictEqual(schema.getQueryType()?.getFields()["secret"], undefined);
    assert.strictEqual(seenSchemas.length, 1);
    // The spy runs last, so it already sees the filtered schema
    assert.strictEqual(seenSchemas[0]!.getMutationType() ?? undefined, undefined);
    assert.strictEqual(seenSchemas[0]!.getQueryType()?.getFields()["secret"], undefined);
  });

  it("introspects Cockpit through the executor without a snapshot", async () => {
    mockFetch.mock.mockImplementation(async () =>
      createMockResponse({ body: { data: introspection } })
    );

    const schema = await makeCockpitGraphQLSchema({ cockpitOptions });

    assert.ok(schema.getQueryType()?.getFields()["hello"]);
    assert.strictEqual(schema.getMutationType() ?? undefined, undefined);
    assert.strictEqual(mockFetch.mock.calls.length, 1);
    const [url] = mockFetch.mock.calls[0]!.arguments as [string];
    assert.strictEqual(new URL(url).pathname, "/api/graphql");
  });

  it("delegates queries to Cockpit through the pooled executor", async () => {
    const schema = await makeCockpitGraphQLSchema({
      introspection,
      cockpitOptions,
      allowedTenants: ["acme"],
    });

    const result = await graphql({
      schema,
      source: "{ hello }",
      contextValue: { req: { headers: { "x-cockpit-space": "acme" } } },
    });

    assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { data: { hello: "world" } });
    const [url] = mockFetch.mock.calls[0]!.arguments as [string];
    assert.strictEqual(new URL(url).pathname, "/:acme/api/graphql");
  });

  it("answers requests for tenants outside the allowlist with an error, without fetching", async () => {
    const schema = await makeCockpitGraphQLSchema({
      introspection,
      cockpitOptions,
      allowedTenants: ["acme"],
    });

    const result = await graphql({
      schema,
      source: "{ hello }",
      contextValue: { req: { headers: { "x-cockpit-space": "other" } } },
    });

    assert.match(result.errors?.[0]?.message ?? "", /Unknown tenant/);
    assert.strictEqual(mockFetch.mock.calls.length, 0);
  });

  it("forwards mutations with filterMutations: false", async () => {
    mockFetch.mock.mockImplementation(async () =>
      createMockResponse({ body: { data: { saveItem: "saved" } } })
    );
    const schema = await makeCockpitGraphQLSchema({
      introspection,
      cockpitOptions,
      filterMutations: false,
    });

    const result = await graphql({ schema, source: 'mutation { saveItem(name: "x") }' });

    assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { data: { saveItem: "saved" } });
  });
});
