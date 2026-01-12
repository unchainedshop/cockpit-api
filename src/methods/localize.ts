/**
 * Localization API methods (Lokalize addon)
 */

import type { MethodContext } from "./content.ts";

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

const requireParam = (value: unknown, name: string): void => {
  if (!value) throw new Error(`Cockpit: Please provide ${name}`);
};

export interface LocalizeMethods {
  localize<T = unknown>(projectName: string, options?: LocalizeOptions): Promise<T | null>;
}

export function createLocalizeMethods(ctx: MethodContext): LocalizeMethods {
  return {
    async localize<T = unknown>(projectName: string, options: LocalizeOptions = {}): Promise<T | null> {
      requireParam(projectName, "projectName");
      const { locale = "default", nested = false } = options;
      const url = ctx.url.build(`/lokalize/project/${projectName}`, { locale, queryParams: { nested } });
      return ctx.http.fetch<T>(url);
    },
  };
}
