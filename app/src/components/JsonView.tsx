import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useState } from 'react';
import { isObject, type Json, TRUNCATED } from '../lib/events';
import { headerValue } from '../lib/fetch';
import { formatBytes, highlight, pretty } from '../lib/json';

const LIMIT = 100_000;
const CHILDREN = 200;

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
      <div className="note">Cut by the app at its maxValueLength. Full size {size}.</div>
      <pre className="code">{String(m.preview ?? '')}</pre>
    </div>
  );
}

function JsonViewInner({ value, mode = 'raw' }: { value: unknown; mode?: BodyMode }) {
  const [all, setAll] = useState(false);
  if (isEmptyValue(value)) return <div className="muted">empty</div>;
  if (isObject(value) && value[TRUNCATED] !== undefined) return <Truncated marker={value[TRUNCATED]} />;
  if (mode === 'tree' && (isObject(value) || Array.isArray(value))) {
    return (
      <div className="code tree">
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
        <pre className="code">{shown}</pre>
      ) : (
        <pre className="code" dangerouslySetInnerHTML={{ __html: highlight(shown) }} />
      )}
      {long && (
        <button type="button" className="btn small" onClick={() => setAll(true)}>
          Show all ({formatBytes(text.length)})
        </button>
      )}
    </div>
  );
}

export const JsonView = memo(JsonViewInner);

function Children({ value, depth }: { value: Json[] | { [key: string]: Json }; depth: number }) {
  const [limit, setLimit] = useState(CHILDREN);
  const entries: [string, Json][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  return (
    <ul>
      {entries.slice(0, limit).map(([k, v]) => (
        <TreeNode key={k} name={k} value={v} depth={depth} />
      ))}
      {entries.length > limit && (
        <li>
          <button type="button" className="btn small" onClick={() => setLimit(limit + CHILDREN)}>
            Show {Math.min(CHILDREN, entries.length - limit)} more of {entries.length - limit}
          </button>
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
      <li>
        <span className="j-key">{name}</span>: <Leaf value={value} />
      </li>
    );
  }
  const size = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
  return (
    <li>
      <button type="button" className="tree-toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="j-key">{name}</span> <span className="muted">{size}</span>
      </button>
      {open && <Children value={value} depth={depth + 1} />}
    </li>
  );
}

function Leaf({ value }: { value: Json }) {
  if (typeof value === 'string') return <span className="j-str">{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className="j-num">{value}</span>;
  if (value === null || typeof value === 'boolean') return <span className="j-lit">{String(value)}</span>;
  return <span className="muted">{Array.isArray(value) ? '[]' : '{}'}</span>;
}

/** Headers and params: one row per value. */
export function KeyValues({ value }: { value: unknown }) {
  if (!isObject(value)) return <JsonView value={value} />;
  if (isEmptyValue(value)) return <div className="muted">empty</div>;
  if (value[TRUNCATED] !== undefined) return <Truncated marker={value[TRUNCATED]} />;
  const rows = Object.entries(value).flatMap(([k, v]) =>
    Array.isArray(v) ? v.map((x, i) => [`${k}|${i}`, k, headerValue(x)]) : [[k, k, v === null ? '' : headerValue(v)]],
  );
  return (
    <table className="kv">
      <tbody>
        {rows.map(([id, k, v]) => (
          <tr key={id}>
            <th>{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
