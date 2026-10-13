import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Marked, type Tokens } from 'marked';

/** A registry.json entry, as tool/build_registry.dart writes it. */
export interface Listed {
  id: string;
  version: string;
  api?: number;
  /** Absent on pub packages, as are `requires` and `path`. */
  devpul?: string;
  description: string;
  tags: string[];
  icon?: string;
  usage: string[];
  requires?: Record<string, string>;
  /** A pub package, which `devpul add` adds with pub; `url` is its pub.dev page. */
  package?: string;
  url: string;
  path?: string;
}

export interface Registry {
  plugins: Listed[];
  readmes: Record<string, string>;
}

/** Reads the output of tool/build_registry.dart. */
export function readRegistry(dir: string): Registry {
  const { plugins } = JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8')) as { plugins: Listed[] };
  const readmes: Record<string, string> = {};
  for (const { id } of plugins) {
    const file = join(dir, 'readme', `${id}.md`);
    if (existsSync(file)) readmes[id] = readFileSync(file, 'utf8');
  }
  return { plugins, readmes };
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const external = (href: string) => /^(https?:|mailto:)/i.test(href);
const link = (href: string, inner: string) => `<a href="${escape(href)}" rel="nofollow ugc noopener">${inner}</a>`;

// READMEs come from third parties: HTML is dropped, links keep http(s) and
// mailto only, and images become links since the CSP blocks other hosts.
const readme = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const level = Math.min(depth + 1, 6);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    html: () => '',
    link({ href, tokens }) {
      const inner = this.parser.parseInline(tokens);
      return external(href) ? link(href, inner) : inner;
    },
    image: ({ href, text }) => (external(href) ? link(href, escape(text || href)) : escape(text)),
  },
});

/** A README as HTML that is safe to put on the site, without a leading title. */
export function renderReadme(markdown: string): string {
  const tokens = readme.lexer(markdown);
  const first = tokens.findIndex((t) => t.type !== 'space');
  if (tokens[first]?.type === 'heading' && (tokens[first] as Tokens.Heading).depth === 1) tokens.splice(first, 1);
  return readme.parser(tokens);
}

// Lucide's puzzle, for plugins without an icon.
const PUZZLE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/></svg>';

// A mask, not inline SVG: the SVG never runs as markup and takes the text color.
const iconOf = (p: Listed) =>
  `<span class="plugin-icon" style="mask-image: url(&quot;data:image/svg+xml;base64,${Buffer.from(p.icon ?? PUZZLE).toString('base64')}&quot;)"></span>`;

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// Wired up by src/components/MarkdownContent.astro.
const copyButton = (text: string) =>
  `<button type="button" class="copy-button" data-copy="${escape(text)}" title="Copy ${escape(text)}" aria-label="Copy ${escape(text)}">${svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>')}${svg('<path d="M20 6 9 17l-5-5"/>')}</button>`;

const tagsOf = (p: Listed) => p.tags.map((t) => `<span class="plugin-tag">${escape(t)}</span>`).join('');

const kindOf = (p: Listed) => (p.package ? '<span class="plugin-kind">pub</span>' : '');

const code = (s: string) => `<code>${escape(s)}</code>`;

/** A page in the docs collection: `plugins` and `plugins/<id>`. */
export interface Page {
  id: string;
  title: string;
  description: string;
  html: string;
}

/** The marketplace: `/plugins/` and a page per plugin. */
export function pluginPages({ plugins, readmes }: Registry): Page[] {
  const cards = plugins
    .map(
      (p) =>
        `<li><a href="/plugins/${p.id}/">${iconOf(p)}<strong>${escape(p.id)}</strong><span class="plugin-version">${escape(p.version)}</span>${kindOf(p)}</a><p>${escape(p.description)}</p><p>${tagsOf(p)}</p></li>`,
    )
    .join('');
  const index: Page = {
    id: 'plugins',
    title: 'Plugins',
    description: 'Plugins for DevPul: tabs for app state and adapters, installed with devpul add.',
    html: `<p><code>devpul add &lt;id&gt;</code> copies a plugin into your app, or runs <code>pub add</code> for a pub package. <a href="/docs/plugins/install/">Installing plugins</a> covers wiring and upgrades, <a href="/docs/plugins/#publishing">Writing plugins</a> how to list your own.</p>
${cards ? `<ul class="plugin-cards not-content">${cards}</ul>` : '<p>No plugins listed yet.</p>'}`,
  };

  return [
    index,
    ...plugins.map((p) => {
      const requires = Object.entries(p.requires ?? {}).map(([name, range]) => code(`${name} ${range}`));
      const source = external(p.url) ? link(p.url, escape(p.url)) : escape(p.url);
      const rows = [
        ['Install', code(`devpul add ${p.id}`) + (p.package ? ` runs ${code(`pub add ${p.package}`)}` : '')],
        ['Wiring', p.usage.map(code).join('<br />')],
        ['Tab', p.api ? 'Yes' : 'No, sends events to the built-in tabs'],
        ['devpul', p.devpul && code(p.devpul)],
        ['Requires', requires.join('<br />')],
        p.package
          ? ['Package', link(p.url, escape(p.package))]
          : ['Source', p.path ? `${source} ${code(p.path)}` : source],
      ].filter(([, value]) => value);
      const text = readmes[p.id];
      return {
        id: `plugins/${p.id}`,
        title: p.id,
        description: p.description,
        html: `<p class="plugin-meta not-content">${iconOf(p)}<span class="plugin-version">${escape(p.version)}</span>${kindOf(p)}${copyButton(`devpul add ${p.id}`)}${tagsOf(p)}</p>
<p>${escape(p.description)}</p>
<table><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
${text ? renderReadme(text) : ''}`,
      };
    }),
  ];
}
