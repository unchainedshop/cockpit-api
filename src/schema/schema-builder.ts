/**
 * GraphQL schema builder for Cockpit CMS schema stitching
 */

import { buildClientSchema, GraphQLSchema } from "graphql";
import {
  createRemoteExecutor,
  type MakeCockpitSchemaOptions,
} from "./executor.ts";

/** The parts of `@graphql-tools/wrap` used here (optional peer dependency) */
interface GraphQLToolsWrapModule {
  schemaFromExecutor: (executor: unknown) => Promise<GraphQLSchema>;
  wrapSchema: (config: {
    schema: GraphQLSchema;
    executor: unknown;
    transforms?: unknown[];
  }) => GraphQLSchema;
}

/**
 * Drops the Mutation root type (filtering its fields would leave an invalid,
 * empty `type Mutation`)
 */
function withoutMutations(schema: GraphQLSchema): GraphQLSchema {
  const mutationType = schema.getMutationType();
  if (!mutationType) return schema;
  const config = schema.toConfig();
  return new GraphQLSchema({
    ...config,
    mutation: null,
    types: config.types.filter((type) => type !== mutationType),
  });
}

/**
 * Stitchable GraphQL schema of Cockpit, read-only by default (see
 * `filterMutations`). Requires the `@graphql-tools/wrap` peer dependency.
 *
 * @example
 * ```typescript
 * const schema = await makeCockpitGraphQLSchema({
 *   allowedTenants: ["mytenant"],
 *   cockpitOptions: { endpoint: "https://cms.example.com/api/graphql" },
 * });
 * const gateway = stitchSchemas({ subschemas: [{ schema }] });
 * ```
 */
export async function makeCockpitGraphQLSchema(
  options: MakeCockpitSchemaOptions = {},
): Promise<GraphQLSchema> {
  let wrapModule: GraphQLToolsWrapModule;
  try {
    wrapModule =
      (await import("@graphql-tools/wrap")) as GraphQLToolsWrapModule;
  } catch {
    throw new Error(
      "Cockpit: @graphql-tools/wrap is required for schema stitching. " +
        "Install it with: npm install @graphql-tools/wrap",
    );
  }

  const { schemaFromExecutor, wrapSchema } = wrapModule;
  const { filterMutations = true, transforms = [], introspection } = options;

  // The executor enforces read-only mode too (operations bypassing the schema)
  const executor = createRemoteExecutor({ ...options, filterMutations });

  const introspectedSchema = introspection
    ? buildClientSchema(introspection)
    : await schemaFromExecutor(executor);

  // User transforms already see the read-only schema
  return wrapSchema({
    schema: filterMutations
      ? withoutMutations(introspectedSchema)
      : introspectedSchema,
    executor,
    transforms,
  });
}
