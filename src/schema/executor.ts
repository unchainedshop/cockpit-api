/**
 * Remote executor for Cockpit GraphQL schema stitching
 */

import { CockpitAPI } from "../client.ts";
import type {
  ExecutorRequest,
  RemoteExecutor,
  MakeCockpitSchemaOptions,
  CockpitExecutorContext,
} from "./types.ts";

/**
 * Default tenant extractor - reads from request header
 */
function defaultTenantExtractor(
  context: CockpitExecutorContext | undefined,
  headerName: string
): string | undefined {
  if (!context?.req?.headers) return undefined;
  const value = context.req.headers[headerName];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Creates a remote executor for Cockpit GraphQL
 *
 * The executor resolves the tenant from context and creates
 * a CockpitAPI client for each request.
 *
 * @example
 * ```typescript
 * import { createRemoteExecutor } from "@unchainedshop/cockpit-api/schema";
 *
 * const executor = createRemoteExecutor({
 *   tenantHeader: "x-cockpit-space",
 * });
 *
 * // Use with custom schema tooling
 * const result = await executor({
 *   document: someQuery,
 *   variables: { id: "123" },
 *   context: { req: request },
 * });
 * ```
 */
export function createRemoteExecutor(options: MakeCockpitSchemaOptions = {}): RemoteExecutor {
  const {
    tenantHeader = "x-cockpit-space",
    extractTenant,
    cockpitOptions = {},
  } = options;

  return async ({ document, variables, context }: ExecutorRequest) => {
    // Extract tenant from context
    const tenant = extractTenant
      ? extractTenant(context as CockpitExecutorContext)
      : defaultTenantExtractor(context, tenantHeader);

    // Create Cockpit client with resolved tenant
    const cockpit = await CockpitAPI({
      ...cockpitOptions,
      tenant,
    });

    // Execute GraphQL query
    return cockpit.graphQL(document, variables);
  };
}
