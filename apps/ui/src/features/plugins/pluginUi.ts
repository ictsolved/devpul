import { buttonVariants } from '@/components/ui/button';
import { copyText } from '../../components/Copy';
import {
  chipClass,
  closeClass,
  codeClass,
  decodedClass,
  jsonClass,
  kvClass,
  noteClass,
  OPEN_FIRST,
  timeClass,
  treeToggleClass,
} from '../../components/JsonView';
import { contextMenu, menuButtonClass, openValueMenu } from '../../components/ValueMenu';
import { childPath, DECODE_LABELS, type DecodeAs, decodeAs, hint } from '../../core/decode';
import { isObject, type Json, TRUNCATED } from '../../core/events';
import { formatBytes, formatDateTime, pretty } from '../../core/json';
import type { PluginUi } from './plugins';

// Plain DOM, so plugins can drop elements without anything to unmount.

const CHILDREN = 200;
const BUTTON = buttonVariants({ variant: 'outline', size: 'xs' });
const CHEVRON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
const COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

const ELLIPSIS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>';
const X =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

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

function newButton(className: string, html?: string): HTMLButtonElement {
  const el = h('button', className);
  el.type = 'button';
  if (html) el.innerHTML = html;
  return el;
}

interface ValueOptions {
  name?: string;
  path?: string;
  table?: boolean;
  label?: (Node | string)[];
  /** Shown in place of the value, as a branch's toggle. */
  display?: Node;
}

/** Appends a value line with its hint and menu to `parent`; what it decodes to goes right after the line. */
function appendValue(parent: HTMLElement, v: Json, o: ValueOptions) {
  const line = h('span', 'group/value');
  const found = o.display ? undefined : hint(o.name, v);
  line.append(...(o.label ?? []), o.display ?? (o.table ? (typeof v === 'string' ? v : pretty(v)) : leaf(v)));
  let block: HTMLElement | undefined;
  let shown: DecodeAs | undefined;
  let chip: HTMLButtonElement | undefined;
  const show = (as?: DecodeAs) => {
    block?.remove();
    shown = as;
    block = as ? decoded(as, v, () => show()) : undefined;
    if (block) line.after(block);
    chip?.setAttribute('aria-expanded', String(!!as && found !== undefined && 'as' in found && as === found.as));
  };
  if (found && 'as' in found) {
    chip = newButton(chipClass);
    chip.textContent = DECODE_LABELS[found.as];
    chip.setAttribute('aria-expanded', 'false');
    chip.onclick = () => show(shown === found.as ? undefined : found.as);
    line.append(chip);
  }
  if (found && 'time' in found) line.append(h('span', timeClass, formatDateTime(found.time)));
  const menu = newButton(menuButtonClass, ELLIPSIS);
  menu.setAttribute('aria-label', 'Value menu');
  menu.setAttribute('aria-haspopup', 'menu');
  const open = () => openValueMenu({ anchor: menu, value: v, path: o.path, table: o.table, onDecode: show });
  menu.onclick = open;
  line.oncontextmenu = (e) => contextMenu(e, open);
  line.append(menu);
  parent.append(line);
}

function decoded(as: DecodeAs, v: Json, close: () => void): HTMLElement {
  const label = DECODE_LABELS[as];
  const box = h('div', decodedClass);
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', `Decoded as ${label}`);
  const head = h('div', 'flex items-center gap-1 text-xs text-muted-foreground', label);
  const x = newButton(closeClass, X);
  x.setAttribute('aria-label', `Close ${label}`);
  x.onclick = close;
  head.append(x);
  box.append(head);
  const result = decodeAs(as, v);
  if ('error' in result) box.append(h('div', noteClass, result.error));
  else if ('text' in result) box.append(h('div', undefined, result.text));
  else if ((isObject(result.value) || Array.isArray(result.value)) && Object.keys(result.value).length) {
    box.append(children(result.value, 0));
  } else appendValue(box, result.value, {});
  return box;
}

function children(v: Json[] | { [key: string]: Json }, depth: number, path?: string): HTMLElement {
  const ul = h('ul', depth ? 'pl-4' : undefined);
  const index = Array.isArray(v);
  const entries: [string, Json][] = Array.isArray(v) ? v.map((x, i) => [String(i), x]) : Object.entries(v);
  const open = depth === 0 && entries.length <= OPEN_FIRST;
  let shown = 0;
  const more = h('li');
  const showMore = () => {
    for (const [k, x] of entries.slice(shown, shown + CHILDREN)) {
      ul.insertBefore(node(k, x, depth, open, index, path === undefined ? undefined : childPath(path, k, index)), more);
    }
    shown += CHILDREN;
    more.replaceChildren();
    if (entries.length > shown) {
      const showButton = newButton(BUTTON);
      showButton.textContent = `Show more of ${entries.length - shown}`;
      showButton.onclick = showMore;
      more.append(showButton);
    }
  };
  ul.append(more);
  showMore();
  return ul;
}

function node(name: string, v: Json, depth: number, open: boolean, index: boolean, path?: string): HTMLElement {
  const li = h('li', 'wrap-anywhere');
  const empty = Array.isArray(v) ? v.length === 0 : isObject(v) && Object.keys(v).length === 0;
  if ((!isObject(v) && !Array.isArray(v)) || empty) {
    appendValue(li, v, { name: index ? undefined : name, path, label: [h('span', jsonClass.key, name), ': '] });
    return li;
  }
  const toggle = newButton(treeToggleClass);
  const chevron = h('span');
  chevron.innerHTML = CHEVRON;
  const size = Array.isArray(v) ? `[${v.length}]` : `{${Object.keys(v).length}}`;
  toggle.append(chevron, h('span', jsonClass.key, name), ' ', h('span', 'text-muted-foreground', size));
  appendValue(li, v, { path, display: toggle });
  let list: HTMLElement | null = null;
  const set = (on: boolean) => {
    chevron.style.transform = on ? 'rotate(90deg)' : '';
    if (on) li.append((list ??= children(v, depth + 1, path)));
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
  tree.append(children(v, 0, ''));
  return tree;
}

function keyValues(values: Record<string, unknown>): HTMLElement {
  const table = h('table', kvClass.table);
  const body = h('tbody');
  for (const [k, v] of Object.entries(values)) {
    const row = h('tr');
    const cell = h('td', kvClass.value);
    appendValue(cell, v as Json, { name: k, path: k, table: true });
    row.append(h('th', kvClass.key, k), cell);
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
