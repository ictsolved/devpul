// Builds the site into dist/: docs and, with DEVPUL_REGISTRY (the output of
// tool/build_registry.dart), plugin pages from apps/docs, then the app at the root.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
const site = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8'));
const registry = process.env.DEVPUL_REGISTRY && resolve(process.env.DEVPUL_REGISTRY);
const env = registry ? { ...process.env, DEVPUL_REGISTRY: registry } : process.env;

const build = (workspace) =>
  execFileSync('npm', ['run', 'build', '-w', workspace], { cwd: root, env, stdio: 'inherit' });
const write = (file, text) => writeFileSync(join(dist, file), text);

rmSync(dist, { recursive: true, force: true });
// Astro first: Pagefind indexes every page in dist/.
build('apps/docs');
build('apps/ui');
cpSync(join(root, 'apps/ui/dist'), dist, { recursive: true });
if (registry) cpSync(join(registry, 'registry.json'), join(dist, 'plugins/registry.json'));

// sitemap.xml is the URL search engines know. An index cannot list another
// index, so it lists the app's sitemap and every sitemap Astro's index lists.
const astro = [...readFileSync(join(dist, 'sitemap-index.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  ([, loc]) => loc,
);
write(
  'sitemap-root.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site.url}</loc></url>\n</urlset>\n`,
);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[`${site.url}sitemap-root.xml`, ...astro].map((loc) => `  <sitemap><loc>${loc}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`,
);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${site.url}sitemap.xml\n`);
