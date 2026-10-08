import { cn } from 'cn';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Split } from '../../components/Panes';
import { VirtualList } from '../../components/VirtualList';
import {
  emptyClass,
  filterClass,
  PauseButton,
  rowClass,
  toolbarClass,
  useListKeys,
  usePause,
  ValueChips,
} from '../../components/list';
import { Tip } from '../../components/Tip';
import {
  defaultSort,
  emptyFilter,
  filterRows,
  type HttpFilter,
  type Sort,
  type SortKey,
  sortRows,
  type StatusFilter,
} from '../../core/filter';
import { formatBytes, formatTime } from '../../core/json';
import type { HttpRow, Store } from '../../core/store';
import { type Settings, useStored } from '../../lib/storage';
import { DetailPanel, Method, StatusBadge } from './DetailPanel';
import { TagChips } from './TagChips';

const STATUSES: StatusFilter[] = ['2xx', '3xx', '4xx', '5xx', 'err', 'pending'];
const ROW = 26;
const SYNTAX = `Words match URL, id and bodies; all must match. -word excludes.
status:4xx,5xx  status:>=400  status:err  status:pending
method:post  host:api.example.com  ms:>500  size:>10k
tag:env=qa  tag:env
Comma means OR. A leading - negates: -host:cdn`;

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'id', label: '#' },
  { key: 'time', label: 'time' },
  { key: 'method', label: 'method' },
  { key: 'status', label: 'status' },
  { key: 'ms', label: 'ms', num: true },
  { key: 'size', label: 'size', num: true },
  { key: 'url', label: 'url' },
];
const ASCENDING_FIRST: SortKey[] = ['method', 'url'];
// Narrow windows drop the time and size columns.
const GRID =
  'grid grid-cols-[52px_96px_64px_64px_60px_72px_minmax(0,1fr)] items-center gap-2 px-3 max-[860px]:grid-cols-[40px_64px_52px_60px_minmax(0,1fr)] max-[860px]:[&>:nth-child(2)]:hidden max-[860px]:[&>:nth-child(6)]:hidden';

type Item = { type: 'row'; row: HttpRow } | { type: 'divider'; run: string; key: string };

interface Props {
  store: Store;
  settings: Settings;
  runLabel: (run: string) => string;
  filterRef: React.RefObject<HTMLInputElement | null>;
  selected: string | null;
  onSelect: (key: string | null) => void;
}

