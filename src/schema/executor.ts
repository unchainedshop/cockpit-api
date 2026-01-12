/**
 * Remote executor for Cockpit GraphQL schema stitching
 */

import type { DocumentNode } from "graphql";
import { LRUCache } from "lru-cache";
import { CockpitAPI, type CockpitAPIClient } from "../client.ts";
import type { CockpitAPIOptions } from "../core/config.ts";

/**
 * Context passed to the remote executor
 * Typically includes the request object for extracting tenant info
 */
export interface CockpitExecutorContext {
  req?: {
    headers?: Record<string, string | string[] | undefined>;
  };
  [key: string]: unknown;
}

/**
 * Options for creating the Cockpit GraphQL schema
 */
export interface MakeCockpitSchemaOptions {
  /** Header name to extract tenant from (default: "x-cockpit-space") */
  tenantHeader?: string;

  /** Filter out mutations from the schema (default: true) */
  filterMutations?: boolean;

  /** Additional transforms to apply to the schema */
  transforms?: unknown[];

  /** Custom tenant extractor function */
  extractTenant?: (
    context: CockpitExecutorContext | undefined,
  ) => string | undefined;

  /** CockpitAPI options to pass through (endpoint, apiKey, useAdminAccess, preloadRoutes) */
  cockpitOptions?: Pick<
    CockpitAPIOptions,
    "endpoint" | "apiKey" | "useAdminAccess" | "preloadRoutes"
  >;

  /** Maximum number of clients to keep in the pool (default: 100) */
  maxClients?: number;
}

/**
 * Executor request signature for GraphQL Tools
 */
export interface ExecutorRequest {
  document: DocumentNode;
  variables?: Record<string, unknown>;
  context?: CockpitExecutorContext;
}

/**
 * Remote executor function type
 */
export type RemoteExecutor = (request: ExecutorRequest) => Promise<unknown>;

/** Default max clients to keep in pool */
const DEFAULT_MAX_CLIENTS = 100;

/**
 * Default tenant extractor - reads from request header
 */
function defaultTenantExtractor(
  context: CockpitExecutorContext | undefined,
  headerName: string,
): string | undefined {
  if (!context?.req?.headers) return undefined;
  const value = context.req.headers[headerName];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Creates a remote executor for Cockpit GraphQL
 *
 * The executor resolves the tenant from context and reuses
 * CockpitAPI clients per tenant for efficiency.
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
export function createRemoteExecutor(
  options: MakeCockpitSchemaOptions = {},
): RemoteExecutor {
  const {
    tenantHeader = "x-cockpit-space",
    extractTenant,
    cockpitOptions = {},
    maxClients = DEFAULT_MAX_CLIENTS,
  } = options;

  // Client pool with LRU eviction to prevent unbounded memory growth
  const clientPool = new LRUCache<string, CockpitAPIClient>({
    max: maxClients,
  });
  const pendingClients = new Map<string, Promise<CockpitAPIClient>>();

  async function getOrCreateClient(
    tenant: string | undefined,
  ): Promise<CockpitAPIClient> {
    const key = tenant ?? "__default__";

    // Return cached client if available
    const cached = clientPool.get(key);
    if (cached) return cached;

    // If client is being created, wait for it
    const pending = pendingClients.get(key);
    if (pending) return pending;

    // Create new client and cache it
    // Default preloadRoutes to true for page link resolution in GraphQL responses
    const clientOpts: Parameters<typeof CockpitAPI>[0] = {
      preloadRoutes: true,
      ...cockpitOptions,
    };
    if (tenant !== undefined) clientOpts.tenant = tenant;
    const clientPromise = CockpitAPI(clientOpts);

    pendingClients.set(key, clientPromise);

    try {
      const client = await clientPromise;
      clientPool.set(key, client);
      return client;
    } finally {
      pendingClients.delete(key);
    }
  }

  return async ({ document, variables, context }: ExecutorRequest) => {
    // Extract tenant from context
    const tenant = extractTenant
      ? extractTenant(context)
      : defaultTenantExtractor(context, tenantHeader);

    // Get or create pooled client
    const cockpit = await getOrCreateClient(tenant);

    // Execute GraphQL query
    return cockpit.graphQL(document, variables);
  };
}
