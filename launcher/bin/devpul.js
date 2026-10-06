#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: devpul [--port <n>] [--no-open]

Serves the DevPul UI on http://127.0.0.1 and opens it in the browser.
The port stays fixed by default so settings and history persist.

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

const here = dirname(fileURLToPath(import.meta.url));
const find = (...candidates) => candidates.map((p) => join(here, p)).find((p) => existsSync(p));
// Packed: next to bin/. In the repo: the app build.
const htmlPath = find('../devpul.html', '../../app/dist/index.html');
if (!htmlPath) {
  console.error('devpul: UI build not found. Run `npm run build` in the repo first.');
  process.exit(1);
}
const html = readFileSync(htmlPath);
const iconPath = find('../favicon.svg', '../../app/public/favicon.svg');
const icon = iconPath ? readFileSync(iconPath) : null;

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } else if (path === '/favicon.svg' && icon) {
    res.writeHead(200, { ...headers, 'content-type': 'image/svg+xml' });
    res.end(icon);
  } else {
    res.writeHead(404, headers);
    res.end();
  }
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
    if (open) openBrowser(url);
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
