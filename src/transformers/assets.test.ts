import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAssetFixer, type AssetFixerOptions } from './assets.ts';

const ORIGIN = 'https://cms.example.com';
/** Fixes a private copy, like the HTTP client does with parsed responses */
const fix = <T>(value: T, options: AssetFixerOptions): T => createAssetFixer(options)(structuredClone(value));

/**
 * A realistic Cockpit asset object, shaped like the ones produced by
 * modules/Assets/bootstrap.php (assets:add) and embedded into content items.
 */
const asset = (path: string, extra: Record<string, unknown> = {}) => ({
  path,
  title: 'Image',
  mime: 'image/jpeg',
  type: 'image',
  description: '',
  tags: [],
  size: 12345,
  colors: null,
  width: 800,
  height: 600,
  _hash: 'd41d8cd98f00b204e9800998ecf8427e',
  _created: 1700000000,
  _modified: 1700000000,
  _cby: 'user-id',
  _id: 'asset-id',
  ...extra,
});

describe('createAssetFixer', () => {
  describe('asset "path" fields', () => {
    it('prefixes asset paths with the storage/uploads URL', () => {
      assert.deepStrictEqual(
        fix({ image: asset('/2024/01/img.jpg') }, { baseUrl: ORIGIN }),
        { image: asset(`${ORIGIN}/storage/uploads/2024/01/img.jpg`) },
      );
    });

    it('adds the tenant segment to asset paths', () => {
      assert.deepStrictEqual(
        fix({ image: asset('/2024/01/img.jpg') }, {
          baseUrl: ORIGIN,
          tenant: 'acme',
        }),
        { image: asset(`${ORIGIN}/:acme/storage/uploads/2024/01/img.jpg`) },
      );
    });

    it('emits host-relative asset paths with an empty baseUrl', () => {
      assert.deepStrictEqual(
        fix(asset('/2024/01/img.jpg'), { baseUrl: '' }),
        asset('/storage/uploads/2024/01/img.jpg'),
      );
      assert.deepStrictEqual(
        fix(asset('/2024/01/img.jpg'), { baseUrl: '', tenant: 'acme' }),
        asset('/:acme/storage/uploads/2024/01/img.jpg'),
      );
    });

    it('does not double the storage prefix', () => {
      assert.deepStrictEqual(
        fix(asset('/storage/uploads/2024/01/img.jpg'), { baseUrl: ORIGIN }),
        asset(`${ORIGIN}/storage/uploads/2024/01/img.jpg`),
      );
    });

    it('leaves absolute and protocol-relative asset paths alone', () => {
      const input = [
        asset('https://cdn.example.com/img.jpg'),
        asset('//cdn.example.com/img.jpg'),
      ];
      assert.deepStrictEqual(fix(input, { baseUrl: ORIGIN }), input);
    });

    it('rewrites assets nested in arrays and galleries', () => {
      const input = {
        gallery: [asset('/a.jpg'), asset('/b.jpg')],
        layout: [
          { component: 'image', data: { image: asset('/c.jpg') } },
          { component: 'grid', children: [{ data: { files: [asset('/d.pdf', { mime: 'application/pdf' })] } }] },
        ],
      };
      const expected = {
        gallery: [asset(`${ORIGIN}/storage/uploads/a.jpg`), asset(`${ORIGIN}/storage/uploads/b.jpg`)],
        layout: [
          { component: 'image', data: { image: asset(`${ORIGIN}/storage/uploads/c.jpg`) } },
          {
            component: 'grid',
            children: [
              { data: { files: [asset(`${ORIGIN}/storage/uploads/d.pdf`, { mime: 'application/pdf' })] } },
            ],
          },
        ],
      };
      assert.deepStrictEqual(fix(input, { baseUrl: ORIGIN }), expected);
    });

    it('leaves "path" fields on non-asset objects alone', () => {
      const input = {
        path: '/about-us',
        seo: { path: '/de/kontakt' },
        items: [{ title: 'x', path: '/de/x' }],
        route: { _id: 'abc', path: '/de/y' },
      };
      assert.deepStrictEqual(fix(input, { baseUrl: ORIGIN }), input);
    });
  });

  describe('src/href attributes', () => {
    it('prefixes host-relative src and href storage URLs with the origin', () => {
      const html = '<a href="/storage/uploads/2024/01/doc.pdf"><img src="/storage/uploads/2024/01/img.jpg"></a>';
      assert.deepStrictEqual(
        fix({ html }, { baseUrl: ORIGIN }),
        {
          html: `<a href="${ORIGIN}/storage/uploads/2024/01/doc.pdf"><img src="${ORIGIN}/storage/uploads/2024/01/img.jpg"></a>`,
        },
      );
    });

    // src/href values are host-relative URLs that already carry whatever prefix
    // Cockpit emitted (including a "/:tenant" segment), so only the origin is
    // prepended there. Adding the tenant again would yield "/:acme/:acme/...".
    it('does not add the tenant to src/href URLs, preserving their own prefix', () => {
      const html =
        '<img src="/:acme/storage/uploads/a.jpg"><a href="/:acme/storage/uploads/b.pdf">b</a><img src="/storage/uploads/c.jpg">';
      assert.deepStrictEqual(
        fix({ html }, { baseUrl: ORIGIN, tenant: 'acme' }),
        {
          html: `<img src="${ORIGIN}/:acme/storage/uploads/a.jpg"><a href="${ORIGIN}/:acme/storage/uploads/b.pdf">b</a><img src="${ORIGIN}/storage/uploads/c.jpg">`,
        },
      );
    });

    it('prefixes un-rewritten "/.spaces/<space>/storage" URLs with the origin', () => {
      const html = '<img src="/.spaces/acme/storage/uploads/a.jpg">';
      assert.deepStrictEqual(
        fix({ html }, { baseUrl: ORIGIN, tenant: 'acme' }),
        { html: `<img src="${ORIGIN}/.spaces/acme/storage/uploads/a.jpg">` },
      );
    });

    it('prefixes storage cache (thumbnail) URLs with the origin', () => {
      const html = '<img src="/storage/cache/thumbs/abc.webp">';
      assert.deepStrictEqual(
        fix({ html }, { baseUrl: ORIGIN }),
        { html: `<img src="${ORIGIN}/storage/cache/thumbs/abc.webp">` },
      );
    });

    it('leaves src/href URLs unchanged with an empty baseUrl', () => {
      const input = { html: '<img src="/storage/uploads/a.jpg"><a href="/storage/uploads/b.pdf">b</a>' };
      assert.deepStrictEqual(fix(input, { baseUrl: '' }), input);
    });

    it('leaves non-storage and absolute src/href URLs alone', () => {
      const input = {
        html: '<a href="/de/kontakt">x</a><img src="https://cdn.example.com/storage/img.jpg">',
      };
      assert.deepStrictEqual(fix(input, { baseUrl: ORIGIN }), input);
    });

    it('leaves links that merely contain "storage" alone, preserving case', () => {
      const input = {
        html:
          '<a href="/de/self-storage">a</a><a href="/products/Storage-Boxes">b</a>' +
          '<a href="/x/storagefoo">c</a><img src="/img/STORAGE/a.jpg"><a href="/de/storage-loesungen/x">d</a><a href="/products/storage/boxes">e</a>',
      };
      assert.deepStrictEqual(fix(input, { baseUrl: ORIGIN }), input);
    });

    it('leaves protocol-relative src/href URLs alone', () => {
      const input = {
        html: '<img src="//cdn.example.com/storage/uploads/a.jpg"><a href="//cdn.example.com/storage/uploads/b.pdf">b</a>',
      };
      assert.deepStrictEqual(fix(input, { baseUrl: ORIGIN }), input);
    });
  });

  describe('walk', () => {
    it('fixes in place and returns the same reference', () => {
      const input = { image: asset('/a.jpg') };
      assert.strictEqual(createAssetFixer({ baseUrl: ORIGIN })(input), input);
      assert.strictEqual(input.image.path, `${ORIGIN}/storage/uploads/a.jpg`);
    });

    it('collapses doubled storage/uploads segments in any string', () => {
      assert.deepStrictEqual(
        fix({ url: 'https://example.com/storage/uploads/storage/uploads/image.jpg' }, { baseUrl: ORIGIN }),
        { url: 'https://example.com/storage/uploads/image.jpg' },
      );
    });

    it('handles top-level strings and primitives', () => {
      const fixer = createAssetFixer({ baseUrl: ORIGIN });
      assert.strictEqual(fixer('<img src="/storage/a.png">'), `<img src="${ORIGIN}/storage/a.png">`);
      assert.strictEqual(fixer(42), 42);
      assert.strictEqual(fixer(null), null);
    });

    it('never rewrites object keys and leaves page links alone', () => {
      const input = { 'src="/storage/x"': 'pages://p1', deep: [[{ html: 'see pages://p1' }]] };
      assert.deepStrictEqual(fix(input, { baseUrl: ORIGIN }), input);
    });
  });
});
