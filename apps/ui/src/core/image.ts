import { isObject } from './events';

const DATA_IMAGE = /^data:(image\/[\w.+-]+)((?:;[^,;]*)*),/i;
const IMAGE_TYPE = /^image\/[\w.+-]+$/i;
const SVG = /^image\/svg\+xml\s*(;|$)/i;

export interface DataImage {
  src: string;
  type: string;
  bytes: number;
}

/** A `data:image/...` string with its type and decoded size. */
export function dataImage(value: unknown): DataImage | undefined {
  if (typeof value !== 'string') return undefined;
  const m = DATA_IMAGE.exec(value);
  if (!m) return undefined;
  const data = value.length - m[0].length;
  const base64 = /;base64$/i.test(m[2]!);
  const pad = base64 ? (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) : 0;
  return { src: value, type: m[1]!.toLowerCase(), bytes: base64 ? Math.floor((data * 3) / 4) - pad : data };
}

/** The media type of a Content-Type value when it names an image. */
export function imageType(contentType: string | undefined): string | undefined {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  return type && IMAGE_TYPE.test(type) ? type : undefined;
}

/** An SVG body sent as text, as a `data:` image. */
export function svgImage(body: unknown, headers: unknown): DataImage | undefined {
  if (typeof body !== 'string' || !isObject(headers)) return undefined;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== 'content-type') continue;
    const type = Array.isArray(v) ? v[0] : v;
    if (typeof type === 'string' && SVG.test(type)) {
      return {
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`,
        type: 'image/svg+xml',
        bytes: new TextEncoder().encode(body).length,
      };
    }
  }
  return undefined;
}

/** Length of the `data:` URL `dataUrl` makes from `bytes` bytes. */
export const dataUrlLength = (type: string, bytes: number): number => 13 + type.length + Math.ceil(bytes / 3) * 4;

export function dataUrl(type: string, bytes: Uint8Array): string {
  let binary = '';
  // fromCharCode takes its arguments on the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}
