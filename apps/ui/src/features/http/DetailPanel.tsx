import { cn } from 'cn';
import { ArrowLeft, Braces, ListTree, SquareTerminal } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '../../components/Copy';
import { type BodyMode, isEmptyValue, JsonView, KeyValues } from '../../components/JsonView';
import { Detail } from '../../components/Panes';
import { Section } from '../../components/Section';
import { Tip } from '../../components/Tip';
import { isObject, str } from '../../core/events';
import { toFetch } from '../../core/fetch';
import { DART_IO } from '../../core/profile';
import { formatBytes, formatTime, pretty } from '../../core/json';
import type { HttpRow } from '../../core/store';
import { useStored } from '../../lib/storage';

const count = (v: unknown): string | undefined => {
  if (Array.isArray(v)) return `${v.length} items`;
  if (isObject(v)) return `${Object.keys(v).length}`;
  return undefined;
};

const size = (v: unknown): string =>
  v === undefined || v === null
    ? 'empty'
    : formatBytes(new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)).length);

const breakClass = 'font-mono text-xs break-all';

interface Props {
  row: HttpRow;
  onClose: () => void;
  onBack?: () => void;
}

function DetailPanelInner({ row, onClose, onBack }: Props) {
  const [mode, setMode] = useStored<BodyMode>('bodyMode', 'raw');
  const req = row.request?.data;
  const end = (row.response ?? row.error)?.data;
  const curl = str(req?.curl);
  const fetchCode = toFetch(row);
  const finalUrl = str(end?.finalUrl);
  return (
    <Detail
      label="Request detail"
      onClose={onClose}
      head={
        <>
          {onBack && (
            <Button type="button" variant="outline" size="xs" onClick={onBack}>
              <ArrowLeft />
              Back to error
            </Button>
          )}
          <Method method={row.method} />
          <StatusBadge row={row} />
          {row.durationMs !== undefined && <span className="text-muted-foreground">{row.durationMs} ms</span>}
          {row.size !== undefined && <span className="text-muted-foreground">{formatBytes(row.size)}</span>}
          {row.source === DART_IO ? (
            <Tip content="Read from dart:io's HTTP profile. The app's ignore and redact settings do not apply.">
              <span className="text-muted-foreground">dart:io</span>
            </Tip>
          ) : (
            <span className="text-muted-foreground">#{row.id}</span>
          )}
          <span className="text-muted-foreground">{formatTime(row.ts)}</span>
          <span className="flex-1" />
          <Tip content="Switch between tree and raw JSON">
            <Button type="button" variant="outline" size="xs" onClick={() => setMode(mode === 'tree' ? 'raw' : 'tree')}>
              {mode === 'tree' ? <Braces /> : <ListTree />}
              {mode === 'tree' ? 'Raw' : 'Tree'}
            </Button>
          </Tip>
          {curl && <CopyButton text={() => curl} label="curl" icon={<SquareTerminal />} />}
          {fetchCode && <CopyButton text={() => fetchCode} label="fetch" />}
        </>
      }
    >
      <Section id="url" title="URL" actions={<CopyButton text={() => row.url} />}>
        <div className={breakClass}>{row.url}</div>
        {finalUrl && finalUrl !== row.url && (
          <div className={breakClass}>
            <span className="text-muted-foreground">redirected to </span>
            {finalUrl}
          </div>
        )}
      </Section>
      {row.error && (
        <Section id="error" title="Error">
          <div className={cn(breakClass, 'text-destructive')}>
            {str(row.error.data.errorType)}
            {str(row.error.data.message) ? `: ${str(row.error.data.message)}` : ''}
          </div>
        </Section>
      )}
      <Part id="params" title="Params" value={req?.params} summary={count(req?.params)} table />
      <Part id="req-headers" title="Request headers" value={req?.headers} summary={count(req?.headers)} table />
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
    </Detail>
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

const STATUS = 'font-mono text-xs font-semibold';
const PENDING = 'font-mono text-xs text-muted-foreground';

export function StatusBadge({ row }: { row: HttpRow }) {
  if (row.state === 'pending') return <span className={PENDING}>pending</span>;
  const code = row.status;
  if (row.state === 'error' && !code && str(row.error?.data.errorType) === 'cancel') {
    return <span className={PENDING}>cancel</span>;
  }
  const color =
    code === undefined || code >= 500
      ? 'text-destructive'
      : code >= 400
        ? 'text-warning'
        : code >= 300
          ? 'text-primary'
          : 'text-success';
  return <span className={cn(STATUS, color)}>{code ?? 'ERR'}</span>;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-primary',
  POST: 'text-warning',
  PUT: 'text-warning',
  PATCH: 'text-warning',
  DELETE: 'text-destructive',
};

export function Method({ method }: { method: string }) {
  return <span className={cn('font-mono font-semibold', METHOD_COLORS[method])}>{method}</span>;
}

export const DetailPanel = memo(DetailPanelInner);
