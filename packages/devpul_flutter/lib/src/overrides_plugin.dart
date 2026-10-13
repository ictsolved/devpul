// The Overrides tab: the platform settings the app sees, overridden.
const overridesPlugin = r'''
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/></svg>';

const SCALES = [0.85, 1, 1.15, 1.3, 1.5, 2, 3];
const SWITCH = [['true', 'On'], ['false', 'Off']];

function h(tag, text, css) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (css) Object.assign(el.style, css);
  return el;
}

const shown = (value) => (value === true ? 'on' : value === false ? 'off' : String(value));

export default {
  api: 1,
  id: 'overrides',
  label: 'Overrides',
  icon: ICON,
  kinds: ['overrides'],
  renderTab(el, context) {
    let alive = true;
    let state = null;

    const form = h('div', undefined, {
      display: 'grid',
      gridTemplateColumns: 'max-content minmax(0, 240px)',
      gap: '8px 16px',
      alignItems: 'center',
    });
    const reset = h('button', 'Reset all', { marginTop: '16px' });
    reset.type = 'button';
    reset.onclick = () => set({ textScale: null, brightness: null, locale: null, boldText: null, disableAnimations: null });
    const note = h('p');
    note.className = 'muted';
    const hint = h('p', 'Overrides last until the app restarts.');
    hint.className = 'muted';
    el.append(form, reset, note, hint);

    const fail = (err) => {
      const message = err instanceof Error ? err.message : String(err);
      return message.includes('No handler named overrides.')
        ? 'The app has not set MaterialApp(builder: DevpulApp.builder).'
        : message;
    };

    const set = async (args) => {
      try {
        const next = await context.request('overrides.set', args);
        if (!alive) return;
        state = next;
        note.textContent = '';
      } catch (err) {
        if (alive) note.textContent = fail(err);
      }
      draw();
    };

    const row = (label, key, options, parse) => {
      const select = h('select');
      const current = state.overrides[key];
      const system = h('option', `System (${shown(state.system[key])})`);
      system.value = '';
      select.append(system);
      for (const [value, text] of options) {
        const option = h('option', text);
        option.value = value;
        select.append(option);
      }
      select.value = current === undefined ? '' : String(current);
      select.onchange = () => set({ [key]: select.value === '' ? null : parse(select.value) });
      const name = h('label', label);
      select.id = `overrides-${key}`;
      name.htmlFor = select.id;
      form.append(name, select);
    };

    const draw = () => {
      form.replaceChildren();
      reset.hidden = !state;
      if (!state) return;
      const scale = state.overrides.textScale;
      const scales = scale === undefined || SCALES.includes(scale) ? SCALES : [...SCALES, scale].sort((a, b) => a - b);
      row('Text scale', 'textScale', scales.map((s) => [String(s), String(s)]), Number);
      row('Brightness', 'brightness', [['light', 'Light'], ['dark', 'Dark']], String);
      row('Locale', 'locale', state.locales.map((l) => [l, l]), String);
      row('Bold text', 'boldText', SWITCH, (v) => v === 'true');
      row('Disable animations', 'disableAnimations', SWITCH, (v) => v === 'true');
      reset.disabled = Object.keys(state.overrides).length === 0;
      if (state.themeMode && state.themeMode !== 'system') {
        const mode = h('p', `The app sets themeMode: ${state.themeMode}, so brightness does not change its theme.`);
        mode.className = 'muted';
        mode.style.gridColumn = '1 / -1';
        form.append(mode);
      }
    };

    const load = async () => {
      try {
        const next = await context.request('overrides.state');
        if (!alive) return;
        state = next;
        note.textContent = '';
      } catch (err) {
        if (alive) note.textContent = fail(err);
      }
      draw();
    };

    draw();
    load();
    // An agent, another tab or a restart changed them.
    const stop = context.onEvents(() => load());
    return () => {
      alive = false;
      stop();
    };
  },
};
''';
