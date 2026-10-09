// The Cart tab: item count and total for each cart change.
export default {
  api: 1,
  id: 'cart',
  label: 'Cart',
  kinds: ['cart.updated'],
  summarize: (e) => `${e.data.items} items, ${e.data.total}`,
  render(el, e, context) {
    el.append(context.ui.keyValues({ items: e.data.items, total: e.data.total }));
  },
};
