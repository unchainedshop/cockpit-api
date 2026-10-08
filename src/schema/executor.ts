/**
 * Remote executor for Cockpit GraphQL schema stitching
 */

import {
  getOperationAST,
  GraphQLError,
  type DocumentNode,
  type IntrospectionQuery,
} from "graphql";
import { LRUCache } from "lru-cache";
import { CockpitAPI, type CockpitAPIClient } from "../client.ts";
import { createLRUCacheStore } from "../core/cache.ts";
import { envNumber, type CockpitAPIOptions } from "../core/config.ts";
import { validatePathSegment } from "../core/url.ts";
import { getTenantIds } from "../utils/tenant.ts";

/** Context passed to the executor, typically holding the incoming request */
export interface CockpitExecutorContext {
  req?: {
    headers?: Record<string, string | string[] | undefined>;
  };
  [key: string]: unknown;
}

export interface MakeCockpitSchemaOptions {
  /** Header selecting the tenant (default: "x-cockpit-space") */
  tenantHeader?: string;
  /**
   * Reject every non-query operation before it reaches Cockpit (and drop the
   * Mutation type from the schema). Default: true for
   * `makeCockpitGraphQLSchema`, false for `createRemoteExecutor`.
   */
  filterMutations?: boolean;
  /** Additional schema transforms */
  transforms?: unknown[];
  /** Custom tenant extraction; "" or `undefined` selects the default space */
  extractTenant?: (
    context: CockpitExecutorContext | undefined,
  ) => string | undefined;
  /**
   * Tenants requests may select: ids (case-insensitive) or a predicate on the
   * lower-cased tenant. Default: `getTenantIds()`. Other tenants get a GraphQL
   * error; no client is created.
   */
  allowedTenants?: string[] | ((tenant: string) => boolean);
  /**
   * API key per space (`undefined` tenant: default space). Falls back to
   * `COCKPIT_SECRET_<TENANT>` for tenants and to `cockpitOptions.apiKey` /
   * `COCKPIT_SECRET` for the default space: `cockpitOptions.apiKey` is never
   * sent to a caller-selected tenant.
   */
  apiKey?: (tenant: string | undefined) => string | undefined;
  /**
   * Options for the pooled clients. Unless `cache` is `false` or has a
   * `store`, all clients share one LRU store of `cache.max` /
   * `COCKPIT_CACHE_MAX` entries (default: 1000) for the whole pool.
   */
  cockpitOptions?: Pick<
    CockpitAPIOptions,
    | "endpoint"
    | "apiKey"
    | "useAdminAccess"
    | "resolvePageLinks"
    | "cache"
    | "publicUrl"
    | "relativeAssetPaths"
    | "timeout"
    | "defaultLanguage"
  >;
  /** Maximum number of pooled clients (default: 100) */
  maxClients?: number;
  /** Introspection result to build the schema from instead of querying Cockpit */
  introspection?: IntrospectionQuery;
}

export interface ExecutorRequest {
  document: DocumentNode;
  variables?: Record<string, unknown>;
  operationName?: string;
  context?: CockpitExecutorContext;
}

export type RemoteExecutor = (request: ExecutorRequest) => Promise<unknown>;

const DEFAULT_POOL_CACHE_MAX = 1000;

/** Pool key of the default space; no valid tenant can collide with it */
const DEFAULT_POOL_KEY = "\0default";

const errorResult = (message: string): { errors: GraphQLError[] } => ({
  errors: [new GraphQLError(`Cockpit: ${message}`)],
});

function createTenantAllowlist(
  allowedTenants: MakeCockpitSchemaOptions["allowedTenants"],
): (tenant: string) => boolean {
  if (typeof allowedTenants === "function") return allowedTenants;
  if (allowedTenants === undefined) {
    // Read per request so tenants configured later are picked up
    return (tenant) => getTenantIds().includes(tenant);
  }
  const allowed = new Set(allowedTenants.map((t) => t.toLowerCase()));
  return (tenant) => allowed.has(tenant);
}

function headerTenant(
  context: CockpitExecutorContext | undefined,
  header: string,
): string | undefined {
  const value = context?.req?.headers?.[header];
  return Array.isArray(value) ? value[0] : value;
}

function isValidTenant(tenant: string): boolean {
  try {
    validatePathSegment(tenant, "tenant");
    return true;
  } catch {
    return false;
  }
}

/**
 * Executor forwarding GraphQL operations to Cockpit with pooled clients per
 * tenant. The tenant is caller input: lower-cased, validated and checked
 * against `allowedTenants`.
 */
export function createRemoteExecutor(
  options: MakeCockpitSchemaOptions = {},
): RemoteExecutor {
  const {
    tenantHeader = "x-cockpit-space",
    extractTenant = (context): string | undefined =>
      headerTenant(context, tenantHeader),
    cockpitOptions = {},
    maxClients = 100,
    filterMutations = false,
    apiKey,
  } = options;
  const isAllowedTenant = createTenantAllowlist(options.allowedTenants);
  const { apiKey: defaultKey, cache, ...clientOptions } = cockpitOptions;

  // One store for the whole pool: bounds memory and survives client eviction
  const sharedCache: CockpitAPIOptions["cache"] =
    cache === false || cache?.store !== undefined
      ? cache
      : {
          ...cache,
          store: createLRUCacheStore({
            max:
              cache?.max ??
              envNumber("COCKPIT_CACHE_MAX") ??
              DEFAULT_POOL_CACHE_MAX,
          }),
        };

  // Only allowlisted tenants get a slot, so callers can't flood the pool
  const pool = new LRUCache<string, Promise<CockpitAPIClient>>({
    max: maxClients,
  });

  function getClient(tenant: string | undefined): Promise<CockpitAPIClient> {
    const key = tenant ?? DEFAULT_POOL_KEY;
    const pooled = pool.get(key);
    if (pooled) return pooled;

    const resolvedKey =
      apiKey?.(tenant) ?? (tenant === undefined ? defaultKey : undefined);
    const client = CockpitAPI({
      resolvePageLinks: true,
      ...clientOptions,
      ...(sharedCache !== undefined && { cache: sharedCache }),
      ...(resolvedKey !== undefined && { apiKey: resolvedKey }),
      ...(tenant !== undefined && { tenant }),
    });
    pool.set(key, client);
    // A failed creation must not stick: the next request retries
    client.catch(() => {
      if (pool.peek(key) === client) pool.delete(key);
    });
    return client;
  }

  return async ({ document, variables, operationName, context }) => {
    if (
      filterMutations &&
      getOperationAST(document, operationName)?.operation !== "query"
    ) {
      return errorResult("Only queries are allowed");
    }

    const raw = extractTenant(context)?.toLowerCase();
    const tenant = raw === "" ? undefined : raw;
    if (tenant !== undefined) {
      if (!isValidTenant(tenant)) return errorResult("Invalid tenant");
      if (!isAllowedTenant(tenant)) return errorResult("Unknown tenant");
    }

    const cockpit = await getClient(tenant);
    return cockpit.graphQL(document, variables, operationName);
  };
}
