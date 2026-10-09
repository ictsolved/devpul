import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Puzzle } from 'lucide-react';
import { Marked, type Tokens } from 'marked';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { codeBlock, escape, shell, sideGroup, type Site } from './render.ts';

/** A registry.json entry, as tool/build_registry.dart writes it. */
export interface Listed {
  id: string;
  version: string;
  api?: number;
  devpul: string;
  description: string;
  tags: string[];
  icon?: string;
  usage: string[];
  requires: Record<string, string>;
  url: string;
  path?: string;
}

export interface Registry {
  /** registry.json as built, served as is. */
  json: string;
  plugins: Listed[];
  readmes: Record<string, string>;
}

/** Reads the output of tool/build_registry.dart. */
export function readRegistry(dir: string): Registry {
  const json = readFileSync(join(dir, 'registry.json'), 'utf8');
  const { plugins } = JSON.parse(json) as { plugins: Listed[] };
  const readmes: Record<string, string> = {};
  for (const { id } of plugins) {
    const file = join(dir, 'readme', `${id}.md`);
    if (existsSync(file)) readmes[id] = readFileSync(file, 'utf8');
  }
  return { json, plugins, readmes };
}

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
    code: ({ text, lang }) => codeBlock(text, lang),
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

const puzzle = renderToStaticMarkup(createElement(Puzzle, { size: 20, className: 'plugin-icon' }));

// A mask, not inline SVG: the SVG never runs as markup and takes the text color.
const iconOf = (p: Listed) =>
  p.icon
    ? `<span class="plugin-icon" style="mask-image: url(&quot;data:image/svg+xml;base64,${Buffer.from(p.icon).toString('base64')}&quot;)"></span>`
    : puzzle;

const tagsOf = (p: Listed) =>
  p.tags.length ? `<p class="tags">${p.tags.map((t) => `<span>${escape(t)}</span>`).join('')}</p>` : '';

const code = (s: string) => `<code>${escape(s)}</code>`;

/** The marketplace: `plugins/` and a page per plugin. */
export function pluginPages({ plugins, readmes }: Registry, site: Site, csp: string): { path: string; html: string }[] {
  const side = (path: string) =>
    sideGroup(
      'Plugins',
      [{ href: 'plugins/', label: 'All plugins' }, ...plugins.map((p) => ({ href: `plugins/${p.id}/`, label: p.id }))],
      path,
    ) +
    sideGroup(
      'Docs',
      [
        { href: 'docs/plugins/', label: 'Using plugins' },
        { href: 'docs/plugins/format/', label: 'Plugin format' },
      ],
      path,
    );

  const cards = plugins
    .map(
      (p) =>
        `<li><a href="${p.id}/">${iconOf(p)}<strong>${escape(p.id)}</strong><span class="version">${escape(p.version)}</span></a><p>${escape(p.description)}</p>${tagsOf(p)}</li>`,
    )
    .join('');
  const index = {
    path: 'plugins/',
    html: shell({
      path: 'plugins/',
      site,
      csp,
      title: 'Plugins',
      description: 'Plugins for DevPul: tabs for app state and adapters, installed with devpul add.',
      side: side('plugins/'),
      main: `<h1>Plugins</h1>
        <p><code>devpul add &lt;id&gt;</code> copies a plugin into your app. <a href="../docs/plugins/">Using plugins</a> covers how they run, <a href="../docs/plugins/format/">Plugin format</a> how to list your own.</p>
        ${cards ? `<ul class="plugins">${cards}</ul>` : '<p>No plugins listed yet.</p>'}`,
    }),
  };

  return [
    index,
    ...plugins.map((p) => {
      const path = `plugins/${p.id}/`;
      const requires = Object.entries(p.requires).map(([name, range]) => code(`${name} ${range}`));
      const source = external(p.url) ? link(p.url, escape(p.url)) : escape(p.url);
      const rows = [
        ['Install', code(`devpul add ${p.id}`)],
        ['Wiring', p.usage.map(code).join('<br />')],
        ['Tab', p.api ? 'Yes' : 'No, sends events to the built-in tabs'],
        ['devpul', code(p.devpul)],
        ['Requires', requires.join('<br />')],
        ['Source', p.path ? `${source} ${code(p.path)}` : source],
      ].filter(([, value]) => value);
      const text = readmes[p.id];
      return {
        path,
        html: shell({
          path,
          site,
          csp,
          title: `${p.id} plugin`,
          description: p.description,
          side: side(path),
          main: `<h1 class="plugin-title">${iconOf(p)}${escape(p.id)}<span class="version">${escape(p.version)}</span></h1>
        <p>${escape(p.description)}</p>
        ${tagsOf(p)}
        <table class="facts"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
        ${text ? `<div class="readme">${renderReadme(text)}</div>` : ''}`,
        }),
      };
    }),
  ];
}
