import { cn } from 'cn';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isObject, type Json, TRUNCATED } from '../core/events';
import { headerValue } from '../core/fetch';
import { formatBytes, highlight, pretty } from '../core/json';

const LIMIT = 100_000;
const CHILDREN = 200;

// Shared with the plain DOM that plugins get from context.ui.
export const codeClass = 'm-0 rounded-md bg-secondary px-2.5 py-2 whitespace-pre-wrap wrap-anywhere';
export const noteClass = 'mb-1.5 text-xs text-warning';
export const treeToggleClass = '-ml-3.5 inline-flex items-center gap-0.5 [&_svg]:text-muted-foreground';
export const jsonClass = {
  key: 'text-json-key',
  str: 'text-json-string',
  num: 'text-json-number',
  lit: 'text-json-literal',
};
// highlight() marks tokens with j-* classes.
const highlightClass =
  '[&_.j-key]:text-json-key [&_.j-lit]:text-json-literal [&_.j-num]:text-json-number [&_.j-str]:text-json-string';
export const kvClass = {
  table: 'w-full border-collapse font-mono text-xs',
  key: 'w-[34%] max-w-60 border-b py-0.5 pr-2 text-left align-top font-semibold wrap-anywhere text-json-key',
  value: 'border-b py-0.5 pr-2 text-left align-top wrap-anywhere',
};

export type BodyMode = 'tree' | 'raw';

export const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (isObject(value) && Object.keys(value).length === 0);

function Truncated({ marker }: { marker: Json }) {
  const m = isObject(marker) ? marker : {};
  const size = typeof m.size === 'number' ? formatBytes(m.size) : 'unknown size';
  return (
    <div>
      <div className={noteClass}>Cut by the app at its maxValueLength. Full size {size}.</div>
      <pre className={codeClass}>{String(m.preview ?? '')}</pre>
    </div>
  );
}

function JsonViewInner({ value, mode = 'raw' }: { value: unknown; mode?: BodyMode }) {
  const [all, setAll] = useState(false);
  if (isEmptyValue(value)) return <div className="text-muted-foreground">empty</div>;
  if (isObject(value) && value[TRUNCATED] !== undefined) return <Truncated marker={value[TRUNCATED]} />;
  if (mode === 'tree' && (isObject(value) || Array.isArray(value))) {
    return (
      <div className={codeClass}>
        <Children value={value} depth={0} />
      </div>
    );
  }
  const text = pretty(value);
  const long = text.length > LIMIT && !all;
  const shown = long ? text.slice(0, LIMIT) : text;
  return (
    <div>
      {typeof value === 'string' ? (
        <pre className={codeClass}>{shown}</pre>
      ) : (
        <pre className={cn(codeClass, highlightClass)} dangerouslySetInnerHTML={{ __html: highlight(shown) }} />
      )}
      {long && (
        <Button type="button" variant="outline" size="xs" onClick={() => setAll(true)}>
          Show all ({formatBytes(text.length)})
        </Button>
      )}
    </div>
  );
}

export const JsonView = memo(JsonViewInner);

function Children({ value, depth }: { value: Json[] | { [key: string]: Json }; depth: number }) {
  const [limit, setLimit] = useState(CHILDREN);
  const entries: [string, Json][] = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  return (
    <ul className={depth ? 'pl-4' : undefined}>
      {entries.slice(0, limit).map(([k, v]) => (
        <TreeNode key={k} name={k} value={v} depth={depth} />
      ))}
      {entries.length > limit && (
        <li>
          <Button type="button" variant="outline" size="xs" onClick={() => setLimit(limit + CHILDREN)}>
            Show {Math.min(CHILDREN, entries.length - limit)} more of {entries.length - limit}
          </Button>
        </li>
      )}
    </ul>
  );
}

function TreeNode({ name, value, depth }: { name: string; value: Json; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const branch = isObject(value) || Array.isArray(value);
  if (!branch || isEmptyValue(value)) {
    return (
      <li className="wrap-anywhere">
        <span className={jsonClass.key}>{name}</span>: <Leaf value={value} />
      </li>
    );
  }
  const size = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
  return (
    <li className="wrap-anywhere">
      <button type="button" className={treeToggleClass} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className={jsonClass.key}>{name}</span> <span className="text-muted-foreground">{size}</span>
      </button>
      {open && <Children value={value} depth={depth + 1} />}
    </li>
  );
}

function Leaf({ value }: { value: Json }) {
  if (typeof value === 'string') return <span className={jsonClass.str}>{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className={jsonClass.num}>{value}</span>;
  if (value === null || typeof value === 'boolean') return <span className={jsonClass.lit}>{String(value)}</span>;
  return <span className="text-muted-foreground">{Array.isArray(value) ? '[]' : '{}'}</span>;
}

/** Headers and params: one row per value. */
export function KeyValues({ value }: { value: unknown }) {
  if (!isObject(value)) return <JsonView value={value} />;
  if (isEmptyValue(value)) return <div className="text-muted-foreground">empty</div>;
  if (value[TRUNCATED] !== undefined) return <Truncated marker={value[TRUNCATED]} />;
  const rows = Object.entries(value).flatMap(([k, v]) =>
    Array.isArray(v) ? v.map((x, i) => [`${k}|${i}`, k, headerValue(x)]) : [[k, k, v === null ? '' : headerValue(v)]],
  );
  return (
    <table className={kvClass.table}>
      <tbody>
        {rows.map(([id, k, v]) => (
          <tr key={id}>
            <th className={kvClass.key}>{k}</th>
            <td className={kvClass.value}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
