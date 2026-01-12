import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getTenantIds, resolveTenantFromUrl, resolveTenantFromSubdomain } from './tenant.ts';
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

describe('resolveTenantFromSubdomain', () => {
  const envManager = new EnvManager();

  beforeEach(() => {
    envManager.clear('COCKPIT_SECRET');
  });

  afterEach(() => {
    envManager.reset();
  });

  it('returns matching tenant ID', () => {
    envManager.set({ COCKPIT_SECRET_MYTENANT: 'secret' });
    const result = resolveTenantFromSubdomain('mytenant');
    assert.strictEqual(result, 'mytenant');
  });

  it('is case-insensitive', () => {
    envManager.set({ COCKPIT_SECRET_MYTENANT: 'secret' });
    const result = resolveTenantFromSubdomain('MYTENANT');
    assert.strictEqual(result, 'mytenant');
  });

  it('returns null for unknown subdomain', () => {
    envManager.set({ COCKPIT_SECRET_MYTENANT: 'secret' });
    const result = resolveTenantFromSubdomain('unknown');
    assert.strictEqual(result, null);
  });

  it('returns null when subdomain matches defaultHost', () => {
    envManager.set({ COCKPIT_SECRET_GASTRO: 'secret' });
    const result = resolveTenantFromSubdomain('gastro', { defaultHost: 'gastro' });
    assert.strictEqual(result, null);
  });

  it('returns null for undefined subdomain', () => {
    const result = resolveTenantFromSubdomain(undefined);
    assert.strictEqual(result, null);
  });

  it('returns null for empty string subdomain', () => {
    const result = resolveTenantFromSubdomain('');
    assert.strictEqual(result, null);
  });

  it('defaultHost comparison is case-insensitive', () => {
    envManager.set({ COCKPIT_SECRET_GASTRO: 'secret' });
    const result = resolveTenantFromSubdomain('GASTRO', { defaultHost: 'gastro' });
    assert.strictEqual(result, null);
  });
});

describe('resolveTenantFromUrl', () => {
  const envManager = new EnvManager();

  beforeEach(() => {
    envManager.clear('COCKPIT_SECRET');
  });

  afterEach(() => {
    envManager.reset();
  });

  it('resolves tenant from subdomain', () => {
    envManager.set({ COCKPIT_SECRET_MYTENANT: 'secret' });
    const result = resolveTenantFromUrl('https://mytenant.example.com/some/page');
    assert.strictEqual(result.tenant, 'mytenant');
    assert.strictEqual(result.slug, 'page');
    assert.strictEqual(result.hostname, 'mytenant.example.com');
  });

  it('returns null for tenant when subdomain is defaultHost', () => {
    envManager.set({ COCKPIT_SECRET_GASTRO: 'secret' });
    const result = resolveTenantFromUrl('https://gastro.example.com/page', { defaultHost: 'gastro' });
    assert.strictEqual(result.tenant, null);
    assert.strictEqual(result.slug, 'page');
  });

  it('returns null for unknown subdomain', () => {
    const result = resolveTenantFromUrl('https://unknown.example.com/page');
    assert.strictEqual(result.tenant, null);
  });

  it('handles URLs without path segments', () => {
    const result = resolveTenantFromUrl('https://example.com');
    assert.strictEqual(result.slug, null);
    assert.strictEqual(result.hostname, 'example.com');
  });

  it('handles URLs with root path only', () => {
    const result = resolveTenantFromUrl('https://example.com/');
    assert.strictEqual(result.slug, null);
  });

  it('extracts last path segment as slug', () => {
    const result = resolveTenantFromUrl('https://example.com/a/b/c/myslug');
    assert.strictEqual(result.slug, 'myslug');
  });

  it('handles URLs with query strings', () => {
    const result = resolveTenantFromUrl('https://example.com/page/slug?foo=bar');
    assert.strictEqual(result.slug, 'slug');
  });

  it('handles URLs with trailing slashes', () => {
    const result = resolveTenantFromUrl('https://example.com/page/slug/');
    assert.strictEqual(result.slug, 'slug');
  });

  it('returns correct hostname', () => {
    const result = resolveTenantFromUrl('https://mytenant.sub.example.com/page');
    assert.strictEqual(result.hostname, 'mytenant.sub.example.com');
  });
});
