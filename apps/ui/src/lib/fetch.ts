import { isObject, type Json, TRUNCATED } from './events';
import type { HttpRow } from './store';

// Browsers refuse to set these from fetch.
const FORBIDDEN = new Set(['content-length', 'host', 'connection', 'accept-encoding', 'user-agent']);

export function headerValue(v: Json): string {
  return Array.isArray(v) ? v.map(String).join(', ') : String(v);
}

/** A fetch() call that repeats the request, for the browser console. */
export function toFetch(row: HttpRow): string | undefined {
  const req = row.request?.data;
  if (!req) return undefined;
  const headers: Record<string, string> = {};
  let type = '';
  if (isObject(req.headers)) {
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === null || FORBIDDEN.has(k.toLowerCase())) continue;
      const value = headerValue(v);
      headers[k] = value;
      if (k.toLowerCase() === 'content-type') type = value.toLowerCase();
    }
  }
  const lines = [`  method: ${JSON.stringify(row.method)},`];
  if (Object.keys(headers).length) {
    lines.push(`  headers: ${indent(JSON.stringify(headers, null, 2))},`);
  }
  const body = req.body;
  if (body !== undefined && body !== null && row.method !== 'GET' && row.method !== 'HEAD') {
    if (isObject(body) && TRUNCATED in body) {
      lines.push('  // body cut by the app, not included');
    } else if (type.includes('multipart/')) {
      lines.push('  // multipart body not included');
    } else if (typeof body === 'string') {
      lines.push(`  body: ${JSON.stringify(body)},`);
    } else if (type.includes('x-www-form-urlencoded') && isObject(body)) {
      lines.push(`  body: new URLSearchParams(${indent(JSON.stringify(body, null, 2))}),`);
    } else {
      lines.push(`  body: JSON.stringify(${indent(JSON.stringify(body, null, 2))}),`);
    }
  }
  return `fetch(${JSON.stringify(row.url)}, {\n${lines.join('\n')}\n});`;
}

const indent = (text: string) => text.replaceAll('\n', '\n  ');
