/**
 * GraphQL API method
 */

import type { DocumentNode } from "graphql";
import type * as GraphQL from "graphql";
import { hashOpts } from "../core/cache.ts";
import { withLinks, type MethodContext } from "./context.ts";

export interface GraphQLMethods {
  graphQL<T = unknown>(
    document: DocumentNode,
    variables?: Record<string, unknown>,
    operationName?: string,
  ): Promise<T | null>;
}

// `graphql` is an optional peer dependency: load it on first use so the main
// entry can be imported (and starts faster) without it.
let graphqlModule: Promise<typeof GraphQL> | undefined;
const loadGraphQL = (): Promise<typeof GraphQL> => {
  graphqlModule ??= import("graphql").catch((error: unknown) => {
    graphqlModule = undefined;
    throw new Error(
      'Cockpit: graphQL() requires the optional peer dependency "graphql"',
      { cause: error },
    );
  });
  return graphqlModule;
};

/** A GraphQL response with errors: returned to the caller, never cached */
class UncacheableResult<T> extends Error {
  constructor(readonly result: T) {
    super("Cockpit: GraphQL response with errors");
  }
}

const hasGraphQLErrors = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const { errors } = value as { errors?: unknown };
  return Array.isArray(errors) && errors.length > 0;
};

export function createGraphQLMethods(ctx: MethodContext): GraphQLMethods {
  return {
    async graphQL<T = unknown>(
      document: DocumentNode,
      variables?: Record<string, unknown>,
      operationName?: string,
    ): Promise<T | null> {
      const { print, getOperationAST } = await loadGraphQL();
      const query = print(document);
      const operation = getOperationAST(document, operationName);
      const resolvedOperationName = operationName ?? operation?.name?.value;
      const endpoint = ctx.url.graphqlEndpoint();
      const send = (): Promise<T | null> =>
        ctx.http.post<T>(endpoint, {
          query,
          variables,
          operationName: resolvedOperationName,
        });
      const key = `graphql|${hashOpts({ query, variables: variables ?? null, operationName: resolvedOperationName ?? "" })}`;
      const load = async (): Promise<T | null> => {
        // Mutations have side effects (subscriptions aren't request/response)
        if (operation && operation.operation !== "query") return send();
        // Responses with `errors` (often transient) skip the cache: thrown past
        // it and handed back as-is
        try {
          return await ctx.cache.swr<T>(key, async () => {
            const result = await send();
            if (hasGraphQLErrors(result)) throw new UncacheableResult(result);
            return result;
          });
        } catch (error) {
          if (error instanceof UncacheableResult) return error.result as T;
          throw error;
        }
      };
      return withLinks(ctx, "default", load);
    },
  };
}
