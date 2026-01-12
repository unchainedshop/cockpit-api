/**
 * Transformer composition utilities
 */

import type { ResponseTransformer } from "./image-path.ts";

/**
 * Composes multiple transformers into a single transformer
 * Transforms are applied left to right
 */
export function composeTransformers(
  ...transformers: ResponseTransformer[]
): ResponseTransformer {
  return {
    transform<T>(response: T): T {
      return transformers.reduce(
        (result, transformer) => transformer.transform(result),
        response
      );
    },
  };
}
