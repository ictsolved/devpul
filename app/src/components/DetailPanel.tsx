import { Braces, ListTree, SquareTerminal, X } from 'lucide-react';
import { memo } from 'react';
import { isObject, str } from '../lib/events';
import { toFetch } from '../lib/fetch';
import { formatBytes, formatTime, pretty } from '../lib/json';
import { useStored } from '../lib/storage';
import type { HttpRow } from '../lib/store';
import { CopyButton } from './Copy';
import { type BodyMode, isEmptyValue, JsonView, KeyValues } from './JsonView';
import { Section } from './Section';

const count = (v: unknown): string | undefined => {
  if (Array.isArray(v)) return `${v.length} items`;
  if (isObject(v)) return `${Object.keys(v).length}`;
  return undefined;
};

const size = (v: unknown): string =>
  v === undefined || v === null
    ? 'empty'
    : formatBytes(new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)).length);

interface Props {
  row: HttpRow;
  onClose: () => void;
}

function DetailPanelInner({ row, onClose }: Props) {
  const [mode, setMode] = useStored<BodyMode>('bodyMode', 'tree');
  const req = row.request?.data;
  const end = (row.response ?? row.error)?.data;
  const curl = str(req?.curl);
  const fetchCode = toFetch(row);
  const finalUrl = str(end?.finalUrl);
  return (
    <aside className="detail" aria-label="Request detail">
      <div className="detail-head">
        <span className={`method m-${row.method}`}>{row.method}</span>
        <StatusBadge row={row} />
        {row.durationMs !== undefined && <span className="muted">{row.durationMs} ms</span>}
        {row.size !== undefined && <span className="muted">{formatBytes(row.size)}</span>}
        <span className="muted">#{row.id}</span>
        <span className="muted">{formatTime(row.ts)}</span>
        <span className="grow" />
        <button
          type="button"
          className="btn small"
          onClick={() => setMode(mode === 'tree' ? 'raw' : 'tree')}
          data-tip="Switch between tree and raw JSON"
        >
          {mode === 'tree' ? <Braces size={13} /> : <ListTree size={13} />}
          {mode === 'tree' ? 'Raw' : 'Tree'}
        </button>
        {curl && <CopyButton text={() => curl} label="curl" icon={<SquareTerminal size={13} />} />}
        {fetchCode && <CopyButton text={() => fetchCode} label="fetch" />}
        <button type="button" className="btn small icon" onClick={onClose} aria-label="Close detail">
          <X size={14} />
        </button>
      </div>
      <div className="detail-scroll">
        <Section id="url" title="URL" actions={<CopyButton text={() => row.url} />}>
          <div className="url-text">{row.url}</div>
          {finalUrl && finalUrl !== row.url && (
            <div className="url-text">
              <span className="muted">redirected to </span>
              {finalUrl}
            </div>
          )}
        </Section>
        {row.error && (
          <Section id="error" title="Error">
            <div className="error-text">
              {str(row.error.data.errorType)}
              {str(row.error.data.message) ? `: ${str(row.error.data.message)}` : ''}
            </div>
          </Section>
        )}
        <Part id="params" title="Params" value={req?.params} summary={count(req?.params)} table />
        <Part
          id="req-headers"
          title="Request headers"
          value={req?.headers}
          summary={count(req?.headers)}
          table
        />
        <Part id="req-body" title="Request body" value={req?.body} summary={size(req?.body)} mode={mode} />
        <Part
          id="res-headers"
          title="Response headers"
          value={end?.headers}
          summary={end ? count(end.headers) : 'pending'}
          table
        />
        <Part
          id="res-body"
          title="Response body"
          value={end?.body}
          summary={end ? (row.size === undefined ? size(end.body) : formatBytes(row.size)) : 'pending'}
          mode={mode}
        />
      </div>
    </aside>
  );
}

function Part(props: {
  id: string;
  title: string;
  value: unknown;
  summary?: string;
  table?: boolean;
  mode?: BodyMode;
}) {
  const { id, title, value, summary, table, mode } = props;
  const empty = isEmptyValue(value);
  return (
    <Section
      id={id}
      title={title}
      summary={summary}
      actions={empty ? undefined : <CopyButton text={() => pretty(value)} />}
    >
      {table ? <KeyValues value={value} /> : <JsonView value={value} mode={mode} />}
    </Section>
  );
}

export function StatusBadge({ row }: { row: HttpRow }) {
  if (row.state === 'pending') return <span className="status s-pending">pending</span>;
  const code = row.status;
  if (row.state === 'error' && !code && str(row.error?.data.errorType) === 'cancel') {
    return <span className="status s-pending">cancel</span>;
  }
  const cls =
    code === undefined
      ? 's-err'
      : code >= 500
        ? 's-5xx'
        : code >= 400
          ? 's-4xx'
          : code >= 300
            ? 's-3xx'
            : 's-2xx';
  return <span className={`status ${cls}`}>{code ?? 'ERR'}</span>;
}

export const DetailPanel = memo(DetailPanelInner);
