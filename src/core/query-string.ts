/**
 * Query string encoding utilities
 */

type QueryParamValue = string | number | boolean | object | null | undefined;

/**
 * Encodes a single query parameter key-value pair
 */
export const encodeQueryParam = (key: string, value: QueryParamValue): string => {
  const encodedValue = typeof value === "string" ? value : JSON.stringify(value);
  return `${encodeURIComponent(key)}=${encodeURIComponent(encodedValue)}`;
};

/**
 * Builds a query string from an object of parameters
 * Filters out null and undefined values
 */
export const buildQueryString = (params: Record<string, QueryParamValue>): string | null => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (!entries.length) return null;
  return entries.map(([key, value]) => encodeQueryParam(key, value)).join("&");
};
