import { cn } from 'cn';
import { FlaskConical, Repeat, SquareTerminal } from 'lucide-react';
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '../../components/Copy';
import { ImagePreview, isEmptyValue, JsonModeToggle, JsonView, KeyValues, kvClass } from '../../components/JsonView';
import { BackButton, Detail } from '../../components/Panes';
import { Section } from '../../components/Section';
import { Tip } from '../../components/Tip';
import type { Cause } from '../../core/cause';
import { type DevEvent, isObject, type JsonObject, preview, str } from '../../core/events';
import { toFetch } from '../../core/fetch';
import { type DataImage, dataImage, svgImage } from '../../core/image';
import { DART_IO } from '../../core/profile';
import { formatBytes, formatDateTime, formatTime, pretty } from '../../core/json';
import { bearerJwt, expiry, type Jwt, TIME_CLAIMS } from '../../core/jwt';
import { type Editable, parsePaused } from '../../core/mocks';
import type { HttpRow } from '../../core/store';
import { Breakpoint } from './Breakpoint';
import { ReplayForm } from './Replay';

const count = (v: unknown): string | undefined => {
  if (Array.isArray(v)) return `${v.length} items`;
  if (isObject(v)) return `${Object.keys(v).length}`;
  return undefined;
};

const size = (v: unknown): string =>
  v === undefined || v === null
    ? 'empty'
    : formatBytes(
        dataImage(v)?.bytes ?? new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)).length,
      );

const breakClass = 'font-mono text-xs break-all';

/** What started a call, with the call or event it names if they are kept. */
export interface StartedBy {
  cause: Cause;
  row?: HttpRow;
  event?: DevEvent;
  open?: () => void;
}

/** Loads the request as the app sent it and sends it again. */
export interface Replayer {
  load: () => Promise<Editable>;
  send: (args: JsonObject) => Promise<void>;
}

interface Props {
  row: HttpRow;
  onClose: () => void;
  onBack?: () => void;
  /** Opens a mock rule made from this call; set while its app takes rules. */
  onMock?: () => void;
  /** Lets the call go on from a breakpoint; set while its app is connected. */
  onResume?: (args: JsonObject) => Promise<void>;
  /** Set while its app is connected and can send the call again. */
  replay?: Replayer;
  startedBy?: StartedBy;
}

function DetailPanelInner({ row, onClose, onBack, onMock, onResume, replay, startedBy }: Props) {
  const [replaying, setReplaying] = useState<Editable | string | null>(null);
  const req = row.request?.data;
  const endEvent = row.response ?? row.error;
  const end = endEvent?.data;
  const curl = str(req?.curl);
  const fetchCode = toFetch(row);
  const finalUrl = str(end?.finalUrl);
  const jwt = bearerJwt(req?.headers);
  return (
    <Detail
      label="Request detail"
      onClose={onClose}
      head={
        <>
          {onBack && <BackButton onClick={onBack} />}
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
          {row.mock && <MockMark mode={row.mock} />}
          <span className="flex-1" />
          <JsonModeToggle />
          {onMock && (
            <Tip content="Mock this call: a rule that answers it with this response, to edit">
              <Button type="button" variant="ghost" size="sm" onClick={onMock}>
                <FlaskConical />
                Mock
              </Button>
            </Tip>
          )}
          {replay && (
            <Tip content="Send this request again from the app, as it was sent or edited">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={replaying !== null}
                onClick={() => {
                  if (replaying !== null) return setReplaying(null);
                  replay
                    .load()
                    .then(setReplaying, (err: unknown) =>
                      setReplaying(err instanceof Error ? err.message : String(err)),
                    );
                }}
              >
                <Repeat />
                Replay
              </Button>
            </Tip>
          )}
          {curl && <CopyButton text={() => curl} label="curl" icon={<SquareTerminal />} />}
          {fetchCode && <CopyButton text={() => fetchCode} label="fetch" />}
        </>
      }
    >
      {row.state === 'paused' && row.paused && onResume && (
        <Breakpoint key={row.paused.key} paused={parsePaused(row.paused)} onResume={onResume} />
      )}
      {replay && typeof replaying === 'string' && (
        <p className="border-b px-3 py-2 text-xs text-destructive">{replaying}</p>
      )}
      {replay && replaying !== null && typeof replaying !== 'string' && (
        <ReplayForm sent={replaying} onSend={replay.send} onCancel={() => setReplaying(null)} />
      )}
      {startedBy && <Started by={startedBy} />}
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
      <Part
        id="req-headers"
        title="Request headers"
        value={req?.headers}
        summary={count(req?.headers)}
        table
        headers
        at={row.ts}
      />
      {jwt && <Token jwt={jwt} sentAt={row.ts} />}
      <Part
        id="req-body"
        title="Request body"
        value={req?.body}
        summary={size(req?.body)}
        image={svgImage(req?.body, req?.headers)}
      />
      <Part
        id="res-headers"
        title="Response headers"
        value={end?.headers}
        summary={end ? count(end.headers) : 'pending'}
        table
        headers
        at={endEvent?.ts}
      />
      <Part
        id="res-body"
        title="Response body"
        value={end?.body}
        summary={end ? (row.size === undefined ? size(end.body) : formatBytes(row.size)) : 'pending'}
        image={svgImage(end?.body, end?.headers)}
      />
    </Detail>
  );
}

