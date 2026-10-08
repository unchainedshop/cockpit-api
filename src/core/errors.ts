/**
 * Errors shared by the main and the `/fetch` client. Edge-safe: no imports.
 */

const MAX_ERROR_BODY_LENGTH = 500;

/**
 * Non-OK, non-404 response. The message stays short (path and status, no
 * query or body) as it tends to end up in user-facing error reports; `cause`
 * holds `{ status, url, body }` with the truncated upstream body.
 */
export class CockpitHttpError extends Error {
  override readonly name = "CockpitHttpError";
  /** HTTP status code */
  readonly status: number;
  /** Request URL without query string */
  readonly url: string;

  constructor(status: number, url: URL, body = "") {
    const bare = `${url.origin}${url.pathname}`;
    super(`Cockpit: Error accessing ${url.pathname} (${String(status)})`, {
      cause: { status, url: bare, body: body.slice(0, MAX_ERROR_BODY_LENGTH) },
    });
    this.status = status;
    this.url = bare;
  }
}

/**
 * Clear errors for timeouts (also while reading the body) and for redirects
 * refused on credentialed requests (`redirect: "error"`; undici: TypeError
 * "fetch failed" with cause "unexpected redirect"). Others pass unchanged.
 */
export function requestError(
  err: unknown,
  path: string,
  timeout: number,
  credentialed: boolean,
): unknown {
  if (!(err instanceof Error)) return err;
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return new Error(
      `Cockpit: request timed out after ${String(timeout)}ms (${path})`,
      { cause: err },
    );
  }
  const cause = err.cause instanceof Error ? err.cause.message : "";
  if (
    credentialed &&
    err instanceof TypeError &&
    /redirect/i.test(`${err.message} ${cause}`)
  ) {
    return new Error(
      `Cockpit: refusing to follow redirect for authenticated request (${path})`,
      { cause: err },
    );
  }
  return err;
}
