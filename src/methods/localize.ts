/**
 * Localization API methods (Lokalize addon)
 */

import { get, segment, type MethodContext } from "./context.ts";

export interface LocalizeOptions {
  locale?: string;
  nested?: boolean;
}

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
      { locale, nested = false }: LocalizeOptions = {},
    ): Promise<T | null> {
      return get<T>(
        ctx,
        `/lokalize/project/${segment(projectName, "projectName")}`,
        { locale, query: { nested }, cache: false },
      );
    },
  };
}
