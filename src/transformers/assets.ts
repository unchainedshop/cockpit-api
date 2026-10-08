/**
 * Asset URL fixing of parsed JSON responses (applied once, before caching)
 */

/**
 * Host-relative storage URLs in src/href attributes of HTML strings: Cockpit
 * serves files under `/storage/...`, for spaces as `/:space/storage/...` (the
 * URL it emits) or `/.spaces/space/storage/...`. Only those exact,
 * case-sensitive forms match, so `/de/self-storage` or `//host/storage/...`
 * are left alone.
 */
const STORAGE_ATTR =
  // eslint-disable-next-line no-control-regex
  /(src|href)="((?:\/:[^/"\\\u0000-\u001f]+|\/\.spaces\/[^/"\\\u0000-\u001f]+)?\/storage\/)/g;

const UPLOADS = "/storage/uploads/";
const DOUBLE_UPLOADS = "/storage/uploads/storage/uploads/";

/**
 * Cockpit asset objects (assets:add) always carry `path` and `mime` plus an
 * `_id`, `_hash` or `size`; other objects with a `path` (routes, SEO) don't.
 */
const isAsset = (value: Record<string, unknown>): boolean =>
  typeof value["path"] === "string" &&
  typeof value["mime"] === "string" &&
  (typeof value["_id"] === "string" ||
    typeof value["_hash"] === "string" ||
    typeof value["size"] === "number");

export interface AssetFixerOptions {
  /** Origin prepended to asset URLs; `""` keeps them host-relative */
  baseUrl: string;
  tenant?: string | undefined;
}

/**
 * Returns a fixer that rewrites, in place, storage URLs in src/href attributes
 * of every string (origin only, they keep their own prefix) and the `path` of
 * asset objects (to `<baseUrl>[/:tenant]/storage/uploads/...`). Object keys
 * are never rewritten. Only pass values you own: parsed JSON (acyclic).
 */
export function createAssetFixer({
  baseUrl,
  tenant,
}: AssetFixerOptions): <T>(owned: T) => T {
  const assetBase = `${baseUrl}${tenant ? `/:${tenant}` : ""}`;

  const fixString = (value: string): string => {
    if (!value.includes("/storage/")) return value;
    let result = baseUrl
      ? value.replace(
          STORAGE_ATTR,
          (_match, attr: string, path: string) => `${attr}="${baseUrl}${path}`,
        )
      : value;
    if (result.includes(DOUBLE_UPLOADS)) {
      result = result.replaceAll(DOUBLE_UPLOADS, UPLOADS);
    }
    return result;
  };

  const fixPath = (path: string): string => {
    if (!path.startsWith("/") || path.startsWith("//")) return path;
    return path.startsWith(UPLOADS)
      ? `${assetBase}${path}`
      : `${assetBase}/storage/uploads${path}`;
  };

  return <T>(owned: T): T => {
    if (typeof owned === "string") return fixString(owned) as T;
    const stack: unknown[] = [owned];
    let current: unknown;
    while ((current = stack.pop()) !== undefined) {
      if (current === null || typeof current !== "object") continue;
      const node = current as Record<string, unknown>;
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (typeof child === "string") {
          const fixed = fixString(child);
          if (fixed !== child) node[key] = fixed;
        } else if (typeof child === "object" && child !== null) {
          stack.push(child);
        }
      }
      // After its own strings, like the former text-based transformation
      if (!Array.isArray(node) && isAsset(node)) {
        node["path"] = fixPath(node["path"] as string);
      }
    }
    return owned;
  };
}
