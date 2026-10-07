// DevPul plugin: the navigation stack after each route event sent by
// DevpulNavigatorObserver. Add this file's URL in Settings > Plugins.
export default {
  id: 'routes',
  label: 'Routes',
  kinds: ['route'],
  summarize: (e) => `${e.data.action} ${e.data.route}`,
  render(el, event, context) {
    const stack = [];
    for (const e of context?.events ?? [event]) {
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

    const title = document.createElement('h3');
    title.textContent = `Stack after ${event.data.action} ${event.data.route}`;
    const list = document.createElement('ol');
    list.reversed = true;
    for (const route of stack.toReversed()) {
      const item = document.createElement('li');
      item.textContent = route;
      if (route === event.data.route) item.style.fontWeight = '600';
      list.append(item);
    }
    el.append(title, list);

    if (event.data.arguments !== undefined) {
      const args = document.createElement('pre');
      args.className = 'code';
      args.textContent = JSON.stringify(event.data.arguments, null, 2);
      el.append(args);
    }
  },
};
