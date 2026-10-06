import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { PAGES, renderPage } from './pages/render.ts';
import site from './site.json' with { type: 'json' };

const fill = (text: string) =>
  text
    .replaceAll('%SITE_URL%', site.url)
    .replaceAll('%REPO_URL%', site.repo)
    .replaceAll('%DATE%', new Date().toISOString().slice(0, 10));

const sitemap = () => {
  const urls = ['', ...PAGES.map((p) => p.path)]
    .map((path) => `  <url>\n    <loc>${site.url}${path}</loc>\n    <lastmod>%DATE%</lastmod>\n  </url>`)
    .join('\n');
  return fill(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
};

// Site URL and repo live in site.json; seo/ holds crawler files and pages/
// the static docs, rendered from markdown.
function sitePlugin(): Plugin {
  return {
    name: 'devpul-site',
    transformIndexHtml: fill,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
        const html = renderPage(path.endsWith('/') ? path : `${path}/`, site);
        if (!html || !path) return next();
        if (!path.endsWith('/')) {
          res.writeHead(301, { location: `/${path}/` }).end();
          return;
        }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
    generateBundle() {
      const dir = join(import.meta.dirname, 'seo');
      for (const file of readdirSync(dir)) {
        this.emitFile({ type: 'asset', fileName: file, source: fill(readFileSync(join(dir, file), 'utf8')) });
      }
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() });
      for (const page of PAGES) {
        this.emitFile({ type: 'asset', fileName: `${page.path}index.html`, source: renderPage(page.path, site) ?? '' });
      }
      this.emitFile({ type: 'asset', fileName: 'CNAME', source: `${new URL(site.url).host}\n` });
    },
  };
}

// One self-contained HTML file: it can be downloaded and opened from disk,
// where module scripts loaded by URL are blocked.
function singleFile(): Plugin {
  return {
    name: 'devpul-single-file',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          source = source.replace(
            new RegExp(`<script type="module" crossorigin src="[^"]*${name}"></script>`),
            () => `<script type="module">${item.code.replace(/<\/script/gi, '<\\/script')}</script>`,
          );
          delete bundle[name];
        } else if (name.endsWith('.css')) {
          source = source.replace(
            new RegExp(`<link rel="stylesheet" crossorigin href="[^"]*${name}">`),
            () => `<style>${String(item.source)}</style>`,
          );
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), sitePlugin(), singleFile()],
  build: {
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 1_000_000,
    sourcemap: false,
  },
});
