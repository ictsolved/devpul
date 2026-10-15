import { cn } from 'cn';
import { CirclePause, FlaskConical, Gauge, PencilLine, Puzzle } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Tip } from '../../components/Tip';
import type { DevEvent } from '../../core/events';
import { formatBytes, formatTime } from '../../core/json';
import type { ConnState } from '../../core/rpc';
import { sessionFields } from '../../core/session';

export interface Limited {
  app?: string;
  kind: string;
  /** 0 is muted. */
  perSecond: number;
}

interface Props {
  session: DevEvent | undefined;
  /** Session keys to show; empty shows every key that fits. */
  fields: string[];
  /** One per connection; none yet while it starts. */
  states: (ConnState | undefined)[];
  runs: number;
  notice: string | null;
  memory: { count: number; bytes: number; dropped: number; maxBytes: number };
  limited: Limited[];
  pluginErrors: Record<string, string>;
  writes: boolean;
  /** Mock rules turned on in connected apps. */
  mocks: number;
  /** Calls held at breakpoints in connected apps. */
  paused: number;
  onWritesOff: () => void;
  onOpenMocks: () => void;
  onOpenPaused: () => void;
  onOpenSettings: () => void;
  onOpenPlugins: () => void;
}

const ITEM = 'flex flex-none items-center gap-1.5 whitespace-nowrap';
const BUTTON = cn(ITEM, 'cursor-pointer rounded-sm px-1 hover:bg-secondary hover:text-foreground');

export function StatusBar(props: Props) {
  const { session, fields, states, runs, notice, memory, limited, pluginErrors, writes, onWritesOff } = props;
  const { mocks, paused, onOpenSettings, onOpenPlugins, onOpenMocks, onOpenPaused } = props;
  const errors = Object.entries(pluginErrors);
  const muted = limited.filter((l) => l.perSecond === 0).length;
  return (
    <footer className="flex h-6 flex-none items-center gap-3 border-t bg-card px-3 text-xs text-muted-foreground">
      <Connection states={states} />
      {session && (
        <span className={cn(ITEM, 'max-[560px]:hidden')}>
          started {formatTime(session.ts)}
          {runs > 1 && `, ${runs} runs`}
        </span>
      )}
      {notice ? (
        <span className="min-w-0 flex-1 truncate text-primary" role="status">
          {notice}
        </span>
      ) : (
        <SessionFields session={session} fields={fields} />
      )}
      {writes && (
        <Tip content="Plugins can change the app. Click to turn writes off." side="top" align="end">
          <button type="button" className={cn(BUTTON, 'text-warning')} onClick={onWritesOff}>
            <PencilLine size={12} />
            Writes on
          </button>
        </Tip>
      )}
      {paused > 0 && (
        <Tip content="Calls held at a breakpoint. Click to edit the first." side="top" align="end">
          <button type="button" className={cn(BUTTON, 'text-warning')} onClick={onOpenPaused}>
            <CirclePause size={12} />
            {paused} paused
          </button>
        </Tip>
      )}
      {mocks > 0 && (
        <Tip content="Mock rules change calls in the app. Click to see them." side="top" align="end">
          <button type="button" className={cn(BUTTON, 'text-warning')} onClick={onOpenMocks}>
            <FlaskConical size={12} />
            {mocks === 1 ? '1 mock' : `${mocks} mocks`}
          </button>
        </Tip>
      )}
      {limited.length > 0 && (
        <Tip content={limited.map(limitLine).join('\n')} code side="top" align="end">
          <button type="button" className={BUTTON} onClick={onOpenSettings}>
            <Gauge size={12} />
            {muted === limited.length ? `${muted} muted` : `${limited.length} limited`}
          </button>
        </Tip>
      )}
      {errors.length > 0 && (
        <Tip content={errors.map(([origin, err]) => `${origin}: ${err}`).join('\n')} side="top" align="end">
          <button type="button" className={cn(BUTTON, 'text-destructive')} onClick={onOpenPlugins}>
            <Puzzle size={12} />
            {errors.length === 1 ? '1 plugin error' : `${errors.length} plugin errors`}
          </button>
        </Tip>
      )}
      <Tip
        content={`${memory.count} events in memory, ${formatBytes(memory.bytes)} of ${formatBytes(memory.maxBytes)}; oldest dropped first.${
          memory.dropped ? ` ${memory.dropped} dropped at the limit.` : ''
        }`}
        side="top"
        align="end"
      >
        <span className={cn(ITEM, 'tabular-nums', memory.dropped > 0 && 'text-warning')}>
          {formatBytes(memory.bytes)} / {formatBytes(memory.maxBytes)}
        </span>
      </Tip>
    </footer>
  );
}

