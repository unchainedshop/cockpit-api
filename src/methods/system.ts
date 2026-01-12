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
  /**
   * Clear cache entries matching pattern
   *
   * **BREAKING CHANGE (v3.0.0)**: This method is now async and returns a Promise
   *
   * @param pattern - Optional pattern to clear specific cache entries
   * @returns Promise that resolves when clearing is complete
   *
   * @example Clear all cache
   * ```typescript
   * await client.clearCache();
   * ```
   *
   * @example Clear route cache only
   * ```typescript
   * await client.clearCache('ROUTE');
   * ```
   */
  clearCache(pattern?: string): Promise<void>;
}

export function createSystemMethods(ctx: MethodContext): SystemMethods {
  return {
    async healthCheck<T = unknown>(): Promise<T | null> {
      const url = ctx.url.build("/system/healthcheck");
      return ctx.http.fetch<T>(url);
    },

    async clearCache(pattern?: string): Promise<void> {
      await ctx.cache.clear(pattern);
    },
  };
}
