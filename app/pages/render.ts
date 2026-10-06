import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import dart from 'highlight.js/lib/languages/dart';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import { ChevronLeft, ChevronRight, Monitor, Moon, Sun } from 'lucide-react';
import { Marked, type Token, type Tokens } from 'marked';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export interface Site {
  url: string;
  repo: string;
}

interface Entry {
  /** Output path, '' for the site root, always ending in '/'. */
  path: string;
  file: string;
  group: string;
}

export const PAGES: Entry[] = [
  { path: 'docs/', file: 'start.md', group: 'Guide' },
  { path: 'docs/connecting/', file: 'connecting.md', group: 'Guide' },
  { path: 'docs/ui/', file: 'ui.md', group: 'Guide' },
  { path: 'docs/api/', file: 'api.md', group: 'Packages' },
  { path: 'docs/dio/', file: 'dio.md', group: 'Packages' },
  { path: 'docs/http/', file: 'http.md', group: 'Packages' },
  { path: 'docs/flutter/', file: 'flutter.md', group: 'Packages' },
  { path: 'docs/plugins/', file: 'plugins.md', group: 'Extend' },
  { path: 'docs/adapters/', file: 'adapters.md', group: 'Extend' },
  { path: 'docs/events/', file: 'events.md', group: 'Extend' },
  { path: 'help/', file: 'help.md', group: 'Help' },
];

const dir = import.meta.dirname;

interface Parsed {
  title: string;
  description: string;
  body: string;
}

function parse(file: string): Parsed {
  const text = readFileSync(join(dir, file), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m?.[1]) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(
    m[1].split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
  if (!meta.title || !meta.description) throw new Error(`${file}: needs title and description`);
  return { title: meta.title, description: meta.description, body: text.slice(m[0].length) };
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>|`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const plain = (s: string) =>
  s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/** Questions are the h3s under "## Questions"; answers are the paragraphs below them. */
function faq(tokens: Token[]): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  let inside = false;
  for (const t of tokens) {
    if (t.type === 'heading') {
      const h = t as Tokens.Heading;
      if (h.depth === 2) inside = h.text === 'Questions';
      else if (inside && h.depth === 3) out.push({ q: plain(h.text), a: '' });
    } else if (inside && t.type === 'paragraph') {
      const last = out.at(-1);
      if (last) last.a = `${last.a} ${plain((t as Tokens.Paragraph).text)}`.trim();
    }
  }
  return out;
}

hljs.registerLanguage('dart', dart);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);

const themeIcons = [
  ['system', Monitor],
  ['light', Sun],
  ['dark', Moon],
] as const;
const themeButton = themeIcons
  .map(([theme, icon]) => renderToStaticMarkup(createElement(icon, { size: 14, className: `for-${theme}` })))
  .join('');

const chevronLeft = renderToStaticMarkup(createElement(ChevronLeft, { size: 14 }));
const chevronRight = renderToStaticMarkup(createElement(ChevronRight, { size: 14 }));

const markdown = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth, text }) {
      const id = slug(text);
      const inner = this.parser.parseInline(tokens);
      if (depth === 1) return `<h1>${inner}</h1>\n`;
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${inner}</a></h${depth}>\n`;
    },
    code({ text, lang }) {
      const html = lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }).value : escape(text);
      return `<pre><code>${html}</code></pre>\n`;
    },
  },
});

const read = (file: string) => readFileSync(join(dir, file), 'utf8');

export function renderPage(path: string, site: Site): string | null {
  const index = PAGES.findIndex((p) => p.path === path);
  const entry = PAGES[index];
  if (!entry) return null;
  const page = parse(entry.file);
  const depth = path.split('/').filter(Boolean).length;
  const root = depth ? '../'.repeat(depth) : './';
  const body = page.body
    .replaceAll('%ROOT%', root)
    .replaceAll('%SITE_URL%', site.url)
    .replaceAll('%REPO_URL%', site.repo);
  const tokens = markdown.lexer(body);
  const html = markdown.parser(tokens);
  const questions = faq(tokens);
  const ld = questions.length
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: questions.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      })}</script>`
    : '';

  const groups = [...new Set(PAGES.map((p) => p.group))];
  const side = groups
    .map((g) => {
      const links = PAGES.filter((p) => p.group === g)
        .map((p) => {
          const current = p.path === path ? ' aria-current="page"' : '';
          return `<li><a href="${root}${p.path}"${current}>${escape(parse(p.file).title)}</a></li>`;
        })
        .join('');
      return `<h2>${g}</h2><ul>${links}</ul>`;
    })
    .join('');
  const prev = PAGES[index - 1];
  const next = PAGES[index + 1];
  const pager = [
    prev ? `<a href="${root}${prev.path}">${chevronLeft}${escape(parse(prev.file).title)}</a>` : '<span></span>',
    next ? `<a href="${root}${next.path}">${escape(parse(next.file).title)}${chevronRight}</a>` : '<span></span>',
  ].join('');
  const top = path.startsWith('help/') ? 'help' : path.startsWith('docs/plugins/') ? 'plugins' : 'docs';
  const navLink = (id: string, href: string, label: string) =>
    `<a href="${root}${href}"${top === id ? ' aria-current="page"' : ''}>${label}</a>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(page.title)} - DevPul</title>
    <meta name="description" content="${escape(page.description)}" />
    <link rel="canonical" href="${site.url}${path}" />
    <meta name="theme-color" content="#0f766e" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="${root}favicon.svg" type="image/svg+xml" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="DevPul" />
    <meta property="og:title" content="${escape(page.title)} - DevPul" />
    <meta property="og:description" content="${escape(page.description)}" />
    <meta property="og:url" content="${site.url}${path}" />
    <meta property="og:image" content="${site.url}og.png" />
    <script>
      try {
        const t = JSON.parse(localStorage.getItem('devpul:theme'));
        if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
      } catch {}
    </script>
    <style>${read('../src/tokens.css')}${read('page.css')}</style>
    ${ld}
  </head>
  <body>
    <header class="top">
      <a class="brand" href="${root}"><img src="${root}favicon.svg" alt="" width="20" height="20" />DevPul</a>
      <nav>
        ${navLink('docs', 'docs/', 'Docs')}
        ${navLink('plugins', 'docs/plugins/', 'Plugins')}
        ${navLink('help', 'help/', 'Help')}
        <a href="${site.repo}">GitHub</a>
      </nav>
      <button type="button" class="theme" aria-label="Theme">${themeButton}</button>
      <a class="open" href="${root}">Open DevPul</a>
    </header>
    <div class="layout">
      <aside class="side"><nav aria-label="Docs">${side}</nav></aside>
      <main class="doc">
        ${html}
        <nav class="pager" aria-label="Pages">${pager}</nav>
      </main>
    </div>
    <footer class="foot">
      <a href="${site.repo}">Source</a> · <a href="${site.repo}/issues">Issues</a>
    </footer>
    <script>${read('page.js')}</script>
  </body>
</html>
`;
}
