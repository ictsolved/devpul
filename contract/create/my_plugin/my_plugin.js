// @ts-check
// The My plugin tab: the latest value of each name the app sets.

/** @type {import('./devpul').DevpulPlugin} */
export default {
  api: 1,
  id: 'my_plugin',
  label: 'My plugin',
  kinds: ['my_plugin.set'],
  renderTab(el, context) {
    /** @type {Record<string, unknown>} */
    const values = {};
    /** @param {import('./devpul').PluginEvent[]} events */
    const apply = (events) => {
      for (const e of events) values[e.data.name] = e.data.value;
      el.replaceChildren(Object.keys(values).length ? context.ui.keyValues(values) : 'No values yet.');
    };
    apply(context.events);
    return context.onEvents(apply);
  },
};
