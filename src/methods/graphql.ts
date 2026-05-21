/**
 * GraphQL API method
 */

import { print, getOperationAST, type DocumentNode } from "graphql";
import type { MethodContext } from "./content.ts";
import { hashOpts } from "../core/cache.ts";

export interface GraphQLMethods {
  graphQL<T = unknown>(
    document: DocumentNode,
    variables?: Record<string, unknown>,
    operationName?: string,
  ): Promise<T | null>;
}

export function createGraphQLMethods(ctx: MethodContext): GraphQLMethods {
  return {
    async graphQL<T = unknown>(
      document: DocumentNode,
      variables?: Record<string, unknown>,
      operationName?: string,
    ): Promise<T | null> {
      const query = print(document);
      const resolvedOperationName =
        operationName ?? getOperationAST(document)?.name?.value;
      const endpoint = ctx.url.graphqlEndpoint();
      const key = `gql:${hashOpts({ query, variables: variables ?? null, operationName: resolvedOperationName ?? "" })}`;
      return ctx.cache.swr<T>(key, () =>
        ctx.http.post<T>(endpoint, {
          query,
          variables,
          operationName: resolvedOperationName,
        }),
      );
    },
  };
}
