import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { PAGES, renderPage } from './pages/render.ts';
import site from '../../site.json' with { type: 'json' };

// The same policy on the app and every static page. Meta tags cannot set frame-ancestors.
const CSP = [
  "default-src 'self'",
  // No inline scripts and no eval; approved plugins load as blob: modules.
  "script-src 'self' blob:",
  // Radix injects <style> tags (scroll lock), the static pages inline their CSS, and plugins set style attributes.
  "style-src 'self' 'unsafe-inline'",
  // The logo is a data: URI; plugins may draw blob: or data: images.
  "img-src 'self' data: blob:",
  // VM service websockets on whatever host the user pastes, and plugin URLs.
  "connect-src 'self' ws: wss: http: https:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

// The React refresh preamble is an inline script.
const DEV_CSP = CSP.replace("script-src 'self' blob:", "script-src 'self' blob: 'unsafe-inline'");

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
    transformIndexHtml: (html, ctx) => fill(html).replace('%CSP%', ctx.server ? DEV_CSP : CSP),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
        const html = renderPage(path.endsWith('/') ? path : `${path}/`, site, CSP);
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
        this.emitFile({
          type: 'asset',
          fileName: `${page.path}index.html`,
          source: renderPage(page.path, site, CSP) ?? '',
        });
      }
      this.emitFile({ type: 'asset', fileName: 'CNAME', source: `${new URL(site.url).host}\n` });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), sitePlugin()],
  resolve: {
    alias: { '@': join(import.meta.dirname, 'src') },
  },
  build: {
    sourcemap: false,
  },
});
