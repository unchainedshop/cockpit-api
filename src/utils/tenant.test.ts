import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getTenantIds } from './tenant.ts';
import { EnvManager } from '../__tests__/test-helpers.ts';

describe('getTenantIds', () => {
  const envManager = new EnvManager();

  beforeEach(() => {
    // Clear all COCKPIT_SECRET* vars before each test
    envManager.clear('COCKPIT_SECRET');
  });

  afterEach(() => {
    envManager.reset();
  });

  it('returns empty array when no COCKPIT_SECRET_* vars exist', () => {
    const result = getTenantIds();
    assert.deepStrictEqual(result, []);
  });

  it('extracts single tenant ID from COCKPIT_SECRET_TENANT', () => {
    envManager.set({ COCKPIT_SECRET_MYTENANT: 'secret123' });
    const result = getTenantIds();
    assert.deepStrictEqual(result, ['mytenant']);
  });

  it('extracts multiple tenant IDs', () => {
    envManager.set({
      COCKPIT_SECRET_TENANT1: 'secret1',
      COCKPIT_SECRET_TENANT2: 'secret2',
      COCKPIT_SECRET_TENANT3: 'secret3',
    });
    const result = getTenantIds();
    assert.strictEqual(result.length, 3);
    assert.ok(result.includes('tenant1'));
    assert.ok(result.includes('tenant2'));
    assert.ok(result.includes('tenant3'));
  });

  it('ignores COCKPIT_SECRET (without suffix)', () => {
    envManager.set({
      COCKPIT_SECRET: 'default-secret',
      COCKPIT_SECRET_MYTENANT: 'tenant-secret',
    });
    const result = getTenantIds();
    assert.deepStrictEqual(result, ['mytenant']);
  });

  it('ignores *_FILE suffixed vars', () => {
    envManager.set({
      COCKPIT_SECRET_MYTENANT: 'secret',
      COCKPIT_SECRET_MYTENANT_FILE: '/path/to/file',
    });
    const result = getTenantIds();
    assert.deepStrictEqual(result, ['mytenant']);
  });

  it('converts tenant names to lowercase', () => {
    envManager.set({ COCKPIT_SECRET_MYTENANT: 'secret' });
    const result = getTenantIds();
    assert.deepStrictEqual(result, ['mytenant']);
  });

  it('handles mixed case tenant names', () => {
    envManager.set({ COCKPIT_SECRET_MyMixedCaseTenant: 'secret' });
    const result = getTenantIds();
    assert.deepStrictEqual(result, ['mymixedcasetenant']);
  });
});
