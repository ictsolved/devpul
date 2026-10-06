import { X } from 'lucide-react';
import { type CSSProperties, type ReactNode, type RefObject, useCallback, useMemo, useState } from 'react';
import { type DevEvent, tagsOf } from '../lib/events';
import { matchesQuery, matchesTag, parseQuery } from '../lib/filter';
import { useStored } from '../lib/storage';
import { PauseButton, useListKeys, usePause, ValueChips } from './list';
import { VirtualList } from './VirtualList';

const ROW = 26;

export interface Facet {
  id: string;
  label: string;
  of: (e: DevEvent) => string | undefined;
  render?: (value: string) => string;
  max?: number;
  /** Shown before the chips when the values alone are ambiguous. */
  prefix?: string;
}

export interface Group {
  count: number;
  first: number;
}

interface Props {
  id: string;
  events: readonly DevEvent[];
  filterRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  /** Query keys beyond kind and tag. */
  keys?: readonly string[];
  field?: (e: DevEvent, key: string, value: string) => boolean;
  facets?: Facet[];
  /** Offers a toggle that folds events with the same key into one row. */
  groupBy?: (e: DevEvent) => string;
  columns: string;
  cells: (e: DevEvent, group?: Group) => ReactNode;
  head: (e: DevEvent, group?: Group) => ReactNode;
  body: (e: DevEvent, group?: Group) => ReactNode;
  empty: string;
}

interface Stored {
  text: string;
  facets: Record<string, string[]>;
  grouped: boolean;
}

const searchCache = new WeakMap<DevEvent, string>();
const haystack = (e: DevEvent) => {
  let text = searchCache.get(e);
  if (text === undefined) {
    text = `${e.kind}\n${JSON.stringify(e.data)}`.toLowerCase();
    searchCache.set(e, text);
  }
  return text;
};

export function EventList(props: Props) {
  const { id, events, filterRef, placeholder, keys = [], field, facets = [], groupBy } = props;
  const [state, setState] = useStored<Stored>(`${id}Filter`, { text: '', facets: {}, grouped: false });
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = parseQuery(state.text, ['kind', 'tag', ...keys]);
    const active = facets.filter((f) => state.facets[f.id]?.length);
    return events.filter((e) => {
      for (const f of active) {
        const v = f.of(e);
        if (v === undefined || !state.facets[f.id]?.includes(v)) return false;
      }
      return matchesQuery(
        q,
        () => haystack(e),
        (key, value) =>
          key === 'kind'
            ? e.kind.toLowerCase().includes(value.toLowerCase())
            : key === 'tag'
              ? matchesTag(tagsOf(e), value)
              : (field?.(e, key, value) ?? false),
      );
    });
    // Facets and field are defined inline by callers; their behavior is fixed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [events, state]);

  const { visible, paused, newCount, toggle } = usePause(filtered);

  const grouping = groupBy && state.grouped;
  const { rows, groups } = useMemo(() => {
    if (!grouping) return { rows: visible, groups: null };
    const byKey = new Map<string, Group>();
    const firsts: DevEvent[] = [];
    // Newest first, so the first of a key is the latest occurrence.
    for (const e of visible) {
      const k = groupBy(e);
      const g = byKey.get(k);
      if (g) {
        g.count++;
        g.first = Math.min(g.first, e.ts);
      } else {
        byKey.set(k, { count: 1, first: e.ts });
        firsts.push(e);
      }
    }
    return { rows: firsts, groups: byKey };
  }, [visible, grouping, groupBy]);
  const groupOf = (e: DevEvent) => (groups && groupBy ? groups.get(groupBy(e)) : undefined);
  // Grouped rows are picked by group, so a newer repeat keeps the selection.
  const keyOf = useCallback((e: DevEvent) => (grouping ? groupBy(e) : e.key), [grouping, groupBy]);

  const rowKeys = useMemo(() => rows.map(keyOf), [rows, keyOf]);
  useListKeys(rowKeys, selected, setSelected);
  const current = selected ? rows.find((e) => keyOf(e) === selected) : undefined;
  const values = (f: Facet) =>
    [...new Set(events.map(f.of).filter((v): v is string => v !== undefined))].toSorted();

  return (
    <div className={`pane-split ${current ? 'has-detail' : ''}`}>
      <div className="pane-main">
        <div className="toolbar">
          <input
            ref={filterRef}
            className="filter"
            type="search"
            placeholder={placeholder}
            value={state.text}
            onChange={(e) => setState({ ...state, text: e.target.value })}
            aria-label="Filter"
          />
          {facets.map((f) => (
            <ValueChips
              key={f.id}
              label={f.label}
              values={values(f)}
              selected={state.facets[f.id] ?? []}
              onChange={(v) => setState({ ...state, facets: { ...state.facets, [f.id]: v } })}
              render={f.render}
              max={f.max}
              prefix={f.prefix}
            />
          ))}
          <span className="grow" />
          {groupBy && (
            <button
              type="button"
              className={`chip ${state.grouped ? 'on' : ''}`}
              onClick={() => setState({ ...state, grouped: !state.grouped })}
            >
              Group repeats
            </button>
          )}
          <PauseButton paused={paused} newCount={newCount} onClick={toggle} />
        </div>
        {rows.length === 0 ? (
          <div className="muted empty">{events.length ? 'Nothing matches the filter.' : props.empty}</div>
        ) : (
          <VirtualList
            items={rows}
            rowHeight={ROW}
            scrollToIndex={current ? rows.indexOf(current) : -1}
            render={(e) => (
              <div
                key={e.key}
                className={`event-row ${selected === keyOf(e) ? 'selected' : ''}`}
                style={{ height: ROW, '--cols': props.columns } as CSSProperties}
                onClick={() => setSelected(keyOf(e))}
              >
                {props.cells(e, groupOf(e))}
              </div>
            )}
          />
        )}
      </div>
      {current && (
        <aside className="detail" aria-label="Detail">
          <div className="detail-head">
            {props.head(current, groupOf(current))}
            <button
              type="button"
              className="btn small icon"
              onClick={() => setSelected(null)}
              aria-label="Close detail"
            >
              <X size={14} />
            </button>
          </div>
          <div className="detail-scroll">{props.body(current, groupOf(current))}</div>
        </aside>
      )}
    </div>
  );
}
