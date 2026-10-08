import { buttonVariants } from '@/components/ui/button';
import { copyText } from '../../components/Copy';
import { codeClass, jsonClass, kvClass, noteClass, OPEN_FIRST, treeToggleClass } from '../../components/JsonView';
import { isObject, type Json, TRUNCATED } from '../../core/events';
import { formatBytes, pretty } from '../../core/json';
import type { PluginUi } from './plugins';

// Plain DOM, so plugins can drop elements without anything to unmount.

const CHILDREN = 200;
const BUTTON = buttonVariants({ variant: 'outline', size: 'xs' });
const CHEVRON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
const COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function leaf(value: Json): HTMLElement {
  if (typeof value === 'string') return h('span', jsonClass.str, JSON.stringify(value));
  if (typeof value === 'number') return h('span', jsonClass.num, String(value));
  if (value === null || typeof value === 'boolean') return h('span', jsonClass.lit, String(value));
  return h('span', 'text-muted-foreground', Array.isArray(value) ? '[]' : '{}');
}

function children(value: Json[] | { [key: string]: Json }, depth: number): HTMLElement {
  const ul = h('ul', depth ? 'pl-4' : undefined);
  const entries: [string, Json][] = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  const open = depth === 0 && entries.length <= OPEN_FIRST;
  let shown = 0;
  const more = h('li');
  const showMore = () => {
    for (const [k, v] of entries.slice(shown, shown + CHILDREN)) ul.insertBefore(node(k, v, depth, open), more);
    shown += CHILDREN;
    more.replaceChildren();
    if (entries.length > shown) {
      const button = h('button', BUTTON, `Show more of ${entries.length - shown}`);
      button.type = 'button';
      button.onclick = showMore;
      more.append(button);
    }
  };
  ul.append(more);
  showMore();
  return ul;
}

function node(name: string, value: Json, depth: number, open: boolean): HTMLElement {
  const li = h('li', 'wrap-anywhere');
  const empty = Array.isArray(value) ? value.length === 0 : isObject(value) && Object.keys(value).length === 0;
  if ((!isObject(value) && !Array.isArray(value)) || empty) {
    li.append(h('span', jsonClass.key, name), ': ', leaf(value));
    return li;
  }
  const toggle = h('button', treeToggleClass);
  toggle.type = 'button';
  const chevron = h('span');
  chevron.innerHTML = CHEVRON;
  const size = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
  toggle.append(chevron, h('span', jsonClass.key, name), ' ', h('span', 'text-muted-foreground', size));
  li.append(toggle);
  let list: HTMLElement | null = null;
  const set = (on: boolean) => {
    chevron.style.transform = on ? 'rotate(90deg)' : '';
    if (on) li.append((list ??= children(value, depth + 1)));
    else list?.remove();
  };
  toggle.onclick = () => set(!list?.isConnected);
  set(open);
  return li;
}

function json(value: unknown): HTMLElement {
  const v = value as Json;
  if (isObject(v) && isObject(v[TRUNCATED])) {
    const box = h('div');
    const size = typeof v[TRUNCATED].size === 'number' ? formatBytes(v[TRUNCATED].size) : 'unknown size';
    box.append(
      h('div', noteClass, `Cut by the app at its maxValueLength. Full size ${size}.`),
      h('pre', codeClass, String(v[TRUNCATED].preview ?? '')),
    );
    return box;
  }
  if (!isObject(v) && !Array.isArray(v)) return h('pre', codeClass, pretty(v));
  const tree = h('div', codeClass);
  tree.append(children(v, 0));
  return tree;
}

function keyValues(values: Record<string, unknown>): HTMLElement {
  const table = h('table', kvClass.table);
  const body = h('tbody');
  for (const [k, v] of Object.entries(values)) {
    const row = h('tr');
    row.append(h('th', kvClass.key, k), h('td', kvClass.value, typeof v === 'string' ? v : pretty(v)));
    body.append(row);
  }
  table.append(body);
  return table;
}

function copy(text: string | (() => string), label = 'Copy'): HTMLElement {
  const button = h('button', BUTTON);
  button.type = 'button';
  const show = (caption: string) => {
    button.innerHTML = COPY;
    button.append(caption);
  };
  show(label);
  button.onclick = async () => {
    show((await copyText(typeof text === 'function' ? text() : text)) ? 'Copied' : 'Failed');
    setTimeout(() => show(label), 1200);
  };
  return button;
}

export const pluginUi: PluginUi = { json, keyValues, copy };