export function HttpTab({ store, settings, runLabel, filterRef, selected, onSelect }: Props) {
  const [filter, setFilter] = useStored<HttpFilter>('httpFilter', emptyFilter);
  const [sort, setSort] = useStored<Sort>('httpSort', defaultSort);

  const rows = store.httpRows;
  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const { visible, paused, newCount, toggle } = usePause(filtered);

  const isDefault = sort.key === defaultSort.key && sort.desc === defaultSort.desc;
  const multiRun = store.runs.size > 1;
  const items = useMemo<Item[]>(() => {
    if (!isDefault) return sortRows(visible, sort).map((row) => ({ type: 'row', row }));
    const out: Item[] = [];
    let last: string | null = null;
    for (const row of visible) {
      if (multiRun && row.run !== last) {
        out.push({ type: 'divider', run: row.run, key: `d|${row.run}|${row.key}` });
      }
      last = row.run;
      out.push({ type: 'row', row });
    }
    return out;
  }, [visible, sort, isDefault, multiRun]);

  const keys = useMemo(() => items.flatMap((i) => (i.type === 'row' ? [i.row.key] : [])), [items]);
  useListKeys(keys, selected, onSelect);

  const methods = useMemo(() => [...new Set(rows.map((r) => r.method))].toSorted(), [rows]);
  const hosts = useMemo(() => [...new Set(rows.map((r) => r.host).filter(Boolean))].toSorted(), [rows]);
  const runs = useMemo(
    () => [...store.runs.values()].toSorted((a, b) => b.last - a.last).map((r) => r.run),
    [store.runs],
  );
  const selectedRow = selected ? rows.find((r) => r.key === selected) : undefined;
  const selectedIndex = items.findIndex((i) => i.type === 'row' && i.row.key === selected);

  const sortBy = (key: SortKey) =>
    setSort(sort.key === key ? { key, desc: !sort.desc } : { key, desc: !ASCENDING_FIRST.includes(key) });

  const slowClass = (row: HttpRow) => {
    const ms = row.durationMs;
    if (ms === undefined) return '';
    if (ms >= settings.verySlowMs) return 'font-semibold text-destructive';
    if (ms >= settings.slowMs) return 'font-semibold text-warning';
    return '';
  };

  return (
    <Split
      detail={selectedRow && <DetailPanel key={selectedRow.key} row={selectedRow} onClose={() => onSelect(null)} />}
    >
      <div className={toolbarClass}>
        <Tip content={SYNTAX} code>
          <Input
            ref={filterRef}
            className={filterClass}
            type="search"
            placeholder="Filter, e.g. login -health status:4xx ms:>500"
            value={filter.text}
            onChange={(e) => setFilter({ ...filter, text: e.target.value })}
            aria-label="Filter requests"
          />
        </Tip>
        <ValueChips
          label="Status"
          values={STATUSES}
          selected={filter.statuses}
          onChange={(v) => setFilter({ ...filter, statuses: v as StatusFilter[] })}
        />
        <ValueChips
          label="Method"
          values={methods}
          selected={filter.methods}
          onChange={(v) => setFilter({ ...filter, methods: v })}
        />
        <ValueChips
          label="Host"
          values={hosts}
          selected={filter.hosts}
          onChange={(v) => setFilter({ ...filter, hosts: v })}
          max={6}
        />
        <TagChips tags={store.tags} selected={filter.tags} onChange={(tags) => setFilter({ ...filter, tags })} />
        <ValueChips
          label="App run"
          values={runs}
          selected={filter.runs}
          onChange={(v) => setFilter({ ...filter, runs: v })}
          render={runLabel}
          max={4}
        />
        <span className="flex-1" />
        <PauseButton paused={paused} newCount={newCount} onClick={toggle} />
      </div>
      <div className={cn(GRID, 'h-[26px] border-b')} role="row">
        {COLUMNS.map((c) => (
          <button
            type="button"
            key={c.key}
            className={cn(
              'inline-flex cursor-pointer items-center gap-0.5 text-[11px] tracking-[0.04em] text-muted-foreground uppercase hover:text-foreground',
              c.num && 'justify-end',
              sort.key === c.key && 'text-foreground',
            )}
            onClick={() => sortBy(c.key)}
            aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
          >
            {c.label}
            {sort.key === c.key && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className={emptyClass}>{rows.length ? 'No requests match the filter.' : 'No HTTP requests yet.'}</div>
      ) : (
        <VirtualList
          items={items}
          rowHeight={ROW}
          scrollToIndex={selectedIndex}
          render={(item) =>
            item.type === 'divider' ? (
              <div
                key={item.key}
                className="flex items-center border-b bg-secondary px-3 text-[11px] font-semibold text-primary"
                style={{ height: ROW }}
              >
                {runLabel(item.run)}
              </div>
            ) : (
              <div
                key={item.row.key}
                role="row"
                aria-selected={item.row.key === selected}
                className={cn(GRID, rowClass(item.row.key === selected))}
                style={{ height: ROW }}
                onClick={() => onSelect(item.row.key)}
              >
                <span className="text-muted-foreground">{item.row.id}</span>
                <span className="text-muted-foreground">{formatTime(item.row.ts)}</span>
                <Method method={item.row.method} />
                <span>
                  <StatusBadge row={item.row} />
                </span>
                <span className={cn('text-right', slowClass(item.row))}>{item.row.durationMs ?? ''}</span>
                <span className="text-right text-muted-foreground">
                  {item.row.size === undefined ? '' : formatBytes(item.row.size)}
                </span>
                <Tip content={item.row.url} code whenCut>
                  <span className="truncate">{item.row.url}</span>
                </Tip>
              </div>
            )
          }
        />
      )}
    </Split>
  );
}
