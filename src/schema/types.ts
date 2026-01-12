/**
 * Types for GraphQL schema stitching
 */

import type { DocumentNode } from "graphql";
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
  extractTenant?: (context: CockpitExecutorContext) => string | undefined;

  /** CockpitAPI options to pass through (endpoint, apiKey, useAdminAccess) */
  cockpitOptions?: Pick<CockpitAPIOptions, "endpoint" | "apiKey" | "useAdminAccess">;
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
