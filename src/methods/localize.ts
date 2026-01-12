/**
 * Localization API methods (Lokalize addon)
 */

import type { MethodContext } from "./content.ts";
import { requireParam } from "../core/validation.ts";

// ============================================================================
// Types
// ============================================================================

export interface LocalizeOptions {
  locale?: string;
  nested?: boolean;
}

// ============================================================================
// Implementation
// ============================================================================

export interface LocalizeMethods {
  localize<T = unknown>(
    projectName: string,
    options?: LocalizeOptions,
  ): Promise<T | null>;
}

export function createLocalizeMethods(ctx: MethodContext): LocalizeMethods {
  return {
    async localize<T = unknown>(
      projectName: string,
      options: LocalizeOptions = {},
    ): Promise<T | null> {
      requireParam(projectName, "projectName");
      const { locale = "default", nested = false } = options;
      const url = ctx.url.build(`/lokalize/project/${projectName}`, {
        locale,
        queryParams: { nested },
      });
      return ctx.http.fetch<T>(url);
    },
  };
}
