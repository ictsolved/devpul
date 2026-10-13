import { isObject, num, str } from './events';

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
}

export function readLocation(v: unknown): SourceLocation | undefined {
  if (!isObject(v)) return undefined;
  const file = str(v.file);
  const line = num(v.line);
  const column = num(v.column);
  return file && line !== undefined && column !== undefined ? { file, line, column } : undefined;
}

// A file: URI as a path editors and terminals open; other schemes stay as sent.
export function filePath(file: string): string {
  if (!file.startsWith('file:')) return file;
  try {
    const path = decodeURIComponent(new URL(file).pathname);
    return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
  } catch {
    return file;
  }
}

// From the package folder, as in `shop/lib/cart.dart`.
export function shortPath(file: string): string {
  const path = filePath(file);
  const lib = path.lastIndexOf('/lib/');
  if (lib < 0) return path;
  return path.slice(path.lastIndexOf('/', lib - 1) + 1).replace(/^\/+/, '');
}

export const locationText = (l: SourceLocation) =>
  `${filePath(l.file)}:${l.line}${l.column === undefined ? '' : `:${l.column}`}`;
