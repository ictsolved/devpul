export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** A semver string; build metadata is dropped. */
export function parseVersion(text: string): Version | undefined {
  const m = SEMVER.exec(text);
  if (!m) return undefined;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4]?.split('.') ?? [] };
}

const NUMERIC = /^\d+$/;

function comparePre(a: string[], b: string[]): number {
  if (!a.length || !b.length) return b.length - a.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x === y) continue;
    const xn = NUMERIC.test(x);
    const yn = NUMERIC.test(y);
    if (xn && yn) return Number(x) - Number(y);
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

/** Semver precedence: negative when [a] is older. */
export const compareVersions = (a: Version, b: Version): number =>
  a.major - b.major || a.minor - b.minor || a.patch - b.patch || comparePre(a.pre, b.pre);

/** Whether `^current`, as pub reads it, excludes [next]. */
export const isBreaking = (current: Version, next: Version): boolean =>
  current.major === 0 ? next.major > 0 || next.minor > current.minor : next.major > current.major;
