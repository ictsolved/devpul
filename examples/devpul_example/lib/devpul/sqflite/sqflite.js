// The SQLite tab: the databases the app passed to DevpulSqflite.add, their tables and views, and a SQL console.

const PAGE = 100;

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

const quote = (name) => `"${name.replaceAll('"', '""')}"`;

// A cell as plain text; null stays null.
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if ('blob' in value) return `BLOB ${formatBytes(value.blob)}${value.head ? `: ${value.head}` : ''}`;
  if ('text' in value) return `${value.text}… (${value.length.toLocaleString()} characters, cut)`;
  if ('int' in value) return value.int;
  return value.real;
}

export default {
  api: 1,
  id: 'sqflite',
  label: 'SQLite',
  renderTab(el, context) {
    let alive = true;
    let databases = [];
    let db = null;
    let schema = [];
    // {console: true} or a sqlite_master row.
    let view = { console: true };
    let offset = 0;
    let count = null;
    let result = null;
    let selected = null;
    let sql = '';
    let consoleResult = null;
    // Bumped on each load; stale answers are dropped.
    let token = 0;

    const side = h('div', undefined, { flex: '0 0 220px', minWidth: '0' });
    const main = h('div', undefined, { flex: '1 1 320px', minWidth: '0' });
    style(el, { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' });
    el.append(side, main);

    const fail = (err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No handler named sqflite.')) return 'The app has not called DevpulSqflite.add(db).';
      if (message.startsWith('No answer from the app')) {
        return `${message} The statement may still be running in the app; add a LIMIT or a narrower WHERE.`;
      }
      return message;
    };

    const request = (name, args) => context.request(name, { db, ...args });
    const read = (statement) => request('sqflite.query', { sql: statement });

    const sideButton = (text, active, onclick) => {
      const b = button(text, onclick, {
        border: '0',
        background: active ? 'var(--selection)' : 'transparent',
        width: '100%',
        textAlign: 'left',
        padding: '4px 8px',
        borderRadius: '4px',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
      b.title = text;
      return b;
    };

    const drawSide = () => {
      side.replaceChildren();
      if (databases.length > 1) {
        const pick = h('select', undefined, { width: '100%', marginBottom: '8px' });
        for (const d of databases) {
          const option = h('option', d.name);
          option.value = d.name;
          option.title = d.path;
          pick.append(option);
        }
        pick.value = db;
        pick.onchange = () => {
          db = pick.value;
          view = { console: true };
          consoleResult = null;
          loadSchema();
        };
        side.append(pick);
      } else if (db) {
        const name = h('div', db, { fontWeight: '600', padding: '4px 8px' });
        name.title = databases[0]?.path ?? '';
        side.append(name);
      }
      side.append(button('Refresh', () => refresh(), { margin: '0 0 8px 8px' }));
      if (!db) return;
      side.append(sideButton('SQL console', view.console, () => openConsole()));
      for (const [type, heading] of [
        ['table', 'Tables'],
        ['view', 'Views'],
      ]) {
        const items = schema.filter((s) => s.type === type);
        if (!items.length) continue;
        const title = h('div', heading, { padding: '8px 8px 2px', fontSize: '12px' });
        title.className = 'muted';
        side.append(title);
        for (const item of items) {
          side.append(sideButton(item.name, view.name === item.name, () => openTable(item)));
        }
      }
    };

    const cell = (value) => {
      const td = h('td', undefined, {
        padding: '3px 8px',
        maxWidth: '320px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
      const text = plain(value);
      if (text === null) {
        td.textContent = 'NULL';
        td.className = 'muted';
      } else {
        td.textContent = String(text);
        td.title = String(text).slice(0, 2000);
        if (typeof value === 'number' || (typeof value === 'object' && 'int' in value)) td.style.textAlign = 'right';
        if (typeof value === 'object') td.style.fontFamily = 'var(--mono)';
      }
      return td;
    };

    // The rows of a result; a click shows one row below.
    const grid = (r, detail) => {
      const box = h('div', undefined, { overflowX: 'auto' });
      if (!r.rows.length) {
        const empty = h('p', 'No rows.');
        empty.className = 'muted';
        box.append(empty);
        return box;
      }
      const table = h('table', undefined, { borderCollapse: 'collapse', fontSize: '13px' });
      const head = h('tr');
      for (const c of r.columns) {
        head.append(h('th', c, { textAlign: 'left', fontWeight: '600', padding: '4px 8px', whiteSpace: 'nowrap' }));
      }
      const thead = h('thead');
      thead.append(head);
      const body = h('tbody');
      r.rows.forEach((values, i) => {
        const row = h('tr', undefined, {
          borderTop: '1px solid var(--border)',
          cursor: 'pointer',
          background: selected === i ? 'var(--selection)' : '',
        });
        row.onclick = () => {
          selected = selected === i ? null : i;
          for (const [j, tr] of [...body.children].entries()) {
            tr.style.background = selected === j ? 'var(--selection)' : '';
          }
          detail.replaceChildren();
          if (selected === null) return;
          detail.append(
            context.ui.keyValues(Object.fromEntries(r.columns.map((c, k) => [c, plain(r.rows[selected][k])]))),
          );
        };
        row.append(...values.map(cell));
        body.append(row);
      });
      table.append(thead, body);
      box.append(table);
      return box;
    };

    const drawTable = () => {
      main.replaceChildren();
      const item = view;
      const bar = h('div', undefined, { display: 'flex', gap: '8px', alignItems: 'baseline', marginBottom: '8px' });
      const counted = h('span', count === null ? '' : `${count.toLocaleString()} rows`);
      counted.className = 'muted';
      bar.append(h('h3', item.name, { margin: '0', wordBreak: 'break-all' }), counted);
      const ddl = h('details', undefined, { marginBottom: '8px' });
      ddl.append(h('summary', 'Schema'));
      const related = schema.filter((s) => s.tbl_name === item.name && s.sql);
      const pre = h('pre', related.map((s) => `${s.sql};`).join('\n\n'));
      pre.className = 'code';
      ddl.append(pre);
      main.append(bar, ddl);
      if (!result) return;
      const detail = h('div', undefined, { marginTop: '12px' });
      const pager = h('div', undefined, { display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0' });
      const last = offset + result.rows.length;
      const range = h(
        'span',
        result.rows.length ? `${offset + 1}-${last}${count === null ? '' : ` of ${count.toLocaleString()}`}` : '',
      );
      range.className = 'muted';
      const prev = button('Previous', () => openTable(item, Math.max(0, offset - PAGE)));
      prev.disabled = offset === 0;
      const next = button('Next', () => openTable(item, offset + PAGE));
      next.disabled = count === null ? result.rows.length < PAGE : offset + PAGE >= count;
      pager.append(prev, next, range);
      main.append(pager, grid(result, detail));
      if (result.more) {
        const cut = h('p', `Only ${result.rows.length} rows of this page fit in 1 MB.`);
        cut.className = 'muted';
        main.append(cut);
      }
      main.append(detail);
    };

    const openTable = async (item, at = 0) => {
      const mine = ++token;
      if (view !== item) count = null;
      view = item;
      offset = at;
      result = null;
      selected = null;
      drawSide();
      drawTable();
      const loading = h('p', 'Loading…');
      loading.className = 'muted';
      main.append(loading);
      const name = quote(item.name);
      try {
        const [page, total] = await Promise.all([
          read(`SELECT * FROM ${name} LIMIT ${PAGE} OFFSET ${at}`),
          count === null ? read(`SELECT count(*) FROM ${name}`).catch(() => null) : null,
        ]);
        if (mine !== token || !alive) return;
        if (total) count = total.rows[0][0];
        result = page;
        drawTable();
      } catch (err) {
        if (mine !== token || !alive) return;
        loading.textContent = fail(err);
        main.append(loading);
      }
    };

    const drawConsole = () => {
      main.replaceChildren();
      const input = h('textarea', undefined, {
        width: '100%',
        minHeight: '96px',
        fontFamily: 'var(--mono)',
      });
      input.value = sql;
      input.spellcheck = false;
      input.placeholder = 'SELECT * FROM sqlite_master';
      input.oninput = () => {
        sql = input.value;
      };
      const out = h('div');
      const run = button('Run', () => execute(run, out));
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          execute(run, out);
        }
      };
      const hint = h(
        'span',
        context.writes
          ? "Ctrl+Enter runs. Writes are on: any statement runs on the app's connection."
          : 'Ctrl+Enter runs. Reads only; turn on Allow writes in the Plugins tab for anything else.',
      );
      hint.className = 'muted';
      const bar = h('div', undefined, { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0 12px' });
      bar.append(run, hint);
      main.append(input, bar, out);
      drawResult(out);
      queueMicrotask(() => input.focus());
    };

    const drawResult = (out) => {
      out.replaceChildren();
      const r = consoleResult;
      if (!r) return;
      const status = h('p');
      status.className = 'muted';
      out.append(status);
      if (r.error) {
        status.textContent = r.error;
        return;
      }
      if ('changes' in r) {
        status.textContent = `Done. ${r.changes} ${r.changes === 1 ? 'row' : 'rows'} changed.`;
        return;
      }
      status.textContent = r.more
        ? `First ${r.rows.length} rows; the rest stay unread (500 rows or 1 MB per run).`
        : `${r.rows.length} ${r.rows.length === 1 ? 'row' : 'rows'}.`;
      const detail = h('div', undefined, { marginTop: '12px' });
      out.append(grid(r, detail), detail);
    };

    const execute = async (run, out) => {
      if (!sql.trim()) return;
      const mine = ++token;
      run.disabled = true;
      selected = null;
      try {
        consoleResult = await request(context.writes ? 'sqflite.execute' : 'sqflite.query', { sql });
      } catch (err) {
        consoleResult = { error: fail(err) };
      }
      if (!alive) return;
      run.disabled = false;
      if (mine !== token) return;
      drawResult(out);
      // A write may have changed the schema.
      if (context.writes && !consoleResult.error) loadSchema(false);
    };

    const openConsole = () => {
      token++;
      view = { console: true };
      selected = null;
      drawSide();
      drawConsole();
    };

    const loadSchema = async (open = true) => {
      try {
        const r = await read(
          "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name",
        );
        if (!alive) return;
        schema = r.rows.map(([type, name, tbl_name, sql]) => ({ type, name, tbl_name, sql }));
      } catch (err) {
        if (!alive) return;
        schema = [];
        main.replaceChildren(h('p', fail(err)));
        drawSide();
        return;
      }
      if (!open) {
        drawSide();
        return;
      }
      const again = !view.console && schema.find((s) => s.name === view.name);
      if (again) openTable(again, offset);
      else openConsole();
    };

    const refresh = async () => {
      main.replaceChildren(h('p', 'Loading…'));
      try {
        databases = (await context.request('sqflite.databases')).databases;
      } catch (err) {
        if (!alive) return;
        databases = [];
        db = null;
        drawSide();
        main.replaceChildren(h('p', fail(err)));
        return;
      }
      if (!alive) return;
      if (!databases.some((d) => d.name === db)) db = databases[0]?.name ?? null;
      if (!db) {
        drawSide();
        main.replaceChildren(h('p', 'No open databases. Pass one to DevpulSqflite.add(db).'));
        return;
      }
      loadSchema();
    };

    refresh();
    const stop = context.onWritesChange(() => {
      if (view.console) drawConsole();
    });
    return () => {
      alive = false;
      stop();
    };
  },
};
