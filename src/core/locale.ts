/**
 * Shared locale utilities
 */

/**
 * Creates a locale normalizer for the given default language.
 * Maps the default language to Cockpit's "default" locale.
 *
 * @param defaultLanguage - The language that should map to "default", or null to disable mapping
 * @returns A function that normalizes locale strings
 */
export function createLocaleNormalizer(
  defaultLanguage: string | null,
): (locale?: string) => string {
  return (locale?: string): string => {
    if (locale === undefined) return "default";
    if (defaultLanguage !== null && locale === defaultLanguage)
      return "default";
    return locale;
  };
}
