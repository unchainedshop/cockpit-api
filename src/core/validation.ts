/**
 * Shared validation utilities
 */

/** Valid path segment format: alphanumeric, hyphens, underscores only */
const VALID_PATH_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates that a required parameter is present
 * @throws Error if value is undefined, null, or empty string
 */
export const requireParam = (value: unknown, name: string): void => {
  if (value === undefined || value === null || value === "")
    throw new Error(`Cockpit: Please provide ${name}`);
};

/**
 * Validates path segment format to prevent path traversal
 * @throws Error if value contains invalid characters
 */
export const validatePathSegment = (value: string, name: string): void => {
  if (!VALID_PATH_SEGMENT.test(value)) {
    throw new Error(
      `Cockpit: Invalid ${name} format (only alphanumeric, hyphens, and underscores allowed)`,
    );
  }
};
