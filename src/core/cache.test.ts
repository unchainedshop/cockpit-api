import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCacheManager } from './cache.ts';

describe('createCacheManager', () => {
  it('stores and retrieves values with prefix', () => {
    const cache = createCacheManager('test:prefix:');
    cache.set('key1', { data: 'value1' });

    const result = cache.get<{ data: string }>('key1');
    assert.deepStrictEqual(result, { data: 'value1' });
  });

  it('returns undefined for missing keys', () => {
    const cache = createCacheManager('test:prefix:');
    const result = cache.get<string>('nonexistent');
    assert.strictEqual(result, undefined);
  });

  it('clears all entries without pattern', () => {
    const cache = createCacheManager('test:prefix:');
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    cache.clear();

    assert.strictEqual(cache.get('key1'), undefined);
    assert.strictEqual(cache.get('key2'), undefined);
    assert.strictEqual(cache.get('key3'), undefined);
  });

  it('clears entries matching pattern', () => {
    const cache = createCacheManager('test:prefix:');
    cache.set('ROUTE_key1', 'value1');
    cache.set('ROUTE_key2', 'value2');
    cache.set('OTHER_key3', 'value3');

    cache.clear('ROUTE');

    assert.strictEqual(cache.get('ROUTE_key1'), undefined);
    assert.strictEqual(cache.get('ROUTE_key2'), undefined);
    assert.strictEqual(cache.get<string>('OTHER_key3'), 'value3');
  });

  it('uses custom max and ttl options', () => {
    const cache = createCacheManager('test:', { max: 2, ttl: 1000 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3'); // Should evict key1

    // key3 should exist, key1 may have been evicted
    assert.strictEqual(cache.get<string>('key3'), 'value3');
  });
});
