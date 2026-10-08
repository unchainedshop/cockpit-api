/**
 * Cockpit link protocols: `pages://<id>` and `assets://<id>`
 */

export type CockpitProtocol = "pages" | "assets" | "external";

export interface ParsedCockpitUrl {
  protocol: CockpitProtocol;
  /** Id (up to the first `?` or `#`), or the whole URL for `external` */
  id: string;
  /** The trimmed input */
  original: string;
}

/**
 * Parses a link; `null` for non-strings, blank input and `pages://` /
 * `assets://` references without an id. Anything else is `external`.
 */
export function parseCockpitUrl(
  url: string | null | undefined,
): ParsedCockpitUrl | null {
  if (typeof url !== "string") return null;
  const original = url.trim();
  if (original === "") return null;
  for (const protocol of ["pages", "assets"] as const) {
    if (!original.startsWith(`${protocol}://`)) continue;
    const id = original.slice(protocol.length + 3).split(/[?#]/, 1)[0] ?? "";
    return id === "" ? null : { protocol, id, original };
  }
  return { protocol: "external", id: original, original };
}

/** Page id of a `pages://` link, otherwise `null` */
export function extractPageId(url: string | null | undefined): string | null {
  const parsed = parseCockpitUrl(url);
  return parsed?.protocol === "pages" ? parsed.id : null;
}

/** Asset id of an `assets://` link, otherwise `null` */
export function extractAssetId(url: string | null | undefined): string | null {
  const parsed = parseCockpitUrl(url);
  return parsed?.protocol === "assets" ? parsed.id : null;
}
