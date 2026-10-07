import { copyText } from '../../components/Copy';
import { isObject, type Json, TRUNCATED } from '../../core/events';
import { formatBytes, pretty } from '../../core/json';
import type { PluginUi } from './plugins';

// Plain DOM, so plugins can drop elements without anything to unmount.

const CHILDREN = 200;
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
  if (typeof value === 'string') return h('span', 'j-str', JSON.stringify(value));
  if (typeof value === 'number') return h('span', 'j-num', String(value));
  if (value === null || typeof value === 'boolean') return h('span', 'j-lit', String(value));
  return h('span', 'muted', Array.isArray(value) ? '[]' : '{}');
}

function children(value: Json[] | { [key: string]: Json }, depth: number): HTMLElement {
  const ul = h('ul');
  const entries: [string, Json][] = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  let shown = 0;
  const more = h('li');
  const showMore = () => {
    for (const [k, v] of entries.slice(shown, shown + CHILDREN)) ul.insertBefore(node(k, v, depth), more);
    shown += CHILDREN;
    more.replaceChildren();
    if (entries.length > shown) {
      const button = h('button', 'btn small', `Show more of ${entries.length - shown}`);
      button.type = 'button';
      button.onclick = showMore;
      more.append(button);
    }
  };
  ul.append(more);
  showMore();
  return ul;
}

function node(name: string, value: Json, depth: number): HTMLElement {
  const li = h('li');
  const empty = Array.isArray(value) ? value.length === 0 : isObject(value) && Object.keys(value).length === 0;
  if ((!isObject(value) && !Array.isArray(value)) || empty) {
    li.append(h('span', 'j-key', name), ': ', leaf(value));
    return li;
  }
  const toggle = h('button', 'tree-toggle');
  toggle.type = 'button';
  const chevron = h('span');
  chevron.innerHTML = CHEVRON;
  const size = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
  toggle.append(chevron, h('span', 'j-key', name), ' ', h('span', 'muted', size));
  li.append(toggle);
  let list: HTMLElement | null = null;
  const set = (open: boolean) => {
    chevron.style.transform = open ? 'rotate(90deg)' : '';
    if (open) li.append((list ??= children(value, depth + 1)));
    else list?.remove();
  };
  toggle.onclick = () => set(!list?.isConnected);
  set(depth < 1);
  return li;
}

function json(value: unknown): HTMLElement {
  const v = value as Json;
  if (isObject(v) && isObject(v[TRUNCATED])) {
    const box = h('div');
    const size = typeof v[TRUNCATED].size === 'number' ? formatBytes(v[TRUNCATED].size) : 'unknown size';
    box.append(
      h('div', 'note', `Cut by the app at its maxValueLength. Full size ${size}.`),
      h('pre', 'code', String(v[TRUNCATED].preview ?? '')),
    );
    return box;
  }
  if (!isObject(v) && !Array.isArray(v)) return h('pre', 'code', pretty(v));
  const tree = h('div', 'code tree');
  tree.append(children(v, 0));
  return tree;
}

function keyValues(values: Record<string, unknown>): HTMLElement {
  const table = h('table', 'kv');
  const body = h('tbody');
  for (const [k, v] of Object.entries(values)) {
    const row = h('tr');
    row.append(h('th', undefined, k), h('td', undefined, typeof v === 'string' ? v : pretty(v)));
    body.append(row);
  }
  table.append(body);
  return table;
}

function copy(text: string | (() => string), label = 'Copy'): HTMLElement {
  const button = h('button', 'btn small');
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
