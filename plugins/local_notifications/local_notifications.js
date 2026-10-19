// The Notifications tab: scheduled and shown notifications, the one that launched the app, responses, and a test one.

const PREFIX = 'local_notifications.';
// Responses kept, newest first.
const SHOWN = 100;

const TYPES = {
  selectedNotification: 'Tap',
  selectedNotificationAction: 'Action',
  notificationDismissed: 'Dismissed',
};

const style = (el, css) => Object.assign(el.style, css);

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

function button(text, onclick, css) {
  const b = h('button', text, css);
  b.type = 'button';
  b.onclick = onclick;
  return b;
}

const time = (ts) => new Date(ts).toLocaleTimeString([], { hour12: false });

const cellCss = { padding: '4px 8px', overflowWrap: 'anywhere' };

const label = (r) => {
  const type = TYPES[r.type] ?? r.type;
  return r.action ? `${type} ${r.action}` : type;
};

export default {
  api: 1,
  id: 'local_notifications',
  label: 'Notifications',
  kinds: (kind) => kind.startsWith(PREFIX),
  renderTab(el, context) {
    let alive = true;
    let state = null;
    // The id the test form offers; set once the lists arrive, bumped after each show.
    let nextId = null;

    const bar = h('div', undefined, { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' });
    bar.append(button('Refresh', () => refresh()));
    // Errors in note, the lists' own state in status.
    const note = muted('', 'p');
    const status = muted('', 'p');
    const launch = h('div');
    const lists = h('div');
    const responses = h('div');
    const test = h('div', undefined, { marginTop: '12px' });
    const footer = muted('', 'p');
    el.append(bar, note, status, launch, lists, responses, test, footer);

    const fail = (err) => {
      const message = err instanceof Error ? err.message : String(err);
      return message.includes(`No handler named ${PREFIX}`)
        ? 'The app has not called DevpulLocalNotifications.install().'
        : message;
    };

    // Runs a call from the tab, then reloads the lists; failures go in the note.
    const act = async (b, run) => {
      b.disabled = true;
      try {
        await run();
        note.textContent = '';
      } catch (err) {
        if (alive) note.textContent = fail(err);
        b.disabled = false;
        return;
      }
      b.disabled = false;
      if (alive) refresh();
    };

    // Two clicks: the first arms it for 3 s.
    const cancelButton = (n) => {
      let armed = null;
      const b = button('Cancel', () => {
        if (!armed) {
          b.textContent = 'Confirm';
          b.style.color = 'var(--destructive)';
          armed = setTimeout(() => {
            armed = null;
            b.textContent = 'Cancel';
            b.style.color = '';
          }, 3000);
          return;
        }
        clearTimeout(armed);
        act(b, () => context.request(`${PREFIX}cancel`, { id: n.id, ...(n.tag && { tag: n.tag }) }));
      });
      return b;
    };

    const table = (title, items, extra) => {
      const section = h('div', undefined, { marginBottom: '12px' });
      section.append(h('h3', title));
      if (!items.length) {
        section.append(muted('None.', 'p'));
        return section;
      }
      const t = h('table', undefined, { width: '100%', borderCollapse: 'collapse' });
      const head = h('tr');
      const columns = ['Id', 'Title', 'Body', 'Payload', ...(extra ? [extra.label] : [])];
      for (const c of columns) head.append(h('th', c, { ...cellCss, textAlign: 'left', fontWeight: '500' }));
      if (context.writes) head.append(h('th'));
      const body = h('tbody');
      for (const n of items) {
        const row = h('tr', undefined, { borderTop: '1px solid var(--border)', verticalAlign: 'top' });
        row.append(
          h('td', n.id === undefined ? '' : String(n.id), { ...cellCss, fontFamily: 'var(--mono)' }),
          h('td', n.title ?? '', cellCss),
          h('td', n.body ?? '', cellCss),
          h('td', n.payload ?? '', { ...cellCss, fontFamily: 'var(--mono)' }),
        );
        if (extra) row.append(muted(extra.value(n), 'td', cellCss));
        if (context.writes) {
          const cell = h('td', undefined, { padding: '2px 8px', textAlign: 'right' });
          if (n.id !== undefined) cell.append(cancelButton(n));
          row.append(cell);
        }
        body.append(row);
      }
      const thead = h('thead');
      thead.append(head);
      t.append(thead, body);
      section.append(t);
      return section;
    };

    const drawLaunch = () => {
      launch.replaceChildren();
      const l = state?.launch;
      if (!l?.launched) return;
      const r = l.response;
      launch.append(
        h('h3', 'Launched the app'),
        r ? context.ui.keyValues({ ...r, type: label(r) }) : muted('No response details.', 'p'),
      );
    };

    const drawLists = () => {
      lists.replaceChildren();
      if (!state) return;
      const { pending, active } = state;
      if (pending) lists.append(table('Scheduled', pending));
      const channel = active?.some((n) => n.channel || n.tag);
      if (active)
        lists.append(
          table(
            'Shown',
            active,
            channel && { label: 'Channel', value: (n) => [n.channel, n.tag].filter(Boolean).join(', ') },
          ),
        );
      if (!pending && !active)
        lists.append(muted('This platform does not list scheduled or shown notifications.', 'p'));
      else if (!pending) lists.append(muted('This platform does not list scheduled notifications.', 'p'));
      else if (!active) lists.append(muted('This platform does not list shown notifications.', 'p'));
    };

    const drawResponses = () => {
      const events = context.events.filter((e) => e.kind === `${PREFIX}response`);
      responses.replaceChildren(h('h3', 'Responses'));
      if (!events.length) {
        responses.append(
          muted(
            'None yet. Pass DevpulLocalNotifications.wrap(onResponse) as onDidReceiveNotificationResponse to see taps here.',
            'p',
          ),
        );
        return;
      }
      const list = h('div', undefined, { fontSize: '13px' });
      for (const e of events.slice(-SHOWN).reverse()) {
        const r = e.data;
        const wrap = h('div', undefined, { borderTop: '1px solid var(--border)' });
        const line = button(undefined, undefined, {
          display: 'grid',
          gridTemplateColumns: '9ch 12ch 8ch minmax(0, 1fr)',
          gap: '10px',
          width: '100%',
          border: '0',
          background: 'transparent',
          padding: '4px',
          textAlign: 'left',
          font: 'inherit',
          cursor: 'pointer',
        });
        line.append(
          muted(time(e.ts)),
          h('span', label(r), { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
          h('span', r.id === undefined ? '' : String(r.id), { fontFamily: 'var(--mono)' }),
          h('span', r.payload ?? r.input ?? '', {
            fontFamily: 'var(--mono)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }),
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
          detail.append(context.ui.keyValues(r));
          wrap.append(detail);
        };
        wrap.append(line);
        list.append(wrap);
      }
      if (events.length > SHOWN) responses.append(muted(`The latest ${SHOWN} of ${events.length}.`, 'p'));
      responses.append(list);
    };

    // Built once, so what the user typed stays across refreshes.
    const form = h('div', undefined, {
      display: 'grid',
      gridTemplateColumns: 'max-content minmax(0, 1fr)',
      gap: '6px 10px',
      alignItems: 'center',
      maxWidth: '480px',
    });
    const field = (name, css) => {
      const input = h('input', undefined, { width: '100%', boxSizing: 'border-box', ...css });
      const l = h('label', name);
      l.append(input);
      // The label wraps the input for its name; the grid places both.
      style(l, { display: 'contents' });
      form.append(l);
      return input;
    };
    const idInput = field('Id', { width: '12ch' });
    idInput.inputMode = 'numeric';
    const titleInput = field('Title');
    titleInput.value = 'DevPul test';
    const bodyInput = field('Body');
    const payloadInput = field('Payload', { fontFamily: 'var(--mono)' });
    const show = button('Show', () => {
      const id = Number(idInput.value);
      if (!Number.isInteger(id) || idInput.value.trim() === '') {
        note.textContent = 'Give a whole number id.';
        return;
      }
      act(show, async () => {
        await context.request(`${PREFIX}show`, {
          id,
          title: titleInput.value,
          body: bodyInput.value,
          payload: payloadInput.value,
        });
        nextId = id + 1;
        idInput.value = String(nextId);
      });
    });
    const actions = h('div', undefined, { gridColumn: '2' });
    actions.append(show);
    form.append(actions);
    test.append(h('h3', 'Show a test'), form);

    const drawTest = () => {
      footer.textContent = context.writes
        ? ''
        : 'Turn on Allow writes in the Plugins tab to cancel and to show a test notification.';
      test.style.display = context.writes && state ? '' : 'none';
      if (nextId !== null && !idInput.value) idInput.value = String(nextId);
    };

    const draw = () => {
      drawLaunch();
      drawLists();
      drawResponses();
      drawTest();
    };

    const refresh = async () => {
      if (!state) status.textContent = 'Loading…';
      try {
        const result = await context.request(`${PREFIX}list`);
        if (!alive) return;
        state = result;
        status.textContent = '';
        note.textContent = '';
        if (nextId === null) {
          const ids = [...(result.pending ?? []), ...(result.active ?? [])].map((n) => n.id ?? 0);
          nextId = Math.max(0, ...ids) + 1;
        }
      } catch (err) {
        if (!alive) return;
        state = null;
        status.textContent = '';
        note.textContent = fail(err);
      }
      draw();
    };

    draw();
    refresh();
    // A response usually removes a shown notification.
    const stop = context.onEvents(() => refresh());
    const stopWrites = context.onWritesChange(() => draw());
    return () => {
      alive = false;
      stop();
      stopWrites();
    };
  },
};
