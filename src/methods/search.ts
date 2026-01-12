/**
 * Search API methods (Detektivo addon)
 */

import type { MethodContext } from "./content.ts";
import { requireParam } from "../core/validation.ts";

// ============================================================================
// Types
// ============================================================================

export interface SearchQueryOptions {
  index: string;
  q?: string;
  /** Comma-separated list of fields to retrieve */
  fields?: string;
  limit?: number;
  offset?: number;
}

export interface CockpitSearchHit {
  _id: string;
  _score: number;
  _source: Record<string, unknown>;
  highlight?: Record<string, string[]>;
}

export interface CockpitSearchResult {
  hits: CockpitSearchHit[];
  total: number;
  took: number;
}

// ============================================================================
// Implementation
// ============================================================================

export interface SearchMethods {
  search<T = CockpitSearchResult>(
    options: SearchQueryOptions,
  ): Promise<T | null>;
}

export function createSearchMethods(ctx: MethodContext): SearchMethods {
  return {
    async search<T = CockpitSearchResult>(
      options: SearchQueryOptions,
    ): Promise<T | null> {
      const { index, q, fields, limit, offset } = options;
      requireParam(index, "a search index");
      const url = ctx.url.build(`/detektivo/search/${index}`, {
        queryParams: { q, fields, limit, offset },
      });
      return ctx.http.fetch<T>(url);
    },
  };
}
