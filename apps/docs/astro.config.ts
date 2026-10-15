import { satteri } from '@astrojs/markdown-satteri';
import starlight from '@astrojs/starlight';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { defineConfig } from 'astro/config';
import { defineMdastPlugin } from 'satteri';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import site from '../../site.json' with { type: 'json' };
import { readRegistry } from './src/plugins.ts';

// Site and repo URLs live only in site.json.
const fill = (s: string) => s.replaceAll('%SITE_URL%', site.url).replaceAll('%REPO_URL%', site.repo);

const placeholders = defineMdastPlugin({
  name: 'devpul-placeholders',
  text: (node, ctx) => ctx.setProperty(node, 'value', fill(node.value)),
  inlineCode: (node, ctx) => ctx.setProperty(node, 'value', fill(node.value)),
  code: (node, ctx) => ctx.setProperty(node, 'value', fill(node.value)),
  link: (node, ctx) => ctx.setProperty(node, 'url', fill(node.url)),
});

// Astro's own CSP leaves out is:inline scripts, which Starlight uses for its theme and sidebar.
// Style attributes come from Expressive Code token colors.
function csp(): AstroIntegration {
  return {
    name: 'devpul-csp',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const root = fileURLToPath(dir);
        const pages = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.html'));
        for (const page of pages) {
          const file = join(root, page);
          const html = readFileSync(file, 'utf8');
          const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
            .filter(([, attrs]) => !/type="application\/ld\+json"/.test(attrs ?? ''))
            .map(
              ([, , body]) =>
                `'sha256-${createHash('sha256')
                  .update(body ?? '')
                  .digest('base64')}'`,
            );
          const policy = [
            "default-src 'self'",
            // Pagefind runs its search index as WebAssembly.
            `script-src 'self' 'wasm-unsafe-eval' ${[...new Set(hashes)].join(' ')}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "object-src 'none'",
            "base-uri 'self'",
          ].join('; ');
          const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
          writeFileSync(
            file,
            html.replace('<meta charset="utf-8"/>', (m) => m + meta),
          );
        }
      },
    },
  };
}

const docs = [
  { label: 'Start', items: ['docs', 'docs/ide', 'docs/connecting', 'docs/ui', 'docs/mocking', 'docs/mcp'] },
  { label: 'Packages', items: ['docs/api', 'docs/dio', 'docs/http', 'docs/flutter'] },
  { label: 'Extend', items: ['docs/extend', 'docs/actions', 'docs/plugins/install', 'docs/plugins', 'docs/adapters'] },
  { label: 'Reference', items: ['docs/cli', 'docs/events', 'docs/plugins/api', 'docs/plugins/format'] },
  { label: 'Help', items: ['docs/security', 'docs/limits', 'docs/compare', 'docs/help'] },
];

const registry = process.env.DEVPUL_REGISTRY ? readRegistry(process.env.DEVPUL_REGISTRY) : null;

// Docs at /docs/ and the marketplace at /plugins/ share one build, search and sidebar.
// tool/build-site.mjs adds the app at /.
export default defineConfig({
  site: site.url,
  outDir: '../../dist',
  trailingSlash: 'always',
  redirects: { '/help': '/docs/help/' },
  markdown: { processor: satteri({ mdastPlugins: [placeholders], features: { smartPunctuation: false } }) },
  integrations: [
    csp(),
    starlight({
      title: 'DevPul',
      description:
        'Debug bridge between a running Dart or Flutter app and a browser UI: HTTP calls, errors, logs and custom events, live over the VM service.',
      titleDelimiter: '-',
      logo: { src: './public/favicon.svg' },
      routeMiddleware: './src/routeData.ts',
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0f766e' } },
        { tag: 'meta', attrs: { property: 'og:image', content: `${site.url}og.png` } },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: site.repo }],
      customCss: ['../ui/src/tokens.css', './src/styles/theme.css'],
      components: {
        MarkdownContent: './src/components/MarkdownContent.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      sidebar: [
        ...docs,
        ...(registry
          ? [
              {
                label: 'Plugins',
                collapsed: true,
                items: [{ slug: 'plugins', label: 'All plugins' }, ...registry.plugins.map((p) => `plugins/${p.id}`)],
              },
            ]
          : []),
      ],
      plugins: [
        // The app at / is built outside this site, the marketplace only with DEVPUL_REGISTRY.
        starlightLinksValidator({ exclude: ['/', '/plugins/', '/plugins/**'] }),
        // exclude applies to llms-small.txt only; llms-full.txt keeps these after the docs.
        starlightLlmsTxt({
          projectName: 'DevPul',
          // Heading anchors read as "Section titled ..." lines.
          customSelectors: { all: ['.sl-anchor-link'] },
          exclude: ['404', 'plugins', 'plugins/**'],
          // Sidebar order.
          promote: docs.flatMap((group) => group.items),
          demote: ['plugins', 'plugins/**', '404'],
        }),
      ],
    }),
  ],
});