const limitLine = (l: Limited) => `${l.app ? `${l.app}: ` : ''}${l.kind} ${l.perSecond ? `${l.perSecond}/s` : 'muted'}`;

function Connection({ states }: { states: (ConnState | undefined)[] }) {
  const open = states.filter((s) => s?.status === 'open').length;
  const paused = states.some((s) => s?.status === 'open' && s.paused.length > 0);
  const [dot, text] = !states.length
    ? ['bg-muted-foreground', 'Not connected']
    : open === states.length
      ? ['bg-success', open > 1 ? `${open} connected` : 'Connected']
      : states.some((s) => !s || s.status === 'connecting')
        ? ['bg-warning', open ? `${open} of ${states.length} connected` : 'Connecting']
        : ['bg-muted-foreground', open ? `${open} of ${states.length} connected` : 'Disconnected'];
  return (
    <span className={ITEM}>
      <span className={cn('size-2 rounded-full', dot)} aria-hidden />
      {text}
      {paused && <span className="text-warning">paused</span>}
    </span>
  );
}

/** Keys stay whole; fields past the first line of the wrapping row hide behind "+N". */
function SessionFields({ session, fields }: { session: DevEvent | undefined; fields: string[] }) {
  const row = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState({ hidden: 0, end: 0 });
  const all = sessionFields(session);
  const shown = fields.length ? all.filter(([k]) => fields.includes(k)) : all;

  const measure = useCallback(() => {
    const el = row.current;
    const items = el ? ([...el.children] as HTMLElement[]) : [];
    const first = items[0];
    if (!el || !first) return;
    const width = el.clientWidth - parseFloat(getComputedStyle(el).paddingRight);
    // Only the first field can be wider than the row; a value is cut at its max width, never below.
    const visible = first.offsetWidth > width ? [] : items.filter((item) => item.offsetTop === first.offsetTop);
    const last = visible.at(-1);
    const next = { hidden: items.length - visible.length, end: last ? last.offsetLeft + last.offsetWidth : 0 };
    setFit((f) => (f.hidden === next.hidden && f.end === next.end ? f : next));
  }, []);
  // Content changes do not always resize the row.
  useLayoutEffect(measure);
  const observe = useCallback(
    (el: HTMLDivElement | null) => {
      row.current = el;
      if (!el) return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => {
        observer.disconnect();
        row.current = null;
      };
    },
    [measure],
  );

  if (!session || !shown.length) return <span className="flex-1" />;
  const tip = JSON.stringify(Object.fromEntries(all), null, 2);
  return (
    <Tip content={tip} code side="top" hoverable>
      <div className="relative h-4 min-w-0 flex-1 leading-4" aria-label="Session">
        <div
          ref={observe}
          className={cn(
            'flex h-4 flex-wrap gap-x-3.5 overflow-hidden',
            // Room for "+N"; it only narrows the row, so the count settles.
            fit.hidden > 0 && 'pr-8',
            fit.hidden === shown.length && 'invisible',
          )}
        >
          {shown.map(([k, v]) => (
            <span key={k} className="flex-none whitespace-nowrap">
              {k}{' '}
              <span className="inline-block max-w-60 truncate align-top text-foreground">
                {typeof v === 'string' ? v : JSON.stringify(v)}
              </span>
            </span>
          ))}
        </div>
        {fit.hidden > 0 && (
          <span className="absolute top-0" style={{ left: fit.end && fit.end + 8 }}>
            +{fit.hidden}
          </span>
        )}
      </div>
    </Tip>
  );
}
