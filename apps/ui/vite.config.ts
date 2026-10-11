import { join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import site from '../../site.json' with { type: 'json' };

// The app's policy; a meta tag cannot set frame-ancestors.
const CSP = [
  "default-src 'self'",
  // No inline scripts and no eval; approved plugins load as blob: modules.
  "script-src 'self' blob:",
  // Radix injects <style> tags (scroll lock) and plugins set style attributes.
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

// Site URL and repo live in site.json.
const fill = (text: string) => text.replaceAll('%SITE_URL%', site.url).replaceAll('%REPO_URL%', site.repo);

function sitePlugin(): Plugin {
  return {
    name: 'devpul-site',
    transformIndexHtml: (html, ctx) => fill(html).replace('%CSP%', ctx.server ? DEV_CSP : CSP),
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
