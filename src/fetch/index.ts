/**
 * Lightweight fetch client for Cockpit CMS
 *
 * Designed for edge/RSC environments where the full CockpitAPI is too heavy.
 *
 * @example
 * ```typescript
 * import { createFetchClient } from "@unchainedshop/cockpit-api/fetch";
 *
 * const cockpit = createFetchClient({
 *   endpoint: process.env.NEXT_PUBLIC_COCKPIT_ENDPOINT,
 *   tenant: "mytenant",
 * });
 *
 * const page = await cockpit.pageByRoute("/about", { locale: "en" });
 * ```
 */

export { createFetchClient } from "./client.ts";
export type {
  FetchClient,
  FetchClientOptions,
  FetchCacheMode,
  PageFetchParams,
} from "./client.ts";
