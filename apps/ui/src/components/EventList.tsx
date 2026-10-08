import { cn } from 'cn';
import { memo, type ReactNode, type RefObject, useCallback, useMemo } from 'react';
import type { DevEvent } from '../core/events';
import { matchesQuery, matchesTag, parseQuery } from '../core/filter';
import { Input } from '@/components/ui/input';
import { useStored } from '../lib/storage';
import { Detail, Split } from './Panes';
import { VirtualList } from './VirtualList';
import { Chip, filterClass, PauseButton, rowClass, toolbarClass, useListKeys, usePause, ValueChips } from './list';

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

/** A tab's selection, kept in the store. */
export interface ListSelection {
  selected: string | null;
  onSelect: (key: string | null) => void;
}

type Cells = (e: DevEvent, group?: Group) => ReactNode;

interface Props extends ListSelection {
  id: string;
  /** Names the grid. */
  label: string;
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
  /** One `role="gridcell"` element per column. Keep it stable (module level or useCallback): rows re-render when it changes. */
  cells: Cells;
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
  const { selected, onSelect: setSelected } = props;
  const [state, setState] = useStored<Stored>(`${id}Filter`, { text: '', facets: {}, grouped: false });

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
              ? matchesTag(e.tags, value)
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
  const values = (f: Facet) => [...new Set(events.map(f.of).filter((v): v is string => v !== undefined))].toSorted();

  return (
    <Split
      detail={
        current && (
          <Detail label="Detail" head={props.head(current, groupOf(current))} onClose={() => setSelected(null)}>
            {props.body(current, groupOf(current))}
          </Detail>
        )
      }
    >
      <div className={toolbarClass}>
        <Input
          ref={filterRef}
          className={filterClass}
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
        <span className="flex-1" />
        {groupBy && (
          <Chip on={state.grouped} onClick={() => setState({ ...state, grouped: !state.grouped })}>
            Group repeats
          </Chip>
        )}
        <PauseButton paused={paused} newCount={newCount} onClick={toggle} />
      </div>
      <VirtualList
        label={props.label}
        empty={events.length ? 'Nothing matches the filter.' : props.empty}
        items={rows}
        rowHeight={ROW}
        selectedIndex={current ? rows.indexOf(current) : -1}
        render={(e, rowProps) => {
          const group = groupOf(e);
          return (
            <div
              key={e.key}
              {...rowProps}
              role="row"
              aria-selected={selected === keyOf(e)}
              className={cn('grid items-center gap-2 px-3', rowClass(selected === keyOf(e)))}
              style={{ height: ROW, gridTemplateColumns: props.columns }}
              onClick={() => setSelected(keyOf(e))}
            >
              <Row e={e} count={group?.count} first={group?.first} cells={props.cells} />
            </div>
          );
        }}
      />
    </Split>
  );
}

// Group counts as numbers, since regrouping makes new Group objects for unchanged groups.
const Row = memo(function Row(props: { e: DevEvent; count?: number; first?: number; cells: Cells }) {
  const { e, count, first, cells } = props;
  return cells(e, count === undefined || first === undefined ? undefined : { count, first });
});
