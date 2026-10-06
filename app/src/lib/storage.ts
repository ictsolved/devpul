const PREFIX = 'devpul:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return mergeShape(fallback, value);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private mode or storage full.
  }
}

// Stored values may be partial or written by another version.
function mergeShape<T>(fallback: T, value: unknown): T {
  if (typeof fallback !== typeof value || value === null) return fallback;
  if (Array.isArray(fallback)) return (Array.isArray(value) ? value : fallback) as T;
  if (typeof fallback === 'object' && fallback !== null) {
    if (Array.isArray(value)) return fallback;
    return { ...fallback, ...(value as object) };
  }
  return value as T;
}

export interface Settings {
  slowMs: number;
  verySlowMs: number;
  maxEvents: number;
  persist: boolean;
  /** Keys of app.session info shown in the header. Empty means the first few. */
  headerFields: string[];
  pluginUrls: string[];
}

export const defaultSettings: Settings = {
  slowMs: 2000,
  verySlowMs: 5000,
  maxEvents: 20000,
  persist: true,
  headerFields: [],
  pluginUrls: [],
};
