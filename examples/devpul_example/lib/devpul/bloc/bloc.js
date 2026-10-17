// The Bloc tab: every bloc and cubit with its current state and recent events.

// What an event does to the bloc it names.
function step(item, e) {
  if (e.kind === 'bloc.create') {
    item.value = e.data.state;
    item.alive = true;
  } else if (e.kind === 'bloc.change') {
    item.value = e.data.next;
    item.history.push(e);
  } else if (e.kind === 'bloc.event') {
    item.history.push(e);
  } else if (e.kind === 'bloc.close') {
    item.alive = false;
  }
}

const style = (el, css) => Object.assign(el.style, css);

export default {
  api: 1,
  id: 'bloc',
  label: 'Bloc',
  kinds: (kind) => kind.startsWith('bloc.'),
  renderTab(el, context) {
    const items = new Map();
    // HTTP calls by the key of the bloc.event that started them, and the bloc of each such event.
    const started = new Map();
    const owner = new Map();
    let run = null;
    let selected = null;
    let shown = null;

    const apply = (e) => {
      // A restart starts over.
      if (run !== null && e.run !== run) {
        items.clear();
        started.clear();
        owner.clear();
      }
      run = e.run;
      let item = items.get(e.data.id);
      if (!item) {
        item = { id: e.data.id, name: e.data.bloc, value: null, alive: true, history: [], version: 0 };
        items.set(item.id, item);
      }
      step(item, e);
      if (e.kind === 'bloc.event') owner.set(e.key, item.id);
      if (item.history.length > 20) {
        const gone = item.history.shift();
        started.delete(gone.key);
        owner.delete(gone.key);
      }
      item.version++;
    };

    const link = (r) => {
      const id = owner.get(r.event);
      if (id === undefined) return;
      let calls = started.get(r.event);
      if (!calls) started.set(r.event, (calls = new Map()));
      calls.set(r.key, r);
      const item = items.get(id);
      if (item) item.version++;
    };

    const list = document.createElement('ul');
    const detail = document.createElement('div');
    style(el, { display: 'flex', gap: '16px', alignItems: 'flex-start' });
    style(list, {
      listStyle: 'none',
      margin: '0',
      padding: '0 12px 0 0',
      minWidth: '200px',
      borderRight: '1px solid var(--border)',
    });
    style(detail, { flex: '1', minWidth: '0' });
    el.append(list, detail);

    const draw = () => {
      const all = [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
      const twins = new Set(all.filter((a, i) => all.some((b, j) => i !== j && a.name === b.name)).map((a) => a.id));
      list.replaceChildren(
        ...all.map((item) => {
          const li = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = twins.has(item.id) ? `${item.name} #${item.id}` : item.name;
          style(button, {
            border: '0',
            background: item.id === selected ? 'var(--selection)' : 'transparent',
            width: '100%',
            textAlign: 'left',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: item.alive ? '1' : '0.5',
          });
          button.onclick = () => {
            selected = item.id;
            draw();
          };
          li.append(button);
          return li;
        }),
      );

      const item = items.get(selected);
      // Redraw only on change, so open tree nodes stay open.
      const key = item ? `${item.id}|${item.version}` : String(items.size);
      if (key === shown) return;
      shown = key;
      detail.replaceChildren();
      if (!item) {
        detail.textContent = items.size ? 'Select a bloc.' : 'No blocs yet.';
        return;
      }
      const title = document.createElement('h3');
      title.textContent = item.alive ? item.name : `${item.name} (closed)`;
      detail.append(
        title,
        context.ui.copy(() => JSON.stringify(item.value, null, 2), 'Copy state'),
        context.ui.json(item.value),
      );
      if (item.history.length) {
        const recent = document.createElement('h3');
        recent.textContent = 'Recent';
        detail.append(recent);
        for (const e of item.history.toReversed()) {
          const at = document.createElement('div');
          at.className = 'muted';
          at.textContent = `${new Date(e.ts).toLocaleTimeString()} ${e.kind.slice(5)}`;
          detail.append(at, context.ui.json(e.kind === 'bloc.event' ? e.data.event : e.data.next));
          for (const r of started.get(e.key)?.values() ?? []) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `${r.method} ${r.status ?? r.state} ${r.url}`;
            style(button, {
              display: 'block',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              border: '0',
              background: 'transparent',
              padding: '2px 0',
              cursor: 'pointer',
              color: 'var(--primary)',
              fontFamily: 'var(--mono)',
              fontSize: '12px',
            });
            button.onclick = () => context.openRequest(r.key);
            detail.append(button);
          }
        }
      }
    };

    for (const e of context.events) apply(e);
    // DevPul 1.0 does not pass the calls events started.
    for (const r of context.requests ?? []) link(r);
    draw();
    // The app's current values win over what events rebuilt; the next event
    // joins whatever run it belongs to.
    context.request('bloc.state').then(
      (result) => {
        for (const p of result.blocs) {
          const item = items.get(p.id);
          if (item) Object.assign(item, { value: p.value, alive: true, version: item.version + 1 });
          else items.set(p.id, { id: p.id, name: p.bloc, value: p.value, alive: true, history: [], version: 0 });
        }
        run = null;
        draw();
      },
      () => {},
    );
    context.onRequests?.((requests) => {
      for (const r of requests) link(r);
      draw();
    });
    return context.onEvents((events) => {
      for (const e of events) apply(e);
      draw();
    });
  },
};
