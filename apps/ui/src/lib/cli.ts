interface Handlers {
  connect: (vmUrl: string) => void;
  plugins: (urls: string[]) => void;
}

/** Served by `devpul`, which marks the page and pushes VM service URLs and plugin files. */
export const cli = document.querySelector('meta[name="devpul-cli"]') !== null;

export function listenCli({ connect, plugins }: Handlers): () => void {
  // Reconnects on its own when devpul restarts on the same port.
  const source = new EventSource('cli/events');
  source.onmessage = (e: MessageEvent<string>) => {
    let msg: unknown;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if ('connect' in msg && typeof msg.connect === 'string') connect(msg.connect);
    if ('plugins' in msg && Array.isArray(msg.plugins)) {
      plugins(msg.plugins.filter((u): u is string => typeof u === 'string'));
    }
  };
  return () => source.close();
}
