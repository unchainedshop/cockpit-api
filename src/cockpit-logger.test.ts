import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('cockpit-logger', () => {
  it('exports a logger object with standard methods', async () => {
    const { logger } = await import('./cockpit-logger.ts');
    assert.ok(logger);
    assert.ok(typeof logger.info === 'function');
    assert.ok(typeof logger.error === 'function');
    assert.ok(typeof logger.warn === 'function');
    assert.ok(typeof logger.debug === 'function');
    assert.ok(typeof logger.trace === 'function');
  });

  it('exports default as a function', async () => {
    const loggerModule = await import('./cockpit-logger.ts');
    assert.ok(typeof loggerModule.default === 'function');
  });
});
