import { Dtd } from '../core/dtd';
import { isLoopback, toWsUrl } from '../core/url';

export type Theme = 'light' | 'dark';

interface Handlers {
  connect: (wsUrl: string | null) => void;
  theme: (theme: Theme) => void;
}

const params = new URLSearchParams(location.search);

/**
 * Running as a DevTools extension: an iframe on the DevTools server, which
 * passes the app's VM service URL in the query and in messages.
 */
export const devtools =
  window.parent !== window && isLoopback(location.hostname) && (params.has('uri') || params.has('dtdUri'));

const loopbackWs = (value: unknown): string | null => {
  const url = typeof value === 'string' ? toWsUrl(value) : null;
  return url && isLoopback(new URL(url).hostname) ? url : null;
};

export const hostUri = (): string | null => loopbackWs(params.get('uri'));

// DevTools sends `dtdUri=null` when it has no daemon.
function dtdUri(): string | null {
  try {
    const url = new URL(params.get('dtdUri') ?? '');
    return url.protocol === 'ws:' && isLoopback(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

let dtd: Dtd | null | undefined;

/** The Dart Tooling Daemon DevTools runs, where an IDE registers its Editor service. */
export function hostDtd(): Dtd | null {
  if (dtd === undefined) {
    const url = devtools ? dtdUri() : null;
    dtd = url ? new Dtd(url) : null;
  }
  return dtd;
}

export const hostTheme = (): Theme | null => {
  const theme = params.get('theme');
  return theme === 'light' || theme === 'dark' ? theme : null;
};

export function postHost(type: string, data?: Record<string, unknown>): void {
  window.parent.postMessage({ type, ...(data && { data }) }, location.origin);
}

/** Handles DevTools messages; asks for the URL when the query has none. */
export function listenHost({ connect, theme }: Handlers): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const msg: unknown = e.data;
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
    const data = 'data' in msg && msg.data && typeof msg.data === 'object' ? (msg.data as Record<string, unknown>) : {};
    switch (msg.type) {
      case 'ping':
        postHost('pong');
        break;
      case 'vmServiceConnection':
        connect(loopbackWs(data.uri));
        break;
      case 'themeUpdate':
        if (data.theme === 'light' || data.theme === 'dark') theme(data.theme);
        break;
      case 'forceReload':
        location.reload();
        break;
    }
  };
  window.addEventListener('message', onMessage);
  if (!params.has('uri')) postHost('vmServiceConnection');
  return () => window.removeEventListener('message', onMessage);
}
