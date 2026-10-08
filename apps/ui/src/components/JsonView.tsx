import { cn } from 'cn';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isObject, type Json, TRUNCATED } from '../core/events';
import { headerValue } from '../core/fetch';
import { chunkLines, formatBytes, highlight, pretty } from '../core/json';

const LIMIT = 100_000;
const CHUNK = 50_000;
// Coloring a few MB of JSON makes hundreds of thousands of spans; past this it stays plain.
const HIGHLIGHT_LIMIT = 1_000_000;
const CHILDREN = 200;
// Top-level branches start open when there are this many or fewer.
export const OPEN_FIRST = 10;

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
  if (isEmptyValue(value)) return <div className="text-muted-foreground">empty</div>;
  if (isObject(value) && value[TRUNCATED] !== undefined) return <Truncated marker={value[TRUNCATED]} />;
  if (mode === 'tree' && (isObject(value) || Array.isArray(value))) {
    return (
      <div className={codeClass}>
        <Children value={value} depth={0} />
      </div>
    );
  }
  return <Raw value={value} />;
}

function Raw({ value }: { value: unknown }) {
  const [all, setAll] = useState(false);
  const text = useMemo(() => pretty(value), [value]);
  const long = text.length > LIMIT && !all;
  const chunks = useMemo(() => chunkLines(long ? text.slice(0, LIMIT) : text, CHUNK), [text, long]);
  const colored = typeof value !== 'string' && (long || text.length <= HIGHLIGHT_LIMIT);
  return (
    <div>
      <pre className={cn(codeClass, colored && highlightClass)}>
        {chunks.map((chunk, i) => (
          <div
            key={i}
            // Off-screen chunks skip layout, so a body of several MB opens at once.
            style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${lineCount(chunk)}lh` }}
            {...(colored ? { dangerouslySetInnerHTML: { __html: highlight(chunk) } } : { children: chunk })}
          />
        ))}
      </pre>
      {long && (
        <Button type="button" variant="outline" size="xs" onClick={() => setAll(true)}>
          Show all ({formatBytes(text.length)})
        </Button>
      )}
    </div>
  );
}

const lineCount = (text: string) => {
  let n = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < text.length - 1; i = text.indexOf('\n', i + 1)) n++;
  return n;
};

export const JsonView = memo(JsonViewInner);

function Children({ value, depth }: { value: Json[] | { [key: string]: Json }; depth: number }) {
  const [limit, setLimit] = useState(CHILDREN);
  const shown: [string, Json][] = Array.isArray(value)
    ? value.slice(0, limit).map((v, i) => [String(i), v])
    : Object.entries(value).slice(0, limit);
  const total = Array.isArray(value) ? value.length : Object.keys(value).length;
  const open = depth === 0 && total <= OPEN_FIRST;
  return (
    <ul className={depth ? 'pl-4' : undefined}>
      {shown.map(([k, v]) => (
        <TreeNode key={k} name={k} value={v} depth={depth} open={open} />
      ))}
      {total > limit && (
        <li>
          <Button type="button" variant="outline" size="xs" onClick={() => setLimit(limit + CHILDREN)}>
            Show {Math.min(CHILDREN, total - limit)} more of {total - limit}
          </Button>
        </li>
      )}
    </ul>
  );
}

function TreeNode(props: { name: string; value: Json; depth: number; open: boolean }) {
  const { name, value, depth } = props;
  const [open, setOpen] = useState(props.open);
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
      <button type="button" className={treeToggleClass} onClick={() => setOpen(!open)} aria-expanded={open}>
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
