/**
 * GraphQL API method
 */

import { print, type DocumentNode } from "graphql";
import type { MethodContext } from "./content.ts";
import type { UrlBuilder } from "../core/url-builder.ts";

// ============================================================================
// Implementation
// ============================================================================

export interface GraphQLMethods {
  graphQL<T = unknown>(
    document: DocumentNode,
    variables?: Record<string, unknown>,
  ): Promise<T | null>;
}

export function createGraphQLMethods(
  ctx: MethodContext,
  urlBuilder: UrlBuilder,
): GraphQLMethods {
  return {
    async graphQL<T = unknown>(
      document: DocumentNode,
      variables?: Record<string, unknown>,
    ): Promise<T | null> {
      const query = print(document);
      const endpoint = urlBuilder.graphqlEndpoint();
      return ctx.http.post<T>(endpoint, { query, variables });
    },
  };
}
