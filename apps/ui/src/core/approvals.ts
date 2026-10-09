/** The user's approval of a plugin package at one source hash. */
export interface Approval {
  id: string;
  hash: string;
  version?: string;
  /** The handshake `origin`, such as a git URL. */
  origin?: string;
  /** Kept but not loaded. */
  off?: boolean;
}

/** A plugin a run lists, with the hash of the source its app sent, or else the hash its handshake reports. */
export interface Listed {
  id: string;
  hash?: string;
}

/**
 * Approved hashes to load, by package: listed by a run, on, with a source at
 * hand, and the one a live app sent if any app sent one.
 */
export function toLoad(
  approvals: readonly Approval[],
  listed: readonly Listed[],
  has: (hash: string) => boolean,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of approvals) {
    const mine = listed.filter((l) => l.id === a.id);
    if (!mine.length || a.off || !has(a.hash)) continue;
    const sent = mine.flatMap((l) => (l.hash ? [l.hash] : []));
    if (!sent.length || sent.includes(a.hash)) out.set(a.id, a.hash);
  }
  return out;
}

/**
 * Whether a run that lists package [id] at [hash] needs no source fetch: the
 * user approved that hash and its source is cached. An app claiming a hash
 * gets only code the user already allowed for that package.
 */
export const approvedAndCached = (
  approvals: readonly Approval[],
  id: string,
  hash: string | undefined,
  has: (hash: string) => boolean,
): boolean => hash !== undefined && has(hash) && approvals.some((a) => a.id === id && a.hash === hash);

/** One approval per plugin id; a new hash replaces the old one. */
export const approve = (approvals: readonly Approval[], next: Approval): Approval[] => [
  ...approvals.filter((a) => a.id !== next.id),
  next,
];
