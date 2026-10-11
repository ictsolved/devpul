// The GoRouter tab: the app's route tree, its location and match stack, recent locations and a box that calls go.

const HISTORY = 50;

const style = (el, css) => Object.assign(el.style, css);

function h(tag, text, css) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (css) style(el, css);
  return el;
}

function button(text, onclick, css) {
  const b = h('button', text, css);
  b.type = 'button';
  b.onclick = onclick;
  return b;
}

const mono = (text, css) => h('span', text, { fontFamily: 'var(--mono)', ...css });

function muted(text, tag = 'span', css) {
  const el = h(tag, text, css);
  el.className = 'muted';
  return el;
}

function query(location) {
  const params = {};
  for (const [key, value] of new URL(location, 'http://app').searchParams) {
    params[key] = key in params ? [params[key], value].flat() : value;
  }
  return params;
}

export default {
  api: 1,
  id: 'go_router',
  label: 'GoRouter',
  kinds: ['go_router.location'],
  renderTab(el, context) {
    let alive = true;
    let routes = null;
    let current = null;
    let run = null;
    // Newest last; one run only, as a restart starts the router over.
    let history = [];
    // The box follows the app's location until the user types in it.
    let edited = false;

    style(el, { display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' });
    const side = h('div', undefined, { flex: '1 1 260px', minWidth: '0' });
    const main = h('div', undefined, { flex: '2 1 360px', minWidth: '0' });
    el.append(main, side);

    const input = h('input', undefined, { flex: '1', minWidth: '0', fontFamily: 'var(--mono)' });
    input.placeholder = '/location?query';
    input.spellcheck = false;
    input.oninput = () => {
      edited = input.value !== (current?.location ?? '');
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') go();
    };
    const goButton = button('Go', () => go());
    const bar = h('div', undefined, { display: 'flex', gap: '8px', alignItems: 'center' });
    bar.append(input, goButton);
    const note = h('p');
    note.className = 'muted';
    const now = h('div');
    const recent = h('div');
    main.append(bar, note, now, recent);

    const tree = h('div');
    const routesHead = h('div', undefined, { display: 'flex', alignItems: 'center', gap: '8px' });
    routesHead.append(
      h('h3', 'Routes', { flex: '1' }),
      button('Refresh', () => load()),
    );
    side.append(routesHead, tree);

    const fail = (err) => {
      const message = err instanceof Error ? err.message : String(err);
      return message.includes('No handler named go_router.')
        ? 'The app has not called DevpulGoRouter.attach(router).'
        : message;
    };

    const fill = (location) => {
      input.value = location;
      edited = location !== (current?.location ?? '');
      input.focus();
    };

    const go = async () => {
      const location = input.value.trim();
      if (!location) return;
      goButton.disabled = true;
      try {
        await context.request('go_router.go', { location });
        if (!alive) return;
        note.textContent = '';
        edited = false;
      } catch (err) {
        if (alive) note.textContent = fail(err);
      }
      goButton.disabled = false;
    };

    const drawCurrent = () => {
      now.replaceChildren();
      if (!edited) input.value = current?.location ?? '';
      if (!current) {
        now.append(h('p', routes ? 'No location yet.' : '', { margin: '12px 0' }));
        return;
      }
      const head = h('div', undefined, { display: 'flex', alignItems: 'center', gap: '8px' });
      head.append(h('h3', 'Location', { flex: '1' }), context.ui.copy(current.location, 'Copy'));
      const location = h('pre', current.location);
      location.className = 'code';
      now.append(head, location);
      if (current.error) now.append(h('p', current.error, { color: 'var(--destructive)' }));

      if (current.matches.length) {
        now.append(h('h3', 'Matches'));
        const list = h('ol', undefined, { listStyle: 'none', margin: '0', padding: '0' });
        for (const m of current.matches) {
          const li = h('li', undefined, {
            padding: '3px 0',
            paddingLeft: `${m.depth * 16}px`,
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'baseline',
          });
          if (m.shell) {
            li.append(muted(m.branch === undefined ? m.shell : `${m.shell}, branch ${m.branch}`));
          } else {
            li.append(mono(m.location, { fontWeight: '500' }));
            if (m.path !== m.location) li.append(mono(m.path, { opacity: '0.7' }));
            if (m.name) li.append(muted(m.name));
            if (m.pushed) li.append(muted('pushed'));
          }
          list.append(li);
        }
        now.append(list);
      }

      const params = { ...current.pathParameters };
      const search = query(current.location);
      if (Object.keys(params).length) now.append(h('h3', 'Path parameters'), context.ui.keyValues(params));
      if (Object.keys(search).length) now.append(h('h3', 'Query parameters'), context.ui.keyValues(search));
      if ('extra' in current) now.append(h('h3', 'Extra'), context.ui.json(current.extra));
    };

    const drawHistory = () => {
      recent.replaceChildren();
      if (history.length < 2) return;
      recent.append(h('h3', 'Recent'));
      const list = h('ol', undefined, { listStyle: 'none', margin: '0', padding: '0' });
      for (const e of history.toReversed().slice(1)) {
        const li = h('li', undefined, { display: 'flex', gap: '8px', alignItems: 'baseline', padding: '2px 0' });
        const at = muted(new Date(e.ts).toLocaleTimeString());
        const link = button(e.data.location, () => fill(e.data.location), {
          border: '0',
          background: 'transparent',
          padding: '0',
          fontFamily: 'var(--mono)',
          textAlign: 'left',
          overflowWrap: 'anywhere',
        });
        link.title = 'Put in the box';
        li.append(at, link);
        if (e.data.error) li.append(h('span', 'no match', { color: 'var(--destructive)' }));
        list.append(li);
      }
      recent.append(list);
    };

    const drawTree = () => {
      tree.replaceChildren();
      if (!routes) return;
      const matched = new Set((current?.matches ?? []).map((m) => m.path));
      const list = h('ul', undefined, { listStyle: 'none', margin: '0', padding: '0' });
      const add = (nodes, depth) => {
        for (const node of nodes) {
          const li = h('li', undefined, { paddingLeft: `${depth * 16}px` });
          if (node.shell) {
            li.append(muted(node.shell, 'div', { padding: '3px 8px' }));
            list.append(li);
            if (node.branches) {
              node.branches.forEach((branch, i) => {
                list.append(muted(`Branch ${i}`, 'li', { padding: '3px 0', paddingLeft: `${(depth + 1) * 16 + 8}px` }));
                add(branch, depth + 2);
              });
            } else {
              add(node.routes, depth + 1);
            }
            continue;
          }
          const row = button('', () => fill(node.path), {
            border: '0',
            width: '100%',
            textAlign: 'left',
            padding: '3px 8px',
            borderRadius: '4px',
            background: matched.has(node.path) ? 'var(--selection)' : 'transparent',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'baseline',
          });
          row.title = 'Put in the box';
          row.append(mono(node.path, { overflowWrap: 'anywhere' }));
          if (node.name) row.append(muted(node.name));
          if (node.redirect) row.append(muted('redirect'));
          li.append(row);
          list.append(li);
          add(node.routes, depth + 1);
        }
      };
      add(routes, 0);
      tree.append(list);
    };

    const draw = () => {
      drawCurrent();
      drawHistory();
      drawTree();
    };

    const apply = (e) => {
      if (run !== null && e.run !== run) history = [];
      run = e.run;
      history.push(e);
      if (history.length > HISTORY) history.shift();
      current = e.data;
    };

    const load = async () => {
      try {
        const state = await context.request('go_router.state');
        if (!alive) return;
        routes = state.routes;
        // The app's location wins over the last event, which may be from an earlier run.
        if (state.current) current = state.current;
        note.textContent = '';
      } catch (err) {
        if (!alive) return;
        note.textContent = fail(err);
      }
      draw();
    };

    for (const e of context.events) apply(e);
    draw();
    load();
    const stop = context.onEvents((events) => {
      for (const e of events) apply(e);
      draw();
    });
    return () => {
      alive = false;
      stop();
    };
  },
};
