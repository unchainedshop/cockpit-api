/**
 * Lightweight fetch client for Cockpit CMS (edge/RSC environments)
 *
 * @example
 * ```typescript
 * import { createFetchClient } from "@unchainedshop/cockpit-api/fetch";
 *
 * const cockpit = createFetchClient({ endpoint, tenant: "mytenant" });
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
