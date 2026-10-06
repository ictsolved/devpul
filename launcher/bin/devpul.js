#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: devpul [vm-service-url] [--port <n>] [--no-open]

Serves the DevPul UI on http://127.0.0.1 and opens it in the browser.
The port stays fixed by default so settings and history persist.
With a VM service URL, the opened page connects to it.

  --port <n>  port to listen on (default 7171, next free one if taken)
  --no-open   do not open a browser`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const portArg = args.indexOf('--port');
const wanted = portArg >= 0 ? Number(args[portArg + 1]) : 7171;
if (!Number.isInteger(wanted) || wanted < 0 || wanted > 65535) {
  console.error('devpul: --port needs a number between 0 and 65535');
  process.exit(1);
}
const open = !args.includes('--no-open');
const connect = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--port');

const here = dirname(fileURLToPath(import.meta.url));
// Packed: ui/ next to bin/. In the repo: the app build.
const root = [join(here, '../ui'), join(here, '../../app/dist')].find((p) =>
  existsSync(join(p, 'index.html')),
);
if (!root) {
  console.error('devpul: UI build not found. Run `npm run build` in the repo first.');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.js': 'text/javascript',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  let path;
  try {
    path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    res.writeHead(400, headers);
    res.end();
    return;
  }
  if (!extname(path) && !path.endsWith('/') && existsSync(join(root, path, 'index.html'))) {
    res.writeHead(301, { ...headers, location: `${path}/` });
    res.end();
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  const type = types[extname(file)];
  if (!file.startsWith(root + sep) || !type || !existsSync(file)) {
    res.writeHead(404, headers);
    res.end();
    return;
  }
  res.writeHead(200, { ...headers, 'content-type': type });
  res.end(readFileSync(file));
});

function listen(port, triesLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && portArg < 0 && triesLeft > 0) listen(port + 1, triesLeft - 1);
    else {
      console.error(`devpul: ${err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log(`DevPul UI at ${url}  (Ctrl+C to stop)`);
    if (open) openBrowser(connect ? `${url}#connect=${encodeURIComponent(connect)}` : url);
  });
}

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // Printed URL is enough.
  }
}

listen(wanted, 20);
