/**
 * URL protocol parsing utilities for Cockpit CMS
 *
 * Provides utilities to parse and work with Cockpit CMS URL protocols:
 * - pages://id - References to pages by ID
 * - assets://id - References to assets by ID
 */

export type CockpitProtocol = "pages" | "assets" | "external";

export interface ParsedCockpitUrl {
  protocol: CockpitProtocol;
  id: string;
  original: string;
}

/**
 * Parses a Cockpit CMS URL and extracts protocol and ID information.
 *
 * @param url - The URL to parse (e.g., "pages://123", "assets://456", or "https://example.com")
 * @returns Parsed URL object with protocol, id, and original URL, or null if invalid
 *
 * @example
 * ```typescript
 * parseCockpitUrl("pages://abc123")
 * // { protocol: "pages", id: "abc123", original: "pages://abc123" }
 *
 * parseCockpitUrl("assets://xyz789")
 * // { protocol: "assets", id: "xyz789", original: "assets://xyz789" }
 *
 * parseCockpitUrl("https://example.com")
 * // { protocol: "external", id: "https://example.com", original: "https://example.com" }
 *
 * parseCockpitUrl(null)
 * // null
 * ```
 */
export function parseCockpitUrl(
  url: string | null | undefined,
): ParsedCockpitUrl | null {
  if (url == null || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (trimmed === "") return null;

  if (trimmed.startsWith("pages://")) {
    const id = trimmed.slice(8).split("?")[0] ?? "";
    return { protocol: "pages", id, original: trimmed };
  }

  if (trimmed.startsWith("assets://")) {
    const id = trimmed.slice(9).split("?")[0] ?? "";
    return { protocol: "assets", id, original: trimmed };
  }

  return { protocol: "external", id: trimmed, original: trimmed };
}

/**
 * Checks if a URL is a Cockpit page reference (pages://id).
 *
 * @param url - The URL to check
 * @returns True if the URL uses the pages:// protocol
 *
 * @example
 * ```typescript
 * isCockpitPageUrl("pages://123") // true
 * isCockpitPageUrl("assets://456") // false
 * isCockpitPageUrl("https://example.com") // false
 * ```
 */
export function isCockpitPageUrl(url: string | null | undefined): boolean {
  return parseCockpitUrl(url)?.protocol === "pages";
}

/**
 * Checks if a URL is a Cockpit asset reference (assets://id).
 *
 * @param url - The URL to check
 * @returns True if the URL uses the assets:// protocol
 *
 * @example
 * ```typescript
 * isCockpitAssetUrl("assets://456") // true
 * isCockpitAssetUrl("pages://123") // false
 * isCockpitAssetUrl("https://example.com") // false
 * ```
 */
export function isCockpitAssetUrl(url: string | null | undefined): boolean {
  return parseCockpitUrl(url)?.protocol === "assets";
}

/**
 * Extracts the page ID from a Cockpit page URL.
 *
 * @param url - The URL to extract from
 * @returns The page ID if valid pages:// URL, null otherwise
 *
 * @example
 * ```typescript
 * extractPageId("pages://abc123") // "abc123"
 * extractPageId("assets://456") // null
 * extractPageId("https://example.com") // null
 * ```
 */
export function extractPageId(url: string | null | undefined): string | null {
  const parsed = parseCockpitUrl(url);
  return parsed?.protocol === "pages" ? parsed.id : null;
}

/**
 * Extracts the asset ID from a Cockpit asset URL.
 *
 * @param url - The URL to extract from
 * @returns The asset ID if valid assets:// URL, null otherwise
 *
 * @example
 * ```typescript
 * extractAssetId("assets://xyz789") // "xyz789"
 * extractAssetId("pages://123") // null
 * extractAssetId("https://example.com") // null
 * ```
 */
export function extractAssetId(url: string | null | undefined): string | null {
  const parsed = parseCockpitUrl(url);
  return parsed?.protocol === "assets" ? parsed.id : null;
}
