/**
 * GraphQL Schema Stitching utilities for Cockpit CMS
 *
 * This module requires `@graphql-tools/wrap` as a peer dependency.
 * Install it with: npm install @graphql-tools/wrap
 *
 * @example
 * ```typescript
 * import { makeCockpitGraphQLSchema } from "@unchainedshop/cockpit-api/schema";
 *
 * // Create a stitchable schema from Cockpit
 * const cockpitSchema = await makeCockpitGraphQLSchema({
 *   tenantHeader: "x-cockpit-space",  // Header for multi-tenant support
 *   filterMutations: true,             // Read-only by default
 * });
 *
 * // Use with @graphql-tools/stitch
 * import { stitchSchemas } from "@graphql-tools/stitch";
 *
 * const gatewaySchema = stitchSchemas({
 *   subschemas: [{ schema: cockpitSchema }],
 * });
 * ```
 */

export { makeCockpitGraphQLSchema } from "./schema-builder.ts";
export { createRemoteExecutor } from "./executor.ts";
export type {
  MakeCockpitSchemaOptions,
  CockpitExecutorContext,
  ExecutorRequest,
  RemoteExecutor,
} from "./types.ts";