const startedClass = 'flex w-full min-w-0 items-baseline gap-2 rounded px-1 py-[3px] text-left font-mono text-xs';

function Started({ by }: { by: StartedBy }) {
  const { cause, row, event, open } = by;
  const content =
    cause.type === 'replay' ? (
      <>
        <span className="text-muted-foreground">replay of #{cause.id}</span>
        {row && (
          <>
            <Method method={row.method} />
            <StatusBadge row={row} />
            <span className="truncate">{row.url}</span>
          </>
        )}
      </>
    ) : cause.type === 'action' ? (
      <>
        <span className="text-muted-foreground">action</span>
        <span className="truncate font-sans">{cause.name}</span>
      </>
    ) : (
      <>
        <span className="text-muted-foreground">{cause.kind}</span>
        <span className="truncate">{event ? preview(event) : 'no longer kept'}</span>
      </>
    );
  return (
    <Section id="cause" title="Started by">
      {open ? (
        <button type="button" className={cn(startedClass, 'cursor-pointer hover:bg-secondary')} onClick={open}>
          {content}
        </button>
      ) : (
        <div className={startedClass}>{content}</div>
      )}
    </Section>
  );
}

function Part(props: {
  id: string;
  title: string;
  value: unknown;
  summary?: string;
  table?: boolean;
  headers?: boolean;
  at?: number;
  image?: DataImage;
}) {
  const { id, title, value, summary, table, headers, at, image } = props;
  const empty = isEmptyValue(value);
  return (
    <Section
      id={id}
      title={title}
      summary={summary}
      actions={empty ? undefined : <CopyButton text={() => pretty(value)} />}
    >
      {image && (
        <div className="mb-1.5">
          <ImagePreview image={image} />
        </div>
      )}
      {table ? <KeyValues value={value} headers={headers} at={at} /> : <JsonView value={value} />}
    </Section>
  );
}

const subClass = 'mb-0.5 text-xs text-muted-foreground';

function Token({ jwt, sentAt }: { jwt: Jwt; sentAt: number }) {
  return (
    <Section
      id="req-token"
      title="Bearer token"
      summary={expiry(jwt.claims, sentAt)}
      actions={<CopyButton text={() => pretty({ header: jwt.header, claims: jwt.claims })} />}
    >
      <h4 className={subClass}>Claims</h4>
      <Claims value={jwt.claims} />
      <h4 className={cn(subClass, 'mt-2')}>Header</h4>
      <Claims value={jwt.header} />
    </Section>
  );
}

function Claims({ value }: { value: JsonObject }) {
  return (
    <table className={kvClass.table}>
      <tbody>
        {Object.entries(value).map(([k, v]) => (
          <tr key={k}>
            <th className={kvClass.key}>{k}</th>
            <td className={kvClass.value}>
              {TIME_CLAIMS.has(k) && typeof v === 'number' ? (
                <>
                  {formatDateTime(v * 1000)} <span className="text-muted-foreground">{v}</span>
                </>
              ) : typeof v === 'string' ? (
                v
              ) : (
                JSON.stringify(v)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STATUS = 'font-mono text-xs font-semibold';
const PENDING = 'font-mono text-xs text-muted-foreground';

const MOCK_TIPS: Record<string, string> = {
  respond: 'Answered by a mock rule; nothing was sent.',
  fail: 'Failed by a mock rule; nothing was sent.',
  delay: 'Delayed by a mock rule.',
  pause: 'Held at a breakpoint and let go.',
};

export function MockMark({ mode }: { mode: string }) {
  return (
    <Tip content={MOCK_TIPS[mode] ?? 'Changed by a mock rule.'}>
      <span className="inline-flex items-center gap-0.5 text-xs text-warning">
        <FlaskConical size={12} aria-hidden />
        {mode}
      </span>
    </Tip>
  );
}

export function StatusBadge({ row }: { row: HttpRow }) {
  if (row.state === 'pending') return <span className={PENDING}>pending</span>;
  if (row.state === 'paused') return <span className={cn(STATUS, 'text-warning')}>paused</span>;
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
