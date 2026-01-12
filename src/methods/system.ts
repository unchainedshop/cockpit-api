/**
 * System API methods
 */

import type { MethodContext } from "./content.ts";

export interface CockpitHealthCheck {
  status: "ok" | "error";
  message?: string;
  version?: string;
  timestamp?: string;
}

export interface SystemMethods {
  healthCheck<T = unknown>(): Promise<T | null>;
  clearCache(pattern?: string): void;
}

export function createSystemMethods(ctx: MethodContext): SystemMethods {
  return {
    async healthCheck<T = unknown>(): Promise<T | null> {
      const url = ctx.url.build("/system/healthcheck");
      return ctx.http.fetch<T>(url);
    },

    clearCache(pattern?: string): void {
      ctx.cache.clear(pattern);
    },
  };
}
