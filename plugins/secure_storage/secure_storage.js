// The Secure storage tab: the app's flutter_secure_storage keys, each value read only when revealed.

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

function textarea(value) {
  const t = h('textarea', undefined, { width: '100%', minHeight: '64px', fontFamily: 'var(--mono)' });
  t.value = value;
  t.spellcheck = false;
  return t;
}

export default {
  api: 1,
  id: 'secure_storage',
  label: 'Secure storage',
  renderTab(el, context) {
    let alive = true;
    let keys = null;
    let filter = '';
    // Values the user revealed, by key; cleared on refresh.
    const shown = new Map();
    let editing = null;

    const search = h('input', undefined, { flex: '1', minWidth: '0' });
    search.type = 'search';
    search.placeholder = 'Filter keys';
    search.oninput = () => {
      filter = search.value.toLowerCase();
      drawTable();
    };
    const bar = h('div', undefined, { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' });
    bar.append(
      search,
      button('Refresh', () => refresh()),
    );
    // Errors in note, the list's own state in status.
    const note = h('p');
    note.className = 'muted';
    const status = h('p');
    status.className = 'muted';
    const table = h('table', undefined, { width: '100%', borderCollapse: 'collapse' });
    const add = h('div', undefined, { marginTop: '12px' });
    const footer = h('p');
    footer.className = 'muted';
    el.append(bar, note, status, table, add, footer);

    const fail = (err) => {
      const message = err instanceof Error ? err.message : String(err);
      return message.includes('No handler named secure_storage.')
        ? 'The app has not called DevpulSecureStorage.install().'
        : message;
    };

    const reveal = async (key) => {
      const { value } = await context.request('secure_storage.read', { key });
      if (value === null) throw new Error(`${key} is gone. Refresh.`);
      shown.set(key, value);
    };

    // Runs a call from a row, then redraws; failures go in the note.
    const act = async (b, run) => {
      b.disabled = true;
      try {
        await run();
        note.textContent = '';
      } catch (err) {
        if (!alive) return;
        note.textContent = fail(err);
      }
      if (alive) drawTable();
    };

    // Two clicks: the first arms it for 3 s.
    const deleteButton = (key) => {
      let armed = null;
      const b = button('Delete', () => {
        if (!armed) {
          b.textContent = 'Confirm';
          b.style.color = 'var(--destructive)';
          armed = setTimeout(() => {
            armed = null;
            b.textContent = 'Delete';
            b.style.color = '';
          }, 3000);
          return;
        }
        clearTimeout(armed);
        act(b, async () => {
          await context.request('secure_storage.delete', { key });
          shown.delete(key);
          keys = keys.filter((k) => k !== key);
        });
      });
      return b;
    };

    const valueCell = (key) => {
      const cell = h('td', undefined, { padding: '4px 8px', width: '100%' });
      const actions = h('div', undefined, { display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' });
      if (editing === key) {
        const input = textarea(shown.get(key) ?? '');
        const save = button('Save', () =>
          act(save, async () => {
            await context.request('secure_storage.write', { key, value: input.value });
            shown.set(key, input.value);
            editing = null;
          }),
        );
        actions.append(
          save,
          button('Cancel', () => {
            editing = null;
            drawTable();
          }),
        );
        cell.append(input, actions);
        queueMicrotask(() => input.focus());
        return cell;
      }
      if (!shown.has(key)) {
        cell.append(h('span', '••••••••', { opacity: '0.6' }));
        const show = button('Show', () => act(show, () => reveal(key)), { marginLeft: '8px' });
        cell.append(show);
        return cell;
      }
      const value = shown.get(key);
      const pre = h('pre', value === '' ? '(empty)' : value);
      pre.className = 'code';
      actions.append(
        button('Hide', () => {
          shown.delete(key);
          drawTable();
        }),
        context.ui.copy(() => shown.get(key) ?? '', 'Copy'),
      );
      if (context.writes) {
        actions.append(
          button('Edit', () => {
            editing = key;
            drawTable();
          }),
        );
      }
      cell.append(pre, actions);
      return cell;
    };

    const drawTable = () => {
      table.replaceChildren();
      status.textContent = '';
      drawAdd();
      if (!keys) return;
      if (!keys.length) {
        status.textContent = 'No keys.';
        return;
      }
      const matching = filter ? keys.filter((k) => k.toLowerCase().includes(filter)) : keys;
      const body = h('tbody');
      for (const key of matching) {
        const row = h('tr', undefined, { borderTop: '1px solid var(--border)', verticalAlign: 'top' });
        const name = h('td', key, { padding: '4px 8px', whiteSpace: 'nowrap', fontWeight: '500' });
        row.append(name, valueCell(key));
        if (context.writes) {
          const cell = h('td', undefined, { padding: '2px 8px', textAlign: 'right' });
          cell.append(deleteButton(key));
          row.append(cell);
        }
        body.append(row);
      }
      table.append(body);
      if (!matching.length) status.textContent = 'No key matches.';
    };

    const drawAdd = () => {
      add.replaceChildren();
      footer.textContent = context.writes ? '' : 'Turn on Allow writes in the Plugins tab to add, edit and delete.';
      if (!context.writes || !keys) return;
      const key = h('input', undefined, { width: '100%', marginBottom: '6px' });
      key.placeholder = 'Key';
      const value = textarea('');
      value.placeholder = 'Value';
      const save = button('Add', () => {
        const k = key.value;
        if (!k) {
          note.textContent = 'Give a key.';
          return;
        }
        if (keys.includes(k)) {
          note.textContent = `${k} exists; edit it in the list.`;
          return;
        }
        act(save, async () => {
          await context.request('secure_storage.write', { key: k, value: value.value });
          keys = [...keys, k].sort();
          shown.set(k, value.value);
        });
      });
      add.append(h('h3', 'Add'), key, value, save);
    };

    const refresh = async () => {
      shown.clear();
      editing = null;
      status.textContent = 'Loading…';
      try {
        const result = await context.request('secure_storage.keys');
        if (!alive) return;
        keys = result.keys;
        note.textContent = '';
      } catch (err) {
        if (!alive) return;
        keys = null;
        note.textContent = fail(err);
      }
      drawTable();
    };

    refresh();
    const stop = context.onWritesChange((writes) => {
      if (!writes) editing = null;
      drawTable();
    });
    return () => {
      alive = false;
      stop();
    };
  },
};
