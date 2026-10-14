import { isObject, type JsonObject } from './events';

export interface Jwt {
  token: string;
  header: JsonObject;
  claims: JsonObject;
}

// NumericDate claims: RFC 7519 and OpenID Connect's auth_time.
export const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time']);

function part(s: string | undefined): JsonObject | undefined {
  if (!s) return undefined;
  try {
    const b64 = s
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(s.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Header and claims of a signed JWT. The signature is not checked. */
export function decodeJwt(token: string): Jwt | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const header = part(parts[0]);
  const claims = part(parts[1]);
  return header && claims ? { token, header, claims } : undefined;
}

/** The JWT in a bearer `Authorization` header, as adapters or the dart:io profile send headers. */
export function bearerJwt(headers: unknown): Jwt | undefined {
  if (!isObject(headers)) return undefined;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== 'authorization') continue;
    for (const value of Array.isArray(v) ? v : [v]) {
      const m = typeof value === 'string' ? /^bearer\s+(\S+)\s*$/i.exec(value.trim()) : null;
      const jwt = m?.[1] ? decodeJwt(m[1]) : undefined;
      if (jwt) return jwt;
    }
  }
  return undefined;
}

function span(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

/** `exp` against the time the request was sent. */
export function expiry(claims: JsonObject, sentAt: number): string | undefined {
  const exp = claims.exp;
  if (typeof exp !== 'number') return undefined;
  const diff = exp * 1000 - sentAt;
  return diff <= 0 ? `expired ${span(-diff)} before the request` : `expires ${span(diff)} after the request`;
}
