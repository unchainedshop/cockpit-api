import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getTenantIds, resolveApiKey, resolveTenantFromUrl, type ResolveTenantFromUrlOptions } from './tenant.ts';
import { EnvManager } from '../__tests__/test-helpers.ts';

const envManager = new EnvManager();

beforeEach(() => {
  envManager.clear('COCKPIT_SECRET');
});

afterEach(() => {
  envManager.reset();
});

describe('getTenantIds', () => {
  const cases: [string, Record<string, string>, string[]][] = [
    ['no tenant secrets', {}, []],
    ['one tenant, lower-cased', { COCKPIT_SECRET_MyTenant: 's' }, ['mytenant']],
    ['several tenants', { COCKPIT_SECRET_T1: 's', COCKPIT_SECRET_T2: 's' }, ['t1', 't2']],
    ['ignores COCKPIT_SECRET', { COCKPIT_SECRET: 's', COCKPIT_SECRET_A: 's' }, ['a']],
    ['ignores the prefix mid-name', { FOO_COCKPIT_SECRET_X: 's', COCKPIT_SECRET_A: 's' }, ['a']],
    ['ignores an empty suffix', { COCKPIT_SECRET_: 's', COCKPIT_SECRET_A: 's' }, ['a']],
    ['skips *_FILE variables', { COCKPIT_SECRET_A_FILE: '/run/s', COCKPIT_SECRET_B_file: '/run/s', COCKPIT_SECRET_A: 's' }, ['a']],
  ];
  for (const [name, env, expected] of cases) {
    it(name, () => {
      envManager.set(env);
      assert.deepStrictEqual(getTenantIds().sort(), expected);
    });
  }
});

describe('resolveTenantFromUrl', () => {
  const cases: [string, ResolveTenantFromUrlOptions, string | null, string | null][] = [
    ['https://mytenant.example.com/some/page', {}, 'mytenant', 'page'],
    ['https://MYTENANT.example.com/page', {}, 'mytenant', 'page'],
    ['https://unknown.example.com/page', {}, null, 'page'],
    ['https://gastro.example.com/page', { defaultHost: 'gastro' }, null, 'page'],
    ['https://gastro.example.com/page', { defaultHost: 'GASTRO' }, null, 'page'],
    ['https://gastro.example.com/page', {}, 'gastro', 'page'],
    ['https://example.com', {}, null, null],
    ['https://example.com/', {}, null, null],
    ['https://example.com/a/b/c/myslug', {}, null, 'myslug'],
    ['https://example.com/page/slug?foo=bar', {}, null, 'slug'],
    ['https://example.com/page/slug/', {}, null, 'slug'],
  ];
  for (const [url, options, tenant, slug] of cases) {
    it(`${url} ${JSON.stringify(options)} → ${tenant}, ${slug}`, () => {
      envManager.set({ COCKPIT_SECRET_MYTENANT: 's', COCKPIT_SECRET_GASTRO: 's' });
      const result = resolveTenantFromUrl(url, options);
      assert.deepStrictEqual(result, { tenant, slug, hostname: new URL(url).hostname });
    });
  }

  it('accepts URL objects', () => {
    envManager.set({ COCKPIT_SECRET_MYTENANT: 's' });
    assert.strictEqual(resolveTenantFromUrl(new URL('https://mytenant.sub.example.com/')).tenant, 'mytenant');
  });
});

describe('resolveApiKey', () => {
  const cases: [string, Record<string, string>, string | undefined, { apiKey?: string } | undefined, string | undefined][] = [
    ['prefers options.apiKey', { COCKPIT_SECRET_MYTENANT: 'env' }, 'mytenant', { apiKey: 'opt' }, 'opt'],
    ['treats an empty option as missing', { COCKPIT_SECRET: 'env' }, undefined, { apiKey: '' }, 'env'],
    ['treats an empty env var as missing', { COCKPIT_SECRET: '' }, undefined, undefined, undefined],
    ['uses COCKPIT_SECRET without tenant', { COCKPIT_SECRET: 'default' }, undefined, undefined, 'default'],
    ['upper-cases the tenant', { COCKPIT_SECRET_MYTENANT: 'tenant' }, 'MyTenant', undefined, 'tenant'],
    ['finds mixed-case names listed by getTenantIds', { COCKPIT_SECRET_MyTenant: 'mixed' }, 'mytenant', undefined, 'mixed'],
    ['prefers the exact upper-case name', { COCKPIT_SECRET_MyTenant: 'mixed', COCKPIT_SECRET_MYTENANT: 'upper' }, 'mytenant', undefined, 'upper'],
    ['trims env values; blank counts as missing', { COCKPIT_SECRET_T: '  k \n' }, 't', undefined, 'k'],
    ['treats a blank env var as missing', { COCKPIT_SECRET: '  ' }, undefined, undefined, undefined],
    ['never falls back to COCKPIT_SECRET for a tenant', { COCKPIT_SECRET: 'default' }, 'other', undefined, undefined],
  ];
  for (const [name, env, tenant, options, expected] of cases) {
    it(name, () => {
      envManager.set(env);
      assert.strictEqual(resolveApiKey(tenant, options), expected);
    });
  }
});
