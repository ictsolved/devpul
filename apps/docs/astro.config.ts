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

export default defineConfig({
  site: site.url,
  base: '/docs/',
  outDir: '../../dist/docs',
  trailingSlash: 'always',
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
        SocialIcons: './src/components/SocialIcons.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      sidebar: [
        { label: 'Start', items: ['', 'connecting', 'ui'] },
        { label: 'Packages', items: ['api', 'dio', 'http', 'flutter'] },
        { label: 'Extend', items: ['extend', 'plugins/install', 'plugins', 'plugins/format', 'adapters', 'events'] },
        { label: 'Help', items: ['help'] },
      ],
      plugins: [
        // The app at / and the marketplace at /plugins/ are built outside this site.
        starlightLinksValidator({ exclude: ['/', '/plugins/', '/plugins/**'] }),
        starlightLlmsTxt({ projectName: 'DevPul' }),
      ],
    }),
  ],
});
