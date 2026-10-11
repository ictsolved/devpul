// The Files tab: the app's path_provider directories with sizes, preview, download and delete.

const CHUNK = 1024 * 1024;
const TEXT_HEAD = 64 * 1024;
const HEX_HEAD = 512;
const IMAGE_MAX = 8 * 1024 * 1024;
const IMAGES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

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
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function decode(base64) {
  const text = atob(base64);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

function hexDump(data) {
  const lines = [];
  for (let at = 0; at < data.length; at += 16) {
    const row = [...data.subarray(at, at + 16)];
    const hex = row.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${at.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  return lines.join('\n');
}

const extension = (name) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

const separator = (path) => (path.includes('/') ? '/' : '\\');

export default {
  api: 1,
  id: 'files',
  label: 'Files',
  renderTab(el, context) {
    let alive = true;
    let roots = [];
    let root = null;
    let listing = null;
    let selected = null;
    // Bumped on every navigation and selection; stale answers are dropped.
    let listToken = 0;
    let previewToken = 0;
    let objectUrl = null;
    const sizes = new Map();
    const sizeCells = new Map();
    const addCell = (path, cell) => sizeCells.set(path, [...(sizeCells.get(path) ?? []), cell]);

    const side = h('ul', undefined, {
      listStyle: 'none',
      margin: '0',
      padding: '0',
      flex: '0 0 220px',
      minWidth: '0',
    });
    const main = h('div', undefined, { flex: '1 1 320px', minWidth: '0' });
    style(el, { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' });
    el.append(side, main);

    const crumbs = h('div', undefined, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      alignItems: 'center',
      flex: '1',
    });
    const bar = h('div', undefined, { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' });
    bar.append(
      crumbs,
      button('Refresh', () => refresh()),
    );
    const note = h('p');
    note.className = 'muted';
    const table = h('table', undefined, { width: '100%', borderCollapse: 'collapse' });
    const footer = h('p');
    footer.className = 'muted';
    const detail = h('div', undefined, { marginTop: '12px' });
    main.append(bar, note, table, footer, detail);

    const sizeText = (path) => {
      const s = sizes.get(path);
      if (!s) return '…';
      return `${s.partial ? '≥ ' : ''}${formatBytes(s.size)}`;
    };

    const fail = (err) => {
      const message = err instanceof Error ? err.message : String(err);
      return message.includes('No handler named files.') ? 'The app has not called DevpulFiles.install().' : message;
    };

    const drawSide = () => {
      side.replaceChildren(
        ...roots.map((r) => {
          const li = h('li');
          const b = button(undefined, () => open(r, r.path), {
            border: '0',
            background: r === root ? 'var(--selection)' : 'transparent',
            width: '100%',
            textAlign: 'left',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
          });
          const sub = h('div', r.exists ? sizeText(r.path) : 'Not created yet');
          sub.className = 'muted';
          if (r.exists) addCell(r.path, sub);
          b.title = r.path;
          b.append(h('div', r.name), sub);
          li.append(b);
          return li;
        }),
      );
    };

    const drawCrumbs = () => {
      crumbs.replaceChildren();
      if (!root || !listing) return;
      const sep = separator(root.path);
      const rest = listing.path.slice(root.path.length + 1);
      const parts = rest ? rest.split(sep) : [];
      const link = (text, path, last) => {
        if (last) return h('strong', text);
        const a = h('a', text);
        a.href = '#';
        a.onclick = (e) => {
          e.preventDefault();
          open(root, path);
        };
        return a;
      };
      crumbs.append(link(root.name, root.path, !parts.length));
      parts.forEach((part, i) => {
        crumbs.append(h('span', sep, { opacity: '0.5' }));
        crumbs.append(link(part, root.path + sep + parts.slice(0, i + 1).join(sep), i === parts.length - 1));
      });
    };

    // Two clicks: the first arms it for 3 s.
    const deleteButton = (entry) => {
      let armed = null;
      const b = button('Delete', async () => {
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
        b.disabled = true;
        try {
          await context.request('files.delete', { path: entry.path });
          if (selected?.path === entry.path) selected = null;
          for (const path of [...sizes.keys()]) if (entry.path.startsWith(path)) sizes.delete(path);
          await load(listing.path);
          sizeRoots();
        } catch (err) {
          note.textContent = `Delete failed: ${fail(err)}`;
          b.disabled = false;
        }
      });
      return b;
    };

    const drawTable = () => {
      table.replaceChildren();
      footer.textContent = '';
      sizeCells.clear();
      drawSide();
      if (!listing) return;
      if (!listing.entries.length) {
        note.textContent = 'Empty.';
        return;
      }
      note.textContent =
        listing.total > listing.entries.length ? `First ${listing.entries.length} of ${listing.total} entries.` : '';
      const head = h('tr');
      for (const [text, align] of [
        ['Name', 'left'],
        ['Size', 'right'],
        ['Modified', 'left'],
      ]) {
        head.append(h('th', text, { textAlign: align, fontWeight: '600', padding: '4px 8px' }));
      }
      if (context.writes) head.append(h('th'));
      const body = h('tbody');
      for (const entry of listing.entries) {
        const row = h('tr', undefined, {
          borderTop: '1px solid var(--border)',
          background: selected?.path === entry.path ? 'var(--selection)' : '',
        });
        const name = h('td', undefined, { padding: '4px 8px', wordBreak: 'break-all' });
        if (entry.type === 'link') {
          name.append(h('span', `${entry.name} → ${entry.target}`, { opacity: '0.7' }));
        } else {
          const a = h('a', entry.type === 'dir' ? `${entry.name}${separator(entry.path)}` : entry.name);
          a.href = '#';
          a.onclick = (e) => {
            e.preventDefault();
            if (entry.type === 'dir') open(root, entry.path);
            else select(entry);
          };
          name.append(a);
        }
        const size = h('td', undefined, { padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap' });
        if (entry.type === 'file') size.textContent = formatBytes(entry.size);
        else if (entry.type === 'dir') {
          size.textContent = sizeText(entry.path);
          addCell(entry.path, size);
        }
        const modified = h('td', entry.modified ? new Date(entry.modified).toLocaleString() : '', {
          padding: '4px 8px',
          whiteSpace: 'nowrap',
        });
        modified.className = 'muted';
        row.append(name, size, modified);
        if (context.writes) {
          const cell = h('td', undefined, { padding: '2px 8px', textAlign: 'right' });
          cell.append(deleteButton(entry));
          row.append(cell);
        }
        body.append(row);
      }
      const thead = h('thead');
      thead.append(head);
      table.append(thead, body);
      if (!context.writes) footer.textContent = 'Turn on Allow writes in the Plugins tab to delete.';
    };

    // Directory sizes, one walk at a time, newest listing first.
    const measure = async (paths, mine) => {
      for (const path of paths) {
        if (!alive || (mine !== undefined && mine !== listToken)) return;
        if (sizes.has(path)) continue;
        try {
          sizes.set(path, await context.request('files.size', { path }));
        } catch {
          continue;
        }
        for (const cell of sizeCells.get(path) ?? []) cell.textContent = sizeText(path);
      }
    };
    const sizeRoots = () => measure(roots.filter((r) => r.exists).map((r) => r.path));

    const readAll = async (entry, onProgress) => {
      const parts = [];
      let offset = 0;
      let size = entry.size;
      while (offset < size) {
        const r = await context.request('files.read', { path: entry.path, offset, length: CHUNK });
        if (!alive) throw new Error('Closed.');
        const data = decode(r.data);
        if (!data.length) break;
        parts.push(data);
        offset += data.length;
        size = r.size;
        onProgress?.(offset, size);
      }
      return parts;
    };

    const download = async (entry, b) => {
      b.disabled = true;
      try {
        const parts = await readAll(entry, (done, size) => {
          b.textContent = `Downloading ${Math.floor((done / size) * 100)}%`;
        });
        const url = URL.createObjectURL(new Blob(parts));
        const a = document.createElement('a');
        a.href = url;
        a.download = entry.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        if (alive) note.textContent = `Download failed: ${fail(err)}`;
      }
      b.textContent = 'Download';
      b.disabled = false;
    };

    const preview = async (entry, box, mine) => {
      const type = IMAGES[extension(entry.name)];
      if (!entry.size) {
        box.textContent = 'Empty file.';
        return;
      }
      if (type && entry.size <= IMAGE_MAX) {
        const parts = await readAll(entry);
        if (mine !== previewToken) return;
        objectUrl = URL.createObjectURL(new Blob(parts, { type }));
        const img = h('img', undefined, { maxWidth: '100%', maxHeight: '480px', display: 'block' });
        img.src = objectUrl;
        img.alt = entry.name;
        box.replaceChildren(img);
        return;
      }
      const r = await context.request('files.read', { path: entry.path, length: TEXT_HEAD });
      if (mine !== previewToken) return;
      const data = decode(r.data);
      const whole = data.length >= r.size;
      let text = null;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data, { stream: !whole });
      } catch {
        // Not UTF-8.
      }
      box.replaceChildren();
      if (text === null || text.includes('\u0000')) {
        if (r.size > HEX_HEAD) box.append(h('p', `First ${HEX_HEAD} bytes of ${formatBytes(r.size)}.`));
        const pre = h('pre', hexDump(data.subarray(0, HEX_HEAD)));
        pre.className = 'code';
        box.append(pre);
        return;
      }
      if (whole && extension(entry.name) === 'json') {
        try {
          box.append(context.ui.json(JSON.parse(text)));
          return;
        } catch {
          // Shown as text.
        }
      }
      if (!whole) box.append(h('p', `First ${formatBytes(data.length)} of ${formatBytes(r.size)}.`));
      const pre = h('pre', text);
      pre.className = 'code';
      box.append(pre);
    };

    const select = (entry) => {
      selected = entry;
      const mine = ++previewToken;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      drawTable();
      detail.replaceChildren();
      const title = h('h3', entry.name, { wordBreak: 'break-all' });
      const actions = h('div', undefined, { display: 'flex', gap: '8px', margin: '6px 0' });
      const get = button('Download', () => download(entry, get));
      actions.append(get, context.ui.copy(entry.path, 'Copy path'));
      const box = h('div', 'Loading…');
      box.className = 'muted';
      detail.append(
        title,
        context.ui.keyValues({
          Path: entry.path,
          Size: `${formatBytes(entry.size)} (${entry.size.toLocaleString()} bytes)`,
          Modified: new Date(entry.modified).toLocaleString(),
        }),
        actions,
        box,
      );
      preview(entry, box, mine).then(
        () => box.classList.remove('muted'),
        (err) => {
          if (mine === previewToken) box.textContent = `Preview failed: ${fail(err)}`;
        },
      );
    };

    const load = async (path) => {
      const mine = ++listToken;
      try {
        const result = await context.request('files.list', { path });
        if (mine !== listToken || !alive) return;
        listing = result;
        if (selected && !listing.entries.some((e) => e.path === selected.path)) selected = null;
        drawCrumbs();
        drawTable();
        if (!selected) detail.replaceChildren();
        measure(
          listing.entries.filter((e) => e.type === 'dir').map((e) => e.path),
          mine,
        );
      } catch (err) {
        if (mine !== listToken || !alive) return;
        listing = null;
        drawCrumbs();
        drawTable();
        note.textContent = fail(err);
      }
    };

    const open = (r, path) => {
      root = r;
      selected = null;
      detail.replaceChildren();
      if (!r.exists) {
        listing = null;
        listToken++;
        crumbs.replaceChildren(h('strong', r.name));
        drawTable();
        note.textContent = `${r.path} does not exist yet.`;
        return;
      }
      load(path);
    };

    const refresh = async () => {
      sizes.clear();
      try {
        roots = (await context.request('files.roots')).roots;
      } catch (err) {
        roots = [];
        root = null;
        listing = null;
        drawCrumbs();
        drawTable();
        note.textContent = fail(err);
        return;
      }
      if (!alive) return;
      const again = root && roots.find((r) => r.path === root.path);
      if (again) open(again, again.exists ? (listing?.path ?? again.path) : again.path);
      else if (roots.length) open(roots[0], roots[0].path);
      else {
        drawTable();
        note.textContent = 'No directories on this platform.';
      }
      sizeRoots();
    };

    note.textContent = 'Loading…';
    refresh();
    const stop = context.onWritesChange(() => drawTable());
    return () => {
      alive = false;
      stop();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  },
};
