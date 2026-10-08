/**
 * Search API methods (Detektivo addon)
 */

import { get, segment, type MethodContext } from "./context.ts";

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

export interface SearchMethods {
  search<T = CockpitSearchResult>(
    options: SearchQueryOptions,
  ): Promise<T | null>;
}

export function createSearchMethods(ctx: MethodContext): SearchMethods {
  return {
    async search<T = CockpitSearchResult>({
      index,
      ...query
    }: SearchQueryOptions): Promise<T | null> {
      return get<T>(
        ctx,
        `/detektivo/search/${segment(index, "search index")}`,
        {
          query,
          cache: false,
        },
      );
    },
  };
}
