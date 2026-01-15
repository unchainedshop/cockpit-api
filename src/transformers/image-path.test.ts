import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TEST_ENDPOINT } from '../__tests__/test-helpers.ts';
import { createImagePathTransformer, identityTransformer } from './image-path.ts';
import { createAssetPathTransformer } from './asset-path.ts';
import { createPageLinkTransformer } from './page-link.ts';

describe('createImagePathTransformer', () => {
  describe('transformResult', () => {
    it('fixes "path":"/ to include storage URL', () => {
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements: {},
      });
      // When JSON.stringify runs, "path":"/" becomes "path":"/" in the string
      // The regex matches "path":"/ and replaces it
      const input = { image: { path: '/uploads/image.jpg' } };
      const result = transformer.transform(input);
      // The path gets prefixed with storage URL
      assert.ok(result.image.path.includes('https://test.cockpit.com'));
      assert.ok(result.image.path.includes('storage/uploads'));
    });

    it('fixes src attribute paths in HTML content', () => {
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements: {},
      });
      const input = { html: '<img src="/storage/uploads/image.jpg" />' };
      const result = transformer.transform(input);
      // The path transformation adds the base URL to storage paths
      assert.strictEqual(result.html, '<img src="https://test.cockpit.com/storage/uploads/image.jpg" />');
    });

    it('replaces pages:// links with actual routes', () => {
      const replacements = {
        'pages://abc123': '/about',
        'pages://def456': '/contact',
      };
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements,
      });
      const input = { link: 'pages://abc123', other: 'pages://def456' };
      const result = transformer.transform(input);
      assert.strictEqual(result.link, '/about');
      assert.strictEqual(result.other, '/contact');
    });

    it('handles empty replacements object gracefully', () => {
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements: {},
      });
      const input = { text: 'pages://unknown-id' };
      const result = transformer.transform(input);
      // No replacement defined, so it stays as-is
      assert.strictEqual(result.text, 'pages://unknown-id');
    });

    it('fixes double storage/uploads paths', () => {
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements: {},
      });
      // The code has a regex that removes duplicate /storage/uploads/ sequences
      // Input has the pattern in a way that triggers the fix
      const input = { url: 'https://example.com/storage/uploads/storage/uploads/image.jpg' };
      const result = transformer.transform(input);
      // Should be normalized - the double pattern gets reduced
      assert.ok(result.url.includes('/storage/uploads/'));
      assert.ok(!result.url.includes('/storage/uploads/storage/uploads/'));
    });

    it('returns original on JSON parse error', () => {
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements: {},
      });
      // Circular reference causes JSON.stringify to fail
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const result = transformer.transform(circular);
      assert.strictEqual(result, circular);
    });

    it('works with deeply nested objects', () => {
      const replacements = { 'pages://id1': '/page1' };
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements,
      });
      const input = {
        level1: {
          level2: {
            level3: {
              link: 'pages://id1',
            },
          },
        },
      };
      const result = transformer.transform(input);
      assert.strictEqual(result.level1.level2.level3.link, '/page1');
    });

    it('works with arrays of objects', () => {
      const replacements = { 'pages://id1': '/page1' };
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements,
      });
      const input = {
        items: [
          { link: 'pages://id1' },
          { link: 'pages://id1' },
        ],
      };
      const result = transformer.transform(input);
      assert.strictEqual(result.items[0].link, '/page1');
      assert.strictEqual(result.items[1].link, '/page1');
    });

    it('preserves non-matching content', () => {
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements: {},
      });
      const input = {
        text: 'Hello World',
        number: 42,
        bool: true,
        arr: [1, 2, 3],
      };
      const result = transformer.transform(input);
      assert.strictEqual(result.text, 'Hello World');
      assert.strictEqual(result.number, 42);
      assert.strictEqual(result.bool, true);
      assert.deepStrictEqual(result.arr, [1, 2, 3]);
    });

    it('handles null and undefined values', () => {
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements: {},
      });
      const input = { a: null, b: undefined, c: 'text' };
      const result = transformer.transform(input);
      assert.strictEqual(result.a, null);
      assert.strictEqual(result.b, undefined);
      assert.strictEqual(result.c, 'text');
    });

    it('handles multiple replacements in same string', () => {
      const replacements = {
        'pages://id1': '/page1',
        'pages://id2': '/page2',
      };
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements,
      });
      const input = { text: 'Link to pages://id1 and pages://id2' };
      const result = transformer.transform(input);
      assert.strictEqual(result.text, 'Link to /page1 and /page2');
    });

    it('keeps original link when replacement value is undefined', () => {
      const replacements: Record<string, string> = {
        'pages://id1': '/page1',
        'pages://id2': undefined as unknown as string,
      };
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements,
      });
      const input = { link1: 'pages://id1', link2: 'pages://id2' };
      const result = transformer.transform(input);
      assert.strictEqual(result.link1, '/page1');
      // Undefined replacement falls back to original match
      assert.strictEqual(result.link2, 'pages://id2');
    });
  });

  describe('with tenant', () => {
    it('includes tenant in URL when provided', () => {
      const transformer = createImagePathTransformer({
        baseUrl: TEST_ENDPOINT,
        replacements: {},
        tenant: 'mytenant',
      });
      const input = { image: { path: '/uploads/image.jpg' } };
      const result = transformer.transform(input);
      // Note: The tenant format is `:${tenant}` in the URL
      assert.ok(result.image.path.includes(':mytenant'));
    });
  });
});

