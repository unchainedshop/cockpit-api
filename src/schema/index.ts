/**
 * GraphQL schema stitching for Cockpit CMS (requires `@graphql-tools/wrap`)
 *
 * @example
 * ```typescript
 * const cockpitSchema = await makeCockpitGraphQLSchema({ tenantHeader: "x-cockpit-space" });
 * const gatewaySchema = stitchSchemas({ subschemas: [{ schema: cockpitSchema }] });
 * ```
 */
export { makeCockpitGraphQLSchema } from "./schema-builder.ts";
export {
  createRemoteExecutor,
  type MakeCockpitSchemaOptions,
  type CockpitExecutorContext,
  type ExecutorRequest,
  type RemoteExecutor,
} from "./executor.ts";
