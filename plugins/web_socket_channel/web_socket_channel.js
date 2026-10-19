// The WebSocket tab: each channel the app wrapped, its state and close, the messages sent and received, and a box that sends.

const PREFIX = 'web_socket_channel.';
// Messages kept and drawn per connection, newest first.
const SHOWN = 200;
const CUT = 'devpul.truncated';

const CLOSE_CODES = {
  1000: 'Normal closure',
  1001: 'Going away',
  1002: 'Protocol error',
  1003: 'Unsupported data',
  1005: 'No status',
  1006: 'Abnormal closure',
  1007: 'Invalid payload',
  1008: 'Policy violation',
  1009: 'Message too big',
  1010: 'Missing extension',
  1011: 'Internal error',
  1012: 'Service restart',
  1013: 'Try again later',
  1015: 'TLS handshake failed',
};

const STATES = { connecting: 'Connecting', open: 'Open', closed: 'Closed', failed: 'Failed' };

const style = (el, css) => Object.assign(el.style, css);

const shows = (el, on) => {
  el.style.display = on ? '' : 'none';
};

const SEND_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd+Enter' : 'Ctrl+Enter';

function h(tag, text, css) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (css) style(el, css);
  return el;
}

function muted(text, tag = 'span', css) {
  const el = h(tag, text, css);
  el.className = 'muted';
  return el;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

const time = (ts) => {
  const d = new Date(ts);
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

// What a send or receive event carries: text, a value the app's redactor returned, or the first bytes.
function payload(data) {
  if ('bytes' in data) {
    const bytes = Uint8Array.from(atob(data.bytes), (c) => c.charCodeAt(0));
    return { bytes, size: data.size };
  }
  const m = data.message;
  if (m !== null && typeof m === 'object' && CUT in m) {
    return { text: m[CUT].preview ?? '', size: m[CUT].size, cut: true };
  }
  if (typeof m === 'string') return { text: m, size: new TextEncoder().encode(m).length };
  const text = JSON.stringify(m) ?? String(m);
  return { text, value: m, size: text.length };
}

function parsed(p) {
  if ('value' in p) return p;
  if (p.cut || !p.text) return null;
  const t = p.text.trimStart();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  try {
    return { value: JSON.parse(p.text) };
  } catch {
    return null;
  }
}

function hex(bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const row = [...bytes.subarray(i, i + 16)];
    const codes = row.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const text = row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${i.toString(16).padStart(4, '0')}  ${codes.padEnd(47)}  ${text}`);
  }
  return lines.join('\n');
}

function preview(p) {
  if (p.bytes) return [...p.bytes.subarray(0, 24)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  return p.text.replace(/\s+/g, ' ').slice(0, 300);
}

function status(c) {
  if (c.state === 'connecting') return 'Connecting';
  if (c.state === 'open') return c.protocol ? `Open, ${c.protocol}` : 'Open';
  if (c.state === 'failed') return 'Failed';
  const { by, code, reason } = c.close ?? {};
  let text = by === 'app' ? 'Closed by the app' : by === 'peer' ? 'Closed by the server' : 'Closed';
  if (code !== undefined) text += `, ${code}${CLOSE_CODES[code] ? ` ${CLOSE_CODES[code]}` : ''}`;
  if (reason) text += `: ${reason}`;
  return text;
}

const where = (url) => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
};

export default {
  api: 1,
  id: 'web_socket_channel',
  label: 'WebSocket',
  kinds: (kind) => kind.startsWith(PREFIX),
  renderTab(el, context) {
    let alive = true;
    const conns = new Map();
    let run = null;
    let selected = null;
    // The connection the detail shows and how many of its messages are drawn.
    let shown = null;
    let drawn = 0;

    const conn = (id) => {
      let c = conns.get(id);
      if (!c) {
        c = {
          id,
          url: null,
          ts: 0,
          state: 'connecting',
          protocol: null,
          close: null,
          error: null,
          messages: [],
          count: 0,
        };
        conns.set(id, c);
      }
      return c;
    };

    const apply = (e) => {
      // A restart starts over.
      if (run !== null && e.run !== run) {
        conns.clear();
        shown = null;
      }
      run = e.run;
      const c = conn(e.data.id);
      switch (e.kind.slice(PREFIX.length)) {
        case 'connect':
          c.url = e.data.url;
          c.ts = e.ts;
          break;
        case 'open':
          c.state = 'open';
          c.protocol = e.data.protocol ?? null;
          break;
        case 'send':
        case 'receive':
          if (c.state === 'connecting') c.state = 'open';
          c.messages.push(e);
          c.count++;
          if (c.messages.length > SHOWN) c.messages.shift();
          break;
        case 'error':
          c.error = e.data.error;
          if (c.state === 'connecting') c.state = 'failed';
          break;
        case 'close':
          c.state = 'closed';
          c.close = e.data;
          break;
      }
      if (!c.ts) c.ts = e.ts;
    };

    const side = h('ul', undefined, { listStyle: 'none', margin: '0', padding: '0', flex: '0 0 240px', minWidth: '0' });
    const main = h('div', undefined, { flex: '1 1 360px', minWidth: '0' });
    style(el, { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' });
    el.append(side, main);

    const head = h('div');
    const rows = h('div', undefined, { fontFamily: 'var(--mono)', fontSize: '12px' });
    const more = muted('', 'p');

    // One box for every connection, so its text stays across a switch.
    const box = h('div', undefined, { margin: '8px 0 12px' });
    const input = h('textarea', undefined, {
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: 'var(--mono)',
      fontSize: '12px',
      resize: 'vertical',
    });
    input.rows = 3;
    input.spellcheck = false;
    input.placeholder = `Text to send. ${SEND_KEY} sends.`;
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        send();
      }
    };
    const sendButton = h('button', 'Send');
    sendButton.type = 'button';
    sendButton.onclick = () => send();
    const bar = h('div', undefined, { display: 'flex', justifyContent: 'flex-end', marginTop: '6px' });
    bar.append(sendButton);
    const note = muted('', 'p');
    box.append(input, bar, note);
    const hint = muted('Turn on Allow writes in the Plugins tab to send.', 'p');
    let sending = false;

    const send = async () => {
      const c = conns.get(selected);
      if (!c || sending || !input.value) return;
      sending = true;
      sendButton.disabled = true;
      try {
        await context.request(`${PREFIX}send`, { id: c.id, message: input.value });
        if (!alive) return;
        input.value = '';
        note.textContent = '';
      } catch (err) {
        if (alive) note.textContent = err instanceof Error ? err.message : String(err);
      }
      sending = false;
      sendButton.disabled = false;
    };

    const canSend = () => context.writes && conns.get(selected)?.state === 'open';

    const drawBox = () => {
      const open = conns.get(selected)?.state === 'open';
      shows(box, open && context.writes);
      shows(hint, open && !context.writes);
      for (const b of rows.querySelectorAll('[data-put]')) shows(b, canSend());
    };

    const row = (e) => {
      const p = payload(e.data);
      const sent = e.kind === `${PREFIX}send`;
      const ours = sent && e.data.devpul === true;
      const wrap = h('div', undefined, { borderBottom: '1px solid var(--border)' });
      const line = h('button', undefined, {
        display: 'grid',
        gridTemplateColumns: '1ch 12ch 7ch minmax(0, 1fr)',
        gap: '10px',
        alignItems: 'baseline',
        width: '100%',
        border: '0',
        background: 'transparent',
        padding: '3px 4px',
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
      });
      line.type = 'button';
      const arrow = h('span', sent ? '↑' : '↓', { color: sent ? 'var(--primary)' : 'var(--success)' });
      arrow.title = ours ? 'Sent from DevPul' : sent ? 'Sent' : 'Received';
      const cell = h('span', undefined, { display: 'flex', gap: '8px', minWidth: '0' });
      cell.append(
        h('span', preview(p), {
          flex: '1',
          minWidth: '0',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }),
      );
      if (ours) cell.append(muted('from DevPul', 'span', { flex: 'none', fontFamily: 'var(--sans)' }));
      line.append(arrow, muted(time(e.ts)), muted(formatBytes(p.size), 'span', { textAlign: 'right' }), cell);
      let detail = null;
      line.onclick = () => {
        if (detail) {
          detail.remove();
          detail = null;
          line.style.background = 'transparent';
          return;
        }
        line.style.background = 'var(--selection)';
        detail = h('div', undefined, { padding: '4px 4px 10px 28px', fontFamily: 'var(--sans)' });
        const json = parsed(p);
        if (p.bytes) {
          detail.append(
            muted(
              p.size > p.bytes.length ? `${p.size} bytes, the first ${p.bytes.length} shown` : `${p.size} bytes`,
              'p',
            ),
          );
          const dump = h('pre', hex(p.bytes));
          dump.className = 'code';
          style(dump, { whiteSpace: 'pre', overflowX: 'auto' });
          detail.append(dump);
        } else {
          const actions = h('div', undefined, { display: 'flex', gap: '8px' });
          actions.append(context.ui.copy(p.text, 'Copy'));
          if (!p.cut) {
            const put = h('button', 'Put in the box');
            put.type = 'button';
            put.dataset.put = '';
            shows(put, canSend());
            put.onclick = () => {
              input.value = p.text;
              note.textContent = '';
              input.focus();
            };
            actions.append(put);
          }
          detail.append(actions);
          if (p.cut)
            detail.append(muted(`Cut at the app's maxValueLength; ${p.size.toLocaleString()} characters in all.`, 'p'));
          if (json) {
            detail.append(context.ui.json(json.value));
          } else {
            const text = h('pre', p.text);
            text.className = 'code';
            detail.append(text);
          }
        }
        wrap.append(detail);
      };
      wrap.append(line);
      return wrap;
    };

    const drawHead = (c) => {
      const title = h('div', undefined, { display: 'flex', gap: '8px', alignItems: 'baseline' });
      title.append(
        h('h3', c.url ?? `Connection ${c.id}`, {
          flex: '1',
          minWidth: '0',
          fontFamily: 'var(--mono)',
          overflowWrap: 'anywhere',
        }),
      );
      if (c.url) title.append(context.ui.copy(c.url, 'Copy URL'));
      const state = h('p', status(c));
      const nodes = [title, state];
      if (c.error !== null)
        nodes.push(h('p', String(c.error), { color: 'var(--destructive)', overflowWrap: 'anywhere' }));
      head.replaceChildren(...nodes);
      more.textContent = c.count > SHOWN ? `The latest ${SHOWN} of ${c.count.toLocaleString()} messages.` : '';
    };

    const drawDetail = () => {
      const c = conns.get(selected);
      if (!c) {
        shown = null;
        main.replaceChildren(
          conns.size
            ? h('p', 'Select a connection.')
            : muted('No WebSockets yet. Wrap a channel with DevpulWebSocketChannel.wrap(channel, url).', 'p'),
        );
        return;
      }
      drawHead(c);
      if (shown !== c.id) {
        shown = c.id;
        drawn = 0;
        note.textContent = '';
        main.replaceChildren(head, box, hint, rows, more);
      }
      drawBox();
      if (!c.count) {
        rows.replaceChildren(muted('No messages yet.', 'p'));
        return;
      }
      if (!drawn) rows.replaceChildren();
      // Added rows go on top, so open messages stay open.
      const fresh = Math.min(c.count - drawn, SHOWN);
      const added = fresh ? c.messages.slice(-fresh) : [];
      drawn = c.count;
      for (const e of added) rows.prepend(row(e));
      while (rows.childElementCount > SHOWN) rows.lastElementChild.remove();
    };

    const drawList = () => {
      const all = [...conns.values()].sort((a, b) => b.ts - a.ts);
      side.replaceChildren(
        ...all.map((c) => {
          const li = h('li');
          const b = h('button', undefined, {
            display: 'block',
            width: '100%',
            border: '0',
            borderRadius: '4px',
            padding: '4px 8px',
            textAlign: 'left',
            cursor: 'pointer',
            background: c.id === selected ? 'var(--selection)' : 'transparent',
            opacity: c.state === 'closed' || c.state === 'failed' ? '0.6' : '1',
          });
          b.type = 'button';
          b.title = c.url ?? '';
          b.append(
            h('div', c.url ? where(c.url) : `Connection ${c.id}`, {
              fontFamily: 'var(--mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }),
            muted(`${STATES[c.state]}, ${c.count} message${c.count === 1 ? '' : 's'}`, 'div', {
              fontSize: '12px',
              ...(c.state === 'failed' && { color: 'var(--destructive)' }),
            }),
          );
          b.onclick = () => {
            selected = c.id;
            draw();
          };
          li.append(b);
          return li;
        }),
      );
    };

    const draw = () => {
      if (!conns.has(selected)) selected = [...conns.values()].sort((a, b) => b.ts - a.ts)[0]?.id ?? null;
      drawList();
      drawDetail();
    };

    for (const e of context.events) apply(e);
    draw();
    // The app's live connections fill in what events no longer in its backlog would have; the
    // next event joins whatever run it belongs to.
    context.request(`${PREFIX}connections`).then(
      (result) => {
        if (!alive) return;
        for (const p of result.connections) {
          const c = conn(p.id);
          c.url = p.url;
          if (c.state !== 'closed') c.state = p.state;
          c.protocol = p.protocol ?? null;
        }
        run = null;
        draw();
      },
      () => {},
    );
    const stop = context.onEvents((events) => {
      for (const e of events) apply(e);
      draw();
    });
    const stopWrites = context.onWritesChange(() => drawDetail());
    return () => {
      alive = false;
      stop();
      stopWrites();
    };
  },
};
