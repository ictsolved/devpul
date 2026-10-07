// The Routes tab: the navigation stack after each `route` event.
const routesPlugin = r'''
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>';

function stackAt(events, event) {
  const stack = [];
  for (const e of events) {
    if (e.run !== event.run) continue;
    const { action, route, previous } = e.data;
    if (action === 'push') {
      stack.push(route);
    } else if (action === 'pop' || action === 'remove') {
      const i = stack.lastIndexOf(route);
      if (i >= 0) stack.splice(i, 1);
    } else if (action === 'replace') {
      const i = stack.lastIndexOf(previous);
      if (i >= 0) stack[i] = route;
      else stack.push(route);
    }
    if (e.key === event.key) break;
  }
  return stack;
}

export default {
  api: 1,
  id: 'routes',
  label: 'Routes',
  icon: ICON,
  kinds: ['route'],
  summarize: (e) => `${e.data.action} ${e.data.route}`,
  render(el, event, context) {
    const title = document.createElement('h3');
    title.textContent = `Stack after ${event.data.action} ${event.data.route}`;
    const list = document.createElement('ol');
    list.reversed = true;
    for (const route of stackAt(context.events, event).reverse()) {
      const item = document.createElement('li');
      item.textContent = route;
      if (route === event.data.route) item.style.fontWeight = '600';
      list.append(item);
    }
    el.append(title, list);
    if (event.data.arguments !== undefined) {
      const label = document.createElement('h3');
      label.textContent = 'Arguments';
      el.append(label, context.ui.json(event.data.arguments));
    }
  },
};
''';
