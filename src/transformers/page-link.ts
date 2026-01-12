/**
 * Page link transformer for resolving pages://id links
 */

import { logger } from "../cockpit-logger.ts";
import type { ResponseTransformer } from "./image-path.ts";

/**
 * Escapes regex special characters in a string
 */
const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Transforms page links in a JSON string.
 * This is the core transformation logic used by the transformer.
 *
 * @param jsonString - The JSON string to transform
 * @param replacements - Map of pages://id -> actual route
 * @returns Transformed JSON string with page links resolved
 */
export function transformPageLinks(
  jsonString: string,
  replacements: Record<string, string>,
): string {
  const keys = Object.keys(replacements);
  if (keys.length === 0) return jsonString;

  const pattern = new RegExp(keys.map(escapeRegex).join("|"), "g");
  return jsonString.replace(pattern, (match) => replacements[match] ?? match);
}

/**
 * Creates a transformer that resolves page links (pages://id -> route).
 * Use this when you only need page link resolution without asset path fixing.
 */
export function createPageLinkTransformer(
  replacements: Record<string, string>,
): ResponseTransformer {
  return {
    transform<T>(originalResponse: T): T {
      const keys = Object.keys(replacements);
      if (keys.length === 0) return originalResponse;

      try {
        const jsonString = JSON.stringify(originalResponse);
        const fixedString = transformPageLinks(jsonString, replacements);
        return JSON.parse(fixedString) as T;
      } catch (error) {
        logger.warn("Cockpit: Failed to transform page links", error);
        return originalResponse;
      }
    },
  };
}
