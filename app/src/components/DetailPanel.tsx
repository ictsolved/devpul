import { SquareTerminal, X } from 'lucide-react';
import { memo } from 'react';
import { isObject, str } from '../lib/events';
import { formatBytes, formatTime, pretty } from '../lib/json';
import type { HttpRow } from '../lib/store';
import { CopyButton } from './Copy';
import { isEmptyValue, JsonView } from './JsonView';
import { Section } from './Section';

const count = (v: unknown): string | undefined => {
  if (Array.isArray(v)) return `${v.length} items`;
  if (isObject(v)) return `${Object.keys(v).length}`;
  return undefined;
};

const size = (v: unknown): string | undefined =>
  v === undefined || v === null ? 'empty' : formatBytes(pretty(v).length);

interface Props {
  row: HttpRow;
  onClose: () => void;
}

function DetailPanelInner({ row, onClose }: Props) {
  const req = row.request?.data;
  const end = (row.response ?? row.error)?.data;
  const curl = str(req?.curl);
  return (
    <aside className="detail" aria-label="Request detail">
      <div className="detail-head">
        <span className={`method m-${row.method}`}>{row.method}</span>
        <StatusBadge row={row} />
        {row.durationMs !== undefined && <span className="muted">{row.durationMs} ms</span>}
        <span className="muted">#{row.id}</span>
        <span className="muted">{formatTime(row.ts)}</span>
        <span className="grow" />
        {curl && (
          <CopyButton text={() => curl} label="curl" icon={<SquareTerminal size={13} />} />
        )}
        <button type="button" className="btn small icon" onClick={onClose} aria-label="Close detail">
          <X size={14} />
        </button>
      </div>
      <div className="detail-scroll">
        <Section id="url" title="URL" actions={<CopyButton text={() => row.url} />}>
          <div className="url-text">{row.url}</div>
        </Section>
        {row.error && (
          <Section id="error" title="Error">
            <div className="error-text">
              {str(row.error.data.errorType)}
              {str(row.error.data.message) ? `: ${str(row.error.data.message)}` : ''}
            </div>
          </Section>
        )}
        <Part id="params" title="Params" value={req?.params} summary={count(req?.params)} />
        <Part
          id="req-headers"
          title="Request headers"
          value={req?.headers}
          summary={count(req?.headers)}
        />
        <Part id="req-body" title="Request body" value={req?.body} summary={size(req?.body)} />
        <Part
          id="res-headers"
          title="Response headers"
          value={end?.headers}
          summary={end ? count(end.headers) : 'pending'}
        />
        <Part
          id="res-body"
          title="Response body"
          value={end?.body}
          summary={end ? size(end.body) : 'pending'}
        />
      </div>
    </aside>
  );
}

function Part(props: { id: string; title: string; value: unknown; summary?: string }) {
  const { id, title, value, summary } = props;
  const empty = isEmptyValue(value);
  return (
    <Section
      id={id}
      title={title}
      summary={summary}
      actions={empty ? undefined : <CopyButton text={() => pretty(value)} />}
    >
      <JsonView value={value} />
    </Section>
  );
}

export function StatusBadge({ row }: { row: HttpRow }) {
  if (row.state === 'pending') return <span className="status s-pending">pending</span>;
  const code = row.status;
  const cls =
    row.state === 'error' && !code
      ? 's-err'
      : code === undefined
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
