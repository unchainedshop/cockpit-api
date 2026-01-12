/**
 * GraphQL schema builder for Cockpit CMS schema stitching
 */

import type { GraphQLSchema } from "graphql";
import type { MakeCockpitSchemaOptions } from "./types.ts";
import { createRemoteExecutor } from "./executor.ts";

/**
 * Interface for the @graphql-tools/wrap module (for type safety without requiring the dep)
 */
interface GraphQLToolsWrapModule {
  schemaFromExecutor: (executor: unknown) => Promise<GraphQLSchema>;
  wrapSchema: (config: {
    schema: GraphQLSchema;
    executor: unknown;
    transforms?: unknown[];
  }) => GraphQLSchema;
  FilterRootFields: new (
    filter: (operationName: string, fieldName: string) => boolean
  ) => unknown;
}

/**
 * Creates a GraphQL schema from Cockpit's introspected schema for schema stitching
 *
 * Requires `@graphql-tools/wrap` as a peer dependency.
 *
 * @example
 * ```typescript
 * import { makeCockpitGraphQLSchema } from "@unchainedshop/cockpit-api/schema";
 *
 * // Basic usage - creates read-only schema with tenant header support
 * const schema = await makeCockpitGraphQLSchema();
 *
 * // Custom configuration
 * const schema = await makeCockpitGraphQLSchema({
 *   tenantHeader: "x-cockpit-space",
 *   filterMutations: true,
 *   cockpitOptions: {
 *     endpoint: "https://cms.example.com/api/graphql",
 *   },
 * });
 *
 * // Use with schema stitching
 * import { stitchSchemas } from "@graphql-tools/stitch";
 *
 * const gatewaySchema = stitchSchemas({
 *   subschemas: [
 *     { schema: await makeCockpitGraphQLSchema() },
 *     // ... other subschemas
 *   ],
 * });
 * ```
 *
 * @param options - Configuration options
 * @returns Promise resolving to the GraphQL schema
 * @throws Error if @graphql-tools/wrap is not installed
 */
export async function makeCockpitGraphQLSchema(
  options: MakeCockpitSchemaOptions = {}
): Promise<GraphQLSchema> {
  // Dynamic import to handle optional peer dependency
  let wrapModule: GraphQLToolsWrapModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wrapModule = await import("@graphql-tools/wrap" as string) as GraphQLToolsWrapModule;
  } catch {
    throw new Error(
      "Cockpit: @graphql-tools/wrap is required for schema stitching. " +
        "Install it with: npm install @graphql-tools/wrap"
    );
  }

  const { schemaFromExecutor, wrapSchema, FilterRootFields } = wrapModule;
  const { filterMutations = true, transforms = [] } = options;

  const executor = createRemoteExecutor(options);

  // Build the list of transforms
  const allTransforms: unknown[] = [];

  // Add mutation filter if enabled (default)
  if (filterMutations) {
    allTransforms.push(
      new FilterRootFields((operationName: string) => operationName !== "Mutation")
    );
  }

  // Add user-provided transforms
  allTransforms.push(...transforms);

  // Introspect and wrap the schema
  const introspectedSchema = await schemaFromExecutor(executor);

  return wrapSchema({
    schema: introspectedSchema,
    executor,
    transforms: allTransforms,
  });
}