describe('identityTransformer', () => {
  it('returns input unchanged', () => {
    const input = { foo: 'bar', num: 42 };
    const result = identityTransformer.transform(input);
    assert.strictEqual(result, input);
  });
});

describe('createAssetPathTransformer', () => {
  it('fixes asset paths in responses', () => {
    const transformer = createAssetPathTransformer({
      baseUrl: 'https://test.cockpit.com',
    });
    const input = { image: { path: '/uploads/image.jpg' } };
    const result = transformer.transform(input);
    assert.ok(result.image.path.includes('https://test.cockpit.com'));
    assert.ok(result.image.path.includes('storage/uploads'));
  });

  it('includes tenant in URL when provided', () => {
    const transformer = createAssetPathTransformer({
      baseUrl: 'https://test.cockpit.com',
      tenant: 'mytenant',
    });
    const input = { image: { path: '/uploads/image.jpg' } };
    const result = transformer.transform(input);
    assert.ok(result.image.path.includes(':mytenant'));
  });

  it('fixes src attribute paths', () => {
    const transformer = createAssetPathTransformer({
      baseUrl: 'https://test.cockpit.com',
    });
    const input = { html: '<img src="/storage/uploads/image.jpg" />' };
    const result = transformer.transform(input);
    assert.strictEqual(
      result.html,
      '<img src="https://test.cockpit.com/storage/uploads/image.jpg" />',
    );
  });

  it('returns original on JSON parse error', () => {
    const transformer = createAssetPathTransformer({
      baseUrl: 'https://test.cockpit.com',
    });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = transformer.transform(circular);
    assert.strictEqual(result, circular);
  });
});

describe('createPageLinkTransformer', () => {
  it('replaces page links with actual routes', () => {
    const transformer = createPageLinkTransformer({
      'pages://abc123': '/about',
      'pages://def456': '/contact',
    });
    const input = { link: 'pages://abc123', other: 'pages://def456' };
    const result = transformer.transform(input);
    assert.strictEqual(result.link, '/about');
    assert.strictEqual(result.other, '/contact');
  });

  it('returns input unchanged when no replacements', () => {
    const transformer = createPageLinkTransformer({});
    const input = { text: 'pages://unknown-id' };
    const result = transformer.transform(input);
    assert.strictEqual(result.text, 'pages://unknown-id');
  });

  it('handles multiple replacements in same string', () => {
    const transformer = createPageLinkTransformer({
      'pages://id1': '/page1',
      'pages://id2': '/page2',
    });
    const input = { text: 'Link to pages://id1 and pages://id2' };
    const result = transformer.transform(input);
    assert.strictEqual(result.text, 'Link to /page1 and /page2');
  });

  it('returns original on JSON parse error', () => {
    const transformer = createPageLinkTransformer({
      'pages://id1': '/page1',
    });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = transformer.transform(circular);
    assert.strictEqual(result, circular);
  });
});
