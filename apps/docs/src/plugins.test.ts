import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pluginPages, renderReadme, type Registry } from './plugins.ts';

const registry: Registry = {
  plugins: JSON.parse(readFileSync(new URL('../../../contract/registry.json', import.meta.url), 'utf8')).plugins,
  readmes: { cart: '# Cart\n\nShows the cart.\n\n## Usage\n' },
};

describe('renderReadme', () => {
  it('drops HTML and unsafe links', () => {
    const html = renderReadme(
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

  it('drops a leading title and moves headings down a level', () => {
    expect(renderReadme('# A\n\nText\n\n# B\n## C')).toBe('<p>Text</p>\n<h2>B</h2>\n<h3>C</h3>\n');
  });
});

describe('pluginPages', () => {
  const pages = pluginPages(registry);

  it('writes the index and a page per plugin', () => {
    expect(pages.map((p) => p.id)).toEqual(['plugins', 'plugins/cart', 'plugins/flags', 'plugins/net']);
    expect(pages[0]?.html).toContain('<a href="/plugins/cart/">');
  });

  it('shows icons as masks and the README', () => {
    const cart = pages[1]?.html ?? '';
    expect(cart).toContain('mask-image: url(&quot;data:image/svg+xml;base64,');
    expect(cart).not.toContain('cx="8" cy="21"');
    expect(cart).toContain('<code>devpul add cart</code>');
    expect(cart).toContain('data-copy="devpul add cart"');
    expect(cart).toContain('<p>Shows the cart.</p>\n<h3>Usage</h3>');
    expect(pages[2]?.html).not.toContain('<h3>');
  });

  it('links a pub package and the pub add it runs', () => {
    const net = pages[3]?.html ?? '';
    expect(net).toContain('<code>devpul add net</code> runs <code>pub add example_net</code>');
    expect(net).toContain('<td>Package</td><td><a href="https://pub.dev/packages/example_net"');
    expect(net).not.toContain('<td>devpul</td>');
    expect(net).toContain('<span class="plugin-kind">pub</span>');
    expect(pages[0]?.html).toContain(
      '<span class="plugin-version">2.1.0</span><span class="plugin-kind">pub</span></a>',
    );
    expect(pages[1]?.html).not.toContain('plugin-kind');
  });
});
