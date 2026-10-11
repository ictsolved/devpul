// Builds the UI into packages/devpul/extension/devtools/build, which the
// DevTools extension and devpul_cli serve. --check only compares the stamp
// with the UI source.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'packages/devpul/extension/devtools/build');
const stamp = join(out, 'source.sha256');
const SITE_ONLY = ['sw.js', 'og.png'];

function sourceHash() {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/ui', 'site.json', 'package-lock.json'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => f && !f.startsWith('apps/ui/e2e/') && !f.endsWith('.test.ts') && existsSync(join(root, f)))
    .sort();
  const hash = createHash('sha256');
  for (const f of new Set(files))
    hash
      .update(`${f}\0`)
      .update(readFileSync(join(root, f)))
      .update('\0');
  return hash.digest('hex');
}

if (process.argv.includes('--check')) {
  const built = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null;
  if (built !== sourceHash()) {
    console.error(
      `${built ? 'Stale' : 'No'} UI build in packages/devpul/extension/devtools. Run npm run build:extension.`,
    );
    process.exit(1);
  }
} else {
  execFileSync('npm', ['run', 'build', '-w', 'apps/ui'], { cwd: root, stdio: 'inherit' });
  rmSync(out, { recursive: true, force: true });
  cpSync(join(root, 'apps/ui/dist'), out, { recursive: true });
  for (const f of SITE_ONLY) rmSync(join(out, f), { force: true });
  writeFileSync(stamp, `${sourceHash()}\n`);
}
