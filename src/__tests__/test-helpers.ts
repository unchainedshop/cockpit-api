/**
 * Test helper utilities
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Runs `fn` with the endpoint of a local server answering every request with a 302 to another origin */
export async function withRedirectServer(fn: (endpoint: string) => Promise<void>): Promise<void> {
  const server = createServer((_req, res) => {
    res.writeHead(302, { location: 'https://evil.example.com/' }).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/graphql`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

export const TEST_ENDPOINT = 'https://test.cockpit.com/api/graphql';

/**
 * Minimal structural view of a `node:test` mock whose calls we inspect.
 * Matches both `Mock<typeof fetch>` and untyped `ReturnType<typeof mock.fn>`.
 */
export interface RecordedCalls {
  mock: { calls: ReadonlyArray<{ arguments: readonly unknown[] }> };
}

/**
 * The `RequestInit` the library hands to `fetch`. Both the main HTTP client and
 * the lightweight fetch client always send headers as a plain object.
 */
export interface RecordedFetchInit extends Omit<RequestInit, 'headers'> {
  headers: Record<string, string>;
}

function nthCall(calls: RecordedCalls, index: number): readonly unknown[] {
  const call = calls.mock.calls[index];
  if (call === undefined) {
    throw new Error(`Expected mock call #${index}, but only ${calls.mock.calls.length} call(s) were recorded`);
  }
  return call.arguments;
}

function inputToUrl(input: unknown): string {
  return input instanceof Request ? input.url : String(input);
}

/** URL string of the nth recorded `fetch` call */
export function fetchUrl(fetchMock: RecordedCalls, index = 0): string {
  return inputToUrl(nthCall(fetchMock, index)[0]);
}

/** `[url, init]` of the nth recorded `fetch` call (throws if no init was passed) */
export function fetchCall(fetchMock: RecordedCalls, index = 0): [url: string, init: RecordedFetchInit] {
  const [input, init] = nthCall(fetchMock, index);
  if (typeof init !== 'object' || init === null) {
    throw new Error(`Expected fetch call #${index} to receive a RequestInit`);
  }
  return [inputToUrl(input), init as RecordedFetchInit];
}

/** URL strings of all recorded `fetch` calls */
export function fetchUrls(fetchMock: RecordedCalls): string[] {
  return fetchMock.mock.calls.map((call) => inputToUrl(call.arguments[0]));
}

export interface MockResponseOptions {
  ok?: boolean;
  status?: number;
  url?: string;
  body?: unknown;
  textBody?: string;
}

/**
 * Create a mock Response object for fetch mocking
 */
export function createMockResponse(options: MockResponseOptions = {}): Response {
  const {
    ok = true,
    status = 200,
    url = 'https://test.cockpit.com/api/test',
    body = {},
    textBody = 'Error response',
  } = options;

  return {
    ok,
    status,
    url,
    // Like a real Response, every json() call yields a fresh object
    json: async () => structuredClone(body),
    text: async () => textBody,
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic',
    clone: () => createMockResponse(options),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    bytes: async () => new Uint8Array(),
  } as Response;
}

/**
 * Environment variable manager - only needed for tests that verify env-based features
 * (e.g., getTenantIds, resolveApiKey which read COCKPIT_SECRET_* from env)
 */
export class EnvManager {
  private originalEnv: NodeJS.ProcessEnv;

  constructor() {
    this.originalEnv = { ...process.env };
  }

  set(vars: Record<string, string | undefined>): void {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  reset(): void {
    for (const key of Object.keys(process.env)) {
      if (!(key in this.originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, this.originalEnv);
  }

  clear(prefix?: string): void {
    for (const key of Object.keys(process.env)) {
      if (!prefix || key.startsWith(prefix)) {
        delete process.env[key];
      }
    }
  }
}

/**
 * Assert helper for checking if a function throws
 */
export async function assertThrows(
  fn: () => Promise<unknown> | unknown,
  messageIncludes?: string
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected function to throw') {
      throw error;
    }
    if (messageIncludes && error instanceof Error) {
      if (!error.message.includes(messageIncludes)) {
        throw new Error(`Expected error message to include "${messageIncludes}", got: "${error.message}"`);
      }
    }
    return error as Error;
  }
}
