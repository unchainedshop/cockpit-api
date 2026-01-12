import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildQueryString, encodeQueryParam } from './query-string.ts';

describe('query-string', () => {
  describe('encodeQueryParam', () => {
    it('encodes string values', () => {
      const result = encodeQueryParam('name', 'hello world');
      assert.strictEqual(result, 'name=hello%20world');
    });

    it('JSON stringifies non-string values', () => {
      const result = encodeQueryParam('filter', { active: true });
      assert.strictEqual(result, 'filter=%7B%22active%22%3Atrue%7D');
    });
  });

  describe('buildQueryString', () => {
    it('builds query string from params', () => {
      const result = buildQueryString({ a: 'foo', b: 'bar' });
      assert.strictEqual(result, 'a=foo&b=bar');
    });

    it('filters out null values', () => {
      const result = buildQueryString({ a: 'foo', b: null, c: 'baz' });
      assert.strictEqual(result, 'a=foo&c=baz');
    });

    it('filters out undefined values', () => {
      const result = buildQueryString({ a: 'foo', b: undefined, c: 'baz' });
      assert.strictEqual(result, 'a=foo&c=baz');
    });

    it('returns null when all values are null or undefined', () => {
      const result = buildQueryString({ a: null, b: undefined });
      assert.strictEqual(result, null);
    });
  });
});
