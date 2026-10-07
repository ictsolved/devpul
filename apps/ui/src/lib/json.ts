const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Escapes first, then wraps keys, strings, numbers and literals in spans. */
export function highlight(json: string): string {
  return escapeHtml(json).replace(
    TOKEN,
    (match, string?: string, colon?: string, literal?: string, number?: string) => {
      if (string !== undefined) {
        return colon
          ? `<span class="j-key">${string}</span>${colon}`
          : `<span class="j-str">${string}</span>`;
      }
      if (literal !== undefined) return `<span class="j-lit">${literal}</span>`;
      if (number !== undefined) return `<span class="j-num">${number}</span>`;
      return match;
    },
  );
}

export function pretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const pad = (v: number, l = 2) => String(v).padStart(l, '0');

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
