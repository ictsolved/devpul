// A shop app's session for the screenshots: requests, errors, logs, routes,
// Riverpod state and a SQLite database behind the sqflite plugin's handlers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { VmEvent, VmOptions } from './vm.ts';

type JsonObject = Record<string, unknown>;

const root = join(import.meta.dirname, '../../..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const site = JSON.parse(read('site.json')) as { repo: string };

const T0 = Date.UTC(2026, 9, 12, 9, 41, 7, 312);
const API = 'https://api.example.com/v1';
const TOKEN = { authorization: 'Bearer ***' };
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const event = (at: number, kind: string, data: JsonObject): VmEvent => ({
  kind: `devpul.${kind}`,
  data: { v: 1, session: 's1', seq: 0, ts: T0 + at, tags: { env: 'staging' }, data },
});

// Events and requests numbered in the order the app posts them.
function numbered<T extends VmEvent[] | VmEvent[][]>(events: T, after = 0): T {
  const ids = new Map<unknown, number>();
  for (const [i, e] of events.flat().entries()) {
    e.data.seq = after + i + 1;
    if (!e.kind.startsWith('devpul.http.')) continue;
    if (!ids.has(e.data.data.id)) ids.set(e.data.data.id, ids.size + 1);
    e.data.data.id = ids.get(e.data.data.id);
  }
  return events;
}

interface Call {
  method?: string;
  url: string;
  body?: unknown;
  status: number;
  statusMessage?: string;
  ms: number;
  response?: unknown;
}

let requests = 0;
/** The request at `at` and its response `ms` later. */
function http(at: number, call: Call): VmEvent[] {
  const id = ++requests;
  const method = call.method ?? 'GET';
  const { url } = call;
  const params = Object.fromEntries(new URL(url).searchParams);
  const headers = call.body === undefined ? TOKEN : { ...TOKEN, 'content-type': 'application/json' };
  const curl = [
    `curl${method === 'GET' ? '' : ` -X ${method}`} '${url}'`,
    ...Object.entries(headers).map(([k, v]) => `-H '${k}: ${v}'`),
    ...(call.body === undefined ? [] : [`--data-raw '${JSON.stringify(call.body)}'`]),
  ].join(' ');
  return [
    event(at, 'http.request', { id, method, url, params, headers, body: call.body ?? null, curl }),
    event(at + call.ms, 'http.response', {
      id,
      method,
      url,
      status: call.status,
      statusMessage: call.statusMessage ?? null,
      durationMs: call.ms,
      headers: { ...JSON_HEADERS, 'x-request-id': `req_${(0x39d3e7b3 + id * 7919).toString(16)}`, server: 'example' },
      body: call.response ?? null,
    }),
  ];
}

const products = [
  { id: 42, name: 'Stoneware mug', price: 18.5, stock: 24 },
  { id: 43, name: 'Pour-over kettle', price: 64, stock: 7 },
  { id: 44, name: 'Linen apron', price: 32, stock: 0 },
];

const stack = (frames: string[]) => frames.map((f, i) => `#${i}${' '.repeat(6 - String(i).length)}${f}`).join('\n');

/** The app's start: session, handshake with the plugin offers, first route and log. */
export function start(): VmEvent[] {
  return numbered([
    event(0, 'app.session', { name: 'Shop', version: '2.3.1', platform: 'android', flavor: 'staging' }),
    event(1, 'app.info', info()),
    event(40, 'route', { action: 'push', route: '/', previous: null }),
    event(52, 'log', { level: 'info', message: 'Signed in as user 1042', name: 'auth' }),
  ]);
}

/** What the app does next, in steps: the shop loads, an order goes through, search fails. */
export function session(after: number): VmEvent[][] {
  const [recommendations, recommended] = http(540, {
    url: `${API}/recommendations?for=1042`,
    status: 200,
    ms: 2733,
    response: { items: [products[1]] },
  });
  const [search, searched] = http(2600, {
    url: `${API}/search?q=mug`,
    status: 500,
    statusMessage: 'Internal Server Error',
    ms: 1213,
  });
  return numbered(
    [
      http(80, { url: `${API}/products?page=1`, status: 200, ms: 224, response: { items: products, next: 2 } }),
      http(110, { url: `${API}/cart`, status: 200, ms: 99, response: { id: 'c_81f2', items: [] } }),
      [event(330, 'riverpod.add', { id: 'p1', provider: 'cartProvider', value: { items: 0, total: 0 } })],
      http(420, { url: `${API}/profile`, status: 401, statusMessage: 'Unauthorized', ms: 72, response: {} }),
      [recommendations!],
      [event(600, 'route', { action: 'push', route: '/product/42', previous: '/', arguments: { id: 42 } })],
      [
        event(1310, 'riverpod.update', {
          id: 'p1',
          provider: 'cartProvider',
          previous: { items: 0, total: 0 },
          next: { items: 2, total: 37 },
        }),
      ],
      [event(1520, 'route', { action: 'push', route: '/cart', previous: '/product/42' })],
      http(1640, {
        method: 'POST',
        url: `${API}/orders`,
        body: { cart: 'c_81f2', payment: 'card', items: [{ id: 42, qty: 2 }] },
        status: 201,
        statusMessage: 'Created',
        ms: 421,
        response: { id: 'o_5521', status: 'paid', total: 37 },
      }),
      [event(2100, 'route', { action: 'replace', route: '/order/o_5521', previous: '/cart' })],
      [event(2180, 'log', { level: 'warn', message: 'Stock cache older than 5 min, refreshing', name: 'stock' })],
      http(2200, { url: `${API}/stock?ids=42,43,44`, status: 200, ms: 43, response: { 42: 22, 43: 7, 44: 0 } }),
      [search!],
      [recommended!],
      [
        searched!,
        event(3840, 'error', {
          source: 'zone',
          type: 'FormatException',
          message: 'FormatException: Unexpected end of input (at character 1)',
          library: 'search',
          context: 'while parsing search results',
          route: '/order/o_5521',
          stack: stack([
            'SearchRepository.search (package:shop/search/search_repository.dart:41:7)',
            '<asynchronous suspension>',
            'SearchController.submit (package:shop/search/search_controller.dart:28:21)',
            '<asynchronous suspension>',
          ]),
        }),
        event(3850, 'log', {
          level: 'error',
          message: 'Search failed for "mug"',
          name: 'search',
          error: 'FormatException: Unexpected end of input (at character 1)',
        }),
      ],
    ],
    after,
  );
}

/** Everything at once, after the backlog of a later connect. */
export function backlog(): VmEvent[] {
  const first = start();
  return numbered([
    ...first,
    ...session(first.length).flat(),
    event(4200, 'error', {
      source: 'flutter',
      type: 'FlutterError',
      message: 'A RenderFlex overflowed by 24 pixels on the right.',
      library: 'rendering library',
      context: 'during layout',
      route: '/order/o_5521',
      information: 'The relevant error-causing widget was:\n  Row Row:file:///shop/lib/order/order_page.dart:57:16',
      stack: stack([
        'RenderFlex.performLayout (package:flutter/src/rendering/flex.dart:1112:7)',
        'RenderObject.layout (package:flutter/src/rendering/object.dart:2731:7)',
        'OrderSummary.build (package:shop/order/order_page.dart:57:16)',
      ]),
    }),
    event(4300, 'log', { level: 'debug', message: 'Image cache: 38 entries, 4.1 MB', name: 'images' }),
  ]);
}

// The handshake, with the plugins from plugins/ as `devpul add` installs them.
function info(): JsonObject {
  const contract = JSON.parse(read('contract/info.json')) as JsonObject;
  return { ...contract, plugins: [plugin('riverpod').info, plugin('sqflite').info], limits: {}, dropped: {} };
}

function plugin(id: string) {
  const manifest = JSON.parse(read(`plugins/${id}/plugin.json`)) as {
    version: string;
    description: string;
    source: string;
    icon: string;
  };
  const source = `${read(`plugins/${id}/${manifest.source}`)}export const icon = ${JSON.stringify(read(`plugins/${id}/${manifest.icon}`).trim())};\n`;
  return {
    info: { id, version: manifest.version, origin: `${site.repo}.git`, description: manifest.description },
    source,
  };
}

function shopDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL);
    CREATE TABLE orders (id TEXT PRIMARY KEY, total REAL NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE order_items (order_id TEXT NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL, qty INTEGER NOT NULL);
    CREATE VIEW low_stock AS SELECT id, name, stock FROM products WHERE stock < 10;
  `);
  const add = db.prepare('INSERT INTO products VALUES (?, ?, ?, ?)');
  const more: [string, number, number][] = [
    ['Ceramic pour-over cone', 26, 12],
    ['Hand grinder', 89, 5],
    ['Glass carafe 600 ml', 29.9, 18],
    ['Paper filters (100)', 6.5, 140],
    ['Oak serving board', 44, 9],
    ['Espresso cups, set of 2', 21, 31],
    ['Milk jug 350 ml', 17.5, 22],
    ['Tea infuser', 9.9, 0],
    ['Coffee scale', 54, 11],
    ['Canister 1 kg', 24, 16],
    ['Cold brew bottle', 34.5, 8],
    ['Linen napkins (4)', 28, 26],
  ];
  for (const p of products) add.run(p.id, p.name, p.price, p.stock);
  more.forEach(([name, price, stock], i) => add.run(45 + i, name, price, stock));
  db.exec(`
    INSERT INTO orders VALUES ('o_5519', 64, 'shipped', '2026-10-11 17:02:41'), ('o_5520', 50.5, 'paid', '2026-10-12 08:15:09'), ('o_5521', 37, 'paid', '2026-10-12 09:41:09');
    INSERT INTO order_items VALUES ('o_5519', 43, 1), ('o_5520', 42, 1), ('o_5520', 46, 1), ('o_5520', 48, 1), ('o_5521', 42, 2);
  `);
  return db;
}

function rows(db: DatabaseSync, sql: string): JsonObject {
  const all = db.prepare(sql).all();
  return { columns: Object.keys(all[0] ?? {}), rows: all.map((r) => Object.values(r)), more: false };
}

/** The fake VM's options: the app's info, its plugins and their handlers. */
export function vmOptions(events: VmEvent[]): VmOptions {
  const db = shopDb();
  return {
    events,
    token: 'kq3F1x9TbJw=',
    info: info(),
    plugins: { riverpod: plugin('riverpod').source, sqflite: plugin('sqflite').source },
    handlers: {
      'riverpod.state': () => ({ providers: [{ id: 'p1', provider: 'cartProvider', value: { items: 2, total: 37 } }] }),
      'sqflite.databases': () => ({
        databases: [{ name: 'shop.db', path: '/data/user/0/com.example.shop/databases/shop.db' }],
      }),
      'sqflite.query': (args) => rows(db, String(args.sql)),
    },
  };
}
