// The Riverpod tab: every provider with its current value and recent changes.
const riverpodPlugin = r'''
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/><path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"/></svg>';

// What an event does to the provider it names.
function step(item, e) {
  if (e.kind === 'riverpod.add') {
    item.value = e.data.value;
    item.alive = true;
  } else if (e.kind === 'riverpod.update') {
    item.value = e.data.next;
    item.history.push(e);
  } else if (e.kind === 'riverpod.dispose') {
    item.alive = false;
  }
}

const style = (el, css) => Object.assign(el.style, css);

export default {
  api: 1,
  id: 'riverpod',
  label: 'Riverpod',
  icon: ICON,
  kinds: (kind) => kind.startsWith('riverpod.'),
  renderTab(el, context) {
    const items = new Map();
    let run = null;
    let selected = null;
    let shown = null;

    const apply = (e) => {
      // A restart starts over.
      if (run !== null && e.run !== run) items.clear();
      run = e.run;
      let item = items.get(e.data.id);
      if (!item) {
        item = { id: e.data.id, name: e.data.provider, value: null, alive: true, history: [], version: 0 };
        items.set(item.id, item);
      }
      step(item, e);
      if (item.history.length > 20) item.history.shift();
      item.version++;
    };

    const list = document.createElement('ul');
    const detail = document.createElement('div');
    style(el, { display: 'flex', gap: '16px', alignItems: 'flex-start' });
    style(list, { listStyle: 'none', margin: '0', padding: '0 12px 0 0', minWidth: '200px', borderRight: '1px solid var(--border)' });
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
        detail.textContent = items.size ? 'Select a provider.' : 'No providers yet.';
        return;
      }
      const title = document.createElement('h3');
      title.textContent = item.alive ? item.name : `${item.name} (disposed)`;
      detail.append(title, context.ui.copy(() => JSON.stringify(item.value, null, 2), 'Copy value'), context.ui.json(item.value));
      if (item.history.length) {
        const recent = document.createElement('h3');
        recent.textContent = 'Recent';
        detail.append(recent);
        for (const e of item.history.toReversed()) {
          const at = document.createElement('div');
          at.className = 'muted';
          at.textContent = `${new Date(e.ts).toLocaleTimeString()} ${e.kind.slice(9)}`;
          detail.append(at, context.ui.json(e.data.next));
        }
      }
    };

    for (const e of context.events) apply(e);
    draw();
    // The app's current values win over what events rebuilt; the next event
    // joins whatever run it belongs to.
    context.call('ext.devpul_riverpod.state').then(
      (result) => {
        for (const p of result.providers) {
          const item = items.get(p.id);
          if (item) Object.assign(item, { value: p.value, alive: true, version: item.version + 1 });
          else items.set(p.id, { id: p.id, name: p.provider, value: p.value, alive: true, history: [], version: 0 });
        }
        run = null;
        draw();
      },
      () => {},
    );
    return context.onEvents((events) => {
      for (const e of events) apply(e);
      draw();
    });
  },
};
''';
