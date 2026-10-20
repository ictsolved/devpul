import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pluginPages, renderReadme, type Registry } from './plugins.ts';

const registry: Registry = {
  plugins: JSON.parse(readFileSync(new URL('../../../contract/registry.json', import.meta.url), 'utf8')).plugins,
  readmes: { cart: '# Cart\n\nShows the cart.\n\n## Usage\n' },
};

describe('renderReadme', () => {
  it('drops HTML and unsafe links', async () => {
    const html = await renderReadme(
      [
        '<script>alert(1)</script>',
        '',
        'Text <img src=x onerror=alert(1)> and <b>bold</b>.',
        '',
        '[js](javascript:alert(1)) [rel](docs/a.md) [web](https://example.com/a "t")',
        '',
        '![badge](https://example.com/b.svg) ![local](b.png)',
        '',
        '```html',
        '<script>x</script>',
        '```',
      ].join('\n'),
    );
    expect(html).not.toMatch(/<script|<img|<b>|onerror=|javascript:/);
    expect(html).toContain('rel <a href="https://example.com/a" rel="nofollow ugc noopener">web</a>');
    expect(html).toContain('<a href="https://example.com/b.svg" rel="nofollow ugc noopener">badge</a> local');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('drops a leading title and moves headings down a level', async () => {
    expect(await renderReadme('# A\n\nText\n\n# B\n## C')).toBe('<p>Text</p>\n<h2>B</h2>\n<h3>C</h3>\n');
  });

  it('hands code blocks to the site pipeline with only a plain language', async () => {
    const fences: string[] = [];
    const html = await renderReadme(
      ['```dart title="<x>"', 'a ```` b', '```', '', '- ```js;alert(1)', '  c', '  ```', '', 'e', '', '    d'].join(
        '\n',
      ),
      async (markdown) => `<figure>${fences.push(markdown)}</figure>`,
    );
    expect(fences).toEqual(['`````dart\na ```` b\n`````\n', '```\nc\n```\n', '```\nd\n```\n']);
    expect(html).toBe('<figure>1</figure><ul>\n<li><figure>2</figure></li>\n</ul>\n<p>e</p>\n<figure>3</figure>');
  });
});

describe('pluginPages', async () => {
  const pages = await pluginPages(registry);

  it('writes the index and a page per plugin', () => {
    expect(pages.map((p) => p.id)).toEqual(['plugins', 'plugins/cart', 'plugins/flags', 'plugins/net']);
    expect(pages[0]?.html).toContain('<a href="/plugins/cart/">');
    expect(pages[0]?.html).toContain('/issues/new?template=plugin_request.yml">Request a plugin</a>');
    expect(pages[0]?.html).toContain('<time datetime="2026-01-15T09:30:00.000Z">Jan 15, 2026</time></p></li>');
  });

  it('shows the icon, version and install copy beside the title, and the README', () => {
    const { heading, html: cart = '' } = pages[1] ?? {};
    expect(heading?.before).toContain('mask-image: url(&quot;data:image/svg+xml;base64,');
    expect(heading?.before).not.toContain('cx="8" cy="21"');
    expect(heading?.after).toContain('<span class="plugin-version">1.3.0</span>');
    expect(heading?.after).toContain('data-copy="devpul add cart"');
    expect(cart).toContain('<code>devpul add cart</code>');
    expect(cart).toContain('<p>Shows the cart.</p>\n<h3>Usage</h3>');
    expect(pages[2]?.html).not.toContain('<h3>');
    expect(pages[0]?.heading).toBeUndefined();
  });

  it('shows when the version was published', () => {
    expect(pages[1]?.heading?.below).toBe(
      '<span>Published <time datetime="2026-01-15T09:30:00.000Z">Jan 15, 2026</time></span><span class="plugin-tag">shop</span><span class="plugin-tag">state</span>',
    );
    expect(pages[2]?.heading?.below).toBe('');
  });

  it('links the source folder at its tag on GitHub', async () => {
    const [, cart] = await pluginPages({
      plugins: [{ ...registry.plugins[0]!, url: 'https://github.com/example/plugins.git' }],
      readmes: {},
    });
    expect(cart?.html).toContain(
      '<td>Source</td><td><a href="https://github.com/example/plugins/tree/cart-v1.3.0/cart" rel="nofollow ugc noopener">example/plugins/cart</a></td>',
    );
    expect(pages[1]?.html).toContain(
      '<td>Source</td><td><a href="https://example.com/plugins.git" rel="nofollow ugc noopener">https://example.com/plugins.git</a> <code>cart</code></td>',
    );
  });

  it('links required packages to pub.dev', async () => {
    const [, cart] = await pluginPages({
      plugins: [{ ...registry.plugins[0]!, requires: { collection: '^1.18.0' } }],
      readmes: {},
    });
    expect(cart?.html).toContain(
      '<td>Requires</td><td><a href="https://pub.dev/packages/collection" rel="nofollow ugc noopener"><code>collection</code></a> ^1.18.0</td>',
    );
  });

  it('links a pub package and the pub add it runs', () => {
    const net = pages[3]?.html ?? '';
    expect(net).toContain('<code>devpul add net</code> runs <code>pub add example_net</code>');
    expect(net).toContain('<td>Package</td><td><a href="https://pub.dev/packages/example_net"');
    expect(net).not.toContain('<td>devpul</td>');
    expect(pages[3]?.heading?.below).toContain('<span class="plugin-kind">pub</span>');
    expect(pages[0]?.html).toContain(
      '<span class="plugin-version">2.1.0</span><span class="plugin-kind">pub</span></a>',
    );
    expect(pages[1]?.heading?.below).not.toContain('plugin-kind');
  });
});
