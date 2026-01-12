/**
 * System API methods
 */

import type { MethodContext } from "./content.ts";
import type { CacheManager } from "../core/cache.ts";

// ============================================================================
// Types
// ============================================================================

export interface CockpitHealthCheck {
  status: "ok" | "error";
  message?: string;
  version?: string;
  timestamp?: string;
}

// ============================================================================
// Implementation
// ============================================================================

export interface SystemMethods {
  healthCheck<T = unknown>(): Promise<T | null>;
  clearCache(pattern?: string): void;
}

export function createSystemMethods(ctx: MethodContext, cache: CacheManager): SystemMethods {
  return {
    async healthCheck<T = unknown>(): Promise<T | null> {
      const url = ctx.url.build("/system/healthcheck");
      return ctx.http.fetch<T>(url);
    },

    clearCache(pattern?: string): void {
      cache.clear(pattern);
    },
  };
}
