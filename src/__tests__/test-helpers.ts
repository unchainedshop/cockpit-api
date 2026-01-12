/**
 * Test helper utilities
 */

export const TEST_ENDPOINT = 'https://test.cockpit.com/api/graphql';

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
    json: async () => body,
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
