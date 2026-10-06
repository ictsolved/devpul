// Accepts what `flutter run`, `flutter attach`, `dart run --observe` and
// DevTools print, and returns the DDS websocket URL.
export function toWsUrl(input: string): string | null {
  let text = input.trim();
  if (!text) return null;

  const uriParam = /[?&]uri=([^&\s]+)/.exec(text);
  if (uriParam?.[1]) {
    try {
      return toWsUrl(decodeURIComponent(uriParam[1]));
    } catch {
      return null;
    }
  }

  if (!/^[a-z]+:\/\//i.test(text)) text = `ws://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'ws:';
  else if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
  if (!url.port && !url.pathname.replace(/\//g, '')) return null;

  let path = url.pathname.replace(/\/devtools\/?.*$/, '');
  if (!path.endsWith('/ws')) path = `${path.replace(/\/+$/, '')}/ws`;
  return `${url.protocol}//${url.host}${path}`;
}

export function connectionLabel(wsUrl: string): string {
  try {
    const url = new URL(wsUrl);
    const token = url.pathname.split('/').filter(Boolean)[0];
    return token && token !== 'ws' ? `${url.host} (${token.slice(0, 4)}...)` : url.host;
  } catch {
    return wsUrl;
  }
}

export const isLocalOrigin = (location: Location): boolean =>
  location.protocol === 'file:' ||
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
