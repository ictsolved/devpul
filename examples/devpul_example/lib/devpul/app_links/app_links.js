// The Links tab: the app's initial link, each link it received, and a box that opens a test one.

const PREFIX = 'app_links.';
// Links drawn, newest first.
const SHOWN = 200;

const style = (el, css) => Object.assign(el.style, css);

const shows = (el, on) => {
  el.style.display = on ? '' : 'none';
};

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

function button(text, onclick) {
  const b = h('button', text);
  b.type = 'button';
  b.onclick = onclick;
  return b;
}

const time = (ts) => new Date(ts).toLocaleTimeString([], { hour12: false });

// The parts the app reads from a Uri; null when the browser cannot parse the link.
function parts(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  const query = new Map();
  for (const [k, v] of u.searchParams) query.set(k, query.has(k) ? [query.get(k), v].flat() : v);
  return {
    scheme: u.protocol.slice(0, -1),
    ...(u.username && { user: u.username }),
    ...(u.hostname && { host: u.hostname }),
    ...(u.port && { port: u.port }),
    path: u.pathname,
    // fromEntries, so a key such as __proto__ stays a key.
    ...(query.size && { query: Object.fromEntries(query) }),
    ...(u.hash.length > 1 && { fragment: u.hash.slice(1) }),
  };
}

export default {
  api: 1,
  id: 'app_links',
  label: 'Links',
  kinds: (kind) => kind.startsWith(PREFIX),
  renderTab(el, context) {
    let alive = true;
    // app_links' initial link, the first it received (on Linux not only at launch): undefined until
    // the app answers, null for none.
    let initial;
    let wrapped = false;
    let asked = null;
    let drawn = 0;

    const first = h('div', undefined, { display: 'flex', gap: '8px', alignItems: 'baseline', marginBottom: '8px' });
    const box = h('div', undefined, { margin: '8px 0 4px' });
    const field = h('div', undefined, { display: 'flex', gap: '8px' });
    const input = h('input', undefined, { flex: '1', minWidth: '0', fontFamily: 'var(--mono)' });
    input.spellcheck = false;
    input.placeholder = 'A link to open, such as example://items/1';
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        open();
      }
    };
    const openButton = button('Open', () => open());
    field.append(input, openButton);
    box.append(field);
    const note = muted('', 'p');
    const hint = muted('Turn on Allow writes in the Plugins tab to open a test link.', 'p');
    const rows = h('div', undefined, { fontSize: '13px', marginTop: '8px' });
    const more = muted('', 'p');
    el.append(first, box, note, hint, rows, more);

    let opening = false;
    const open = async () => {
      const link = input.value.trim();
      if (opening || !link) return;
      opening = true;
      openButton.disabled = true;
      try {
        await context.request(`${PREFIX}open`, { link });
        // The text stays, to open a variant next.
        if (alive) note.textContent = '';
      } catch (err) {
        if (alive) note.textContent = err instanceof Error ? err.message : String(err);
      }
      opening = false;
      openButton.disabled = false;
    };

    const links = () => context.events.filter((e) => e.kind === `${PREFIX}link`);

    const drawInitial = () => {
      if (initial === undefined) {
        first.replaceChildren();
        return;
      }
      if (initial === null) {
        first.replaceChildren(muted('No initial link.'));
        return;
      }
      first.replaceChildren(
        muted('Initial link', 'span', { flex: 'none' }),
        h('span', initial, { fontFamily: 'var(--mono)', minWidth: '0', overflowWrap: 'anywhere' }),
      );
    };

    const drawBox = () => {
      shows(box, wrapped && context.writes);
      shows(hint, wrapped && !context.writes);
      if (!context.writes) note.textContent = '';
      for (const b of rows.querySelectorAll('[data-put]')) shows(b, wrapped && context.writes);
    };

    const row = (e) => {
      const link = e.data.link;
      const wrap = h('div', undefined, { borderTop: '1px solid var(--border)' });
      const line = h('button', undefined, {
        display: 'grid',
        gridTemplateColumns: '9ch minmax(0, 1fr) auto',
        gap: '10px',
        alignItems: 'baseline',
        width: '100%',
        border: '0',
        background: 'transparent',
        padding: '4px',
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
      });
      line.type = 'button';
      line.title = link;
      line.append(
        muted(time(e.ts)),
        h('span', link, {
          fontFamily: 'var(--mono)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }),
        muted(e.data.devpul ? 'from DevPul' : ''),
      );
      let detail = null;
      line.onclick = () => {
        if (detail) {
          detail.remove();
          detail = null;
          line.style.background = 'transparent';
          return;
        }
        line.style.background = 'var(--selection)';
        detail = h('div', undefined, { padding: '4px 4px 10px' });
        const actions = h('div', undefined, { display: 'flex', gap: '8px', marginBottom: '6px' });
        const put = button('Put in the box', () => {
          input.value = link;
          note.textContent = '';
          input.focus();
        });
        put.dataset.put = '';
        shows(put, wrapped && context.writes);
        actions.append(context.ui.copy(link, 'Copy'), put);
        const p = parts(link);
        detail.append(actions, p ? context.ui.keyValues(p) : muted('The browser cannot parse this link.', 'p'));
        wrap.append(detail);
      };
      wrap.append(line);
      return wrap;
    };

    // Added rows go on top, so open ones stay open.
    const drawRows = () => {
      const events = links();
      if (!events.length) {
        drawn = 0;
        rows.replaceChildren(
          muted(
            wrapped || initial !== undefined
              ? 'No links yet.'
              : 'No links yet. Wrap the link stream with DevpulAppLinks.wrap(AppLinks().uriLinkStream).',
            'p',
          ),
        );
        more.textContent = '';
        return;
      }
      if (!drawn) rows.replaceChildren();
      const fresh = Math.min(events.length - drawn, SHOWN);
      for (const e of fresh ? events.slice(-fresh) : []) rows.prepend(row(e));
      drawn = events.length;
      while (rows.childElementCount > SHOWN) rows.lastElementChild.remove();
      more.textContent = events.length > SHOWN ? `The latest ${SHOWN} of ${events.length.toLocaleString()}.` : '';
      drawBox();
    };

    // Asked again for each run: a relaunch can come from another link.
    const ask = (run) => {
      if (run === asked) return;
      asked = run;
      context.request(`${PREFIX}initial`).then(
        (result) => {
          if (!alive) return;
          wrapped = true;
          initial = result.link ?? null;
          drawInitial();
          if (!drawn) drawRows();
          drawBox();
        },
        () => {
          if (!alive) return;
          // The handlers come with wrap, so their absence means the app has not wrapped.
          wrapped = false;
          initial = undefined;
          drawInitial();
          if (!drawn) drawRows();
          drawBox();
        },
      );
    };

    drawInitial();
    drawRows();
    drawBox();
    ask(links().at(-1)?.run);
    const stop = context.onEvents((events) => {
      drawRows();
      ask(events.at(-1).run);
    });
    const stopWrites = context.onWritesChange(() => drawBox());
    return () => {
      alive = false;
      stop();
      stopWrites();
    };
  },
};
