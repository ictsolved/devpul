// The Flags tab: feature flags the app reports, as a table.
export default {
  api: 1,
  id: 'flags',
  label: 'Flags',
  kinds: ['flags'],
  render(el, e, context) {
    el.append(context.ui.keyValues(e.data));
  },
};
