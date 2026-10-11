import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, test } from 'vitest';

const root = join(import.meta.dirname, '../../..');
const shots = join(root, 'apps/docs/public/screenshots');
const packages = readdirSync(join(root, 'packages'));

// npm run screenshots writes public/screenshots and copies what each pubspec lists into the package.
test.each(packages)('packages/%s screenshots match apps/docs/public/screenshots', (pkg) => {
  const pubspec = readFileSync(join(root, 'packages', pkg, 'pubspec.yaml'), 'utf8');
  for (const [, path = ''] of pubspec.matchAll(/^\s+path: (screenshots\/\S+)$/gm)) {
    const copy = readFileSync(join(root, 'packages', pkg, path));
    expect(copy.equals(readFileSync(join(shots, basename(path)))), `${path} differs; run npm run screenshots`).toBe(
      true,
    );
  }
});

const pages = [
  ...readdirSync(join(root, 'apps/docs/src/content/docs'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.md'))
    .map((f) => join('apps/docs/src/content/docs', f)),
  'README.md',
];

test.each(pages)('%s shows existing screenshots', (page) => {
  const text = readFileSync(join(root, page), 'utf8');
  for (const [, name = ''] of text.matchAll(/screenshots\/([\w.-]+)/g)) {
    expect(existsSync(join(shots, name)), `no screenshot ${name}`).toBe(true);
  }
});
