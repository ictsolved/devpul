import { cn } from 'cn';
import { ArrowDown, ArrowUp, FlaskConical } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Split } from '../../components/Panes';
import { VirtualList } from '../../components/VirtualList';
import {
  filterClass,
  filtersClass,
  PauseButton,
  rowClass,
  toolbarClass,
  toolbarEndClass,
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
  matchesStatus,
  type Sort,
  type SortKey,
  sortRows,
  type StatusFilter,
} from '../../core/filter';
import { formatBytes, formatTime } from '../../core/json';
import type { JsonObject } from '../../core/events';
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
// A narrow list, such as beside a detail, drops the time and size columns.
const GRID =
  'grid grid-cols-[52px_96px_64px_64px_60px_72px_minmax(0,1fr)] items-center gap-2 px-3 @max-[720px]:grid-cols-[40px_64px_52px_60px_minmax(0,1fr)] @max-[720px]:[&>:nth-child(2)]:hidden @max-[720px]:[&>:nth-child(6)]:hidden';

type Item = { type: 'row'; row: HttpRow } | { type: 'divider'; run: string; key: string };

interface Props {
  store: Store;
  settings: Settings;
  runLabel: (run: string) => string;
  filterRef: React.RefObject<HTMLInputElement | null>;
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Set when the selected request was opened from an error. */
  onBack?: () => void;
  /** Mock rules turned on across connected apps; undefined when none takes rules. */
  mockCount?: number;
  /** Opens the Mocks dialog, with a rule made from [row] if given. */
  onMocks: (row?: HttpRow) => void;
  /** Runs of connected apps that take mock rules. */
  mockRuns: ReadonlySet<string>;
  onResume: (run: string, args: JsonObject) => Promise<void>;
}

export function HttpTab(props: Props) {
  const { store, settings, runLabel, filterRef, selected, onSelect, onBack } = props;
  const { mockCount, onMocks, mockRuns, onResume } = props;
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

  const statuses = useMemo(
    () => STATUSES.filter((s) => filter.statuses.includes(s) || rows.some((r) => matchesStatus(r, s))),
    [rows, filter.statuses],
  );
  const methods = useMemo(() => [...new Set(rows.map((r) => r.method))].toSorted(), [rows]);
  const hosts = useMemo(() => [...new Set(rows.map((r) => r.host).filter(Boolean))].toSorted(), [rows]);
  const runs = useMemo(
    () => [...store.runs.values()].toSorted((a, b) => b.last - a.last).map((r) => r.run),
    [store.runs],
  );
  const selectedRow = selected ? rows.find((r) => r.key === selected) : undefined;
  const selectedIndex = selected ? items.findIndex((i) => i.type === 'row' && i.row.key === selected) : -1;

  const sortBy = (key: SortKey) =>
    setSort(sort.key === key ? { key, desc: !sort.desc } : { key, desc: !ASCENDING_FIRST.includes(key) });

  const slowClass = (row: HttpRow) => {
    const ms = row.durationMs;
    if (ms === undefined) return undefined;
    if (ms >= settings.verySlowMs) return 'font-semibold text-destructive';
    if (ms >= settings.slowMs) return 'font-semibold text-warning';
    return undefined;
  };

  return (
    <Split
      detail={
        selectedRow && (
          <DetailPanel
            key={selectedRow.key}
            row={selectedRow}
            onClose={() => onSelect(null)}
            onBack={onBack}
            onMock={
              mockRuns.has(selectedRow.run) && selectedRow.source === undefined ? () => onMocks(selectedRow) : undefined
            }
            onResume={mockRuns.has(selectedRow.run) ? (args) => onResume(selectedRow.run, args) : undefined}
          />
        )
      }
    >
      <div className={toolbarClass}>
        <div className={filtersClass}>
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
            values={statuses}
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
        </div>
        <div className={toolbarEndClass}>
          {mockCount !== undefined && (
            <Tip content="Answer, fail, delay or pause calls in the app">
              <Button type="button" variant="outline" size="sm" onClick={() => onMocks()}>
                <FlaskConical />
                Mocks
                {mockCount > 0 && <Badge variant="secondary">{mockCount}</Badge>}
              </Button>
            </Tip>
          )}
          <PauseButton paused={paused} newCount={newCount} onClick={toggle} />
        </div>
      </div>
      <VirtualList
        label="Requests"
        empty={rows.length ? 'No requests match the filter.' : 'No HTTP requests yet.'}
        items={items}
        rowHeight={ROW}
        selectedIndex={selectedIndex}
        header={
          <div className={cn(GRID, 'h-[26px] flex-none border-b')} role="row" aria-rowindex={1}>
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                role="columnheader"
                className={cn('flex', c.num && 'justify-end')}
                aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
              >
                <button
                  type="button"
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-0.5 text-[11px] tracking-[0.04em] text-muted-foreground uppercase hover:text-foreground',
                    sort.key === c.key && 'text-foreground',
                  )}
                  onClick={() => sortBy(c.key)}
                >
                  {c.label}
                  {sort.key === c.key && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                </button>
              </div>
            ))}
          </div>
        }
        render={(item, rowProps) =>
          item.type === 'divider' ? (
            <div
              key={item.key}
              {...rowProps}
              role="row"
              className="flex items-center border-b bg-secondary px-3 text-[11px] font-semibold text-primary"
              style={{ height: ROW }}
            >
              <span role="gridcell" aria-colspan={COLUMNS.length}>
                {runLabel(item.run)}
              </span>
            </div>
          ) : (
            <div
              key={item.row.key}
              {...rowProps}
              role="row"
              aria-selected={item.row.key === selected}
              className={cn(GRID, rowClass(item.row.key === selected))}
              style={{ height: ROW }}
              onClick={() => onSelect(item.row.key)}
            >
              <Cells row={item.row} slow={slowClass(item.row)} />
            </div>
          )
        }
      />
    </Split>
  );
}

// The row element changes with the selection; its cells only when the request does.
const Cells = memo(function Cells({ row, slow }: { row: HttpRow; slow?: string }) {
  return (
    <>
      <span role="gridcell" className="flex items-center gap-0.5 truncate text-muted-foreground">
        {row.source ?? row.id}
        {row.mock && <FlaskConical size={11} className="flex-none text-warning" aria-label={`mock: ${row.mock}`} />}
      </span>
      <span role="gridcell" className="text-muted-foreground">
        {formatTime(row.ts)}
      </span>
      <span role="gridcell">
        <Method method={row.method} />
      </span>
      <span role="gridcell">
        <StatusBadge row={row} />
      </span>
      <span role="gridcell" className={cn('text-right', slow)}>
        {row.durationMs ?? ''}
      </span>
      <span role="gridcell" className="text-right text-muted-foreground">
        {row.size === undefined ? '' : formatBytes(row.size)}
      </span>
      <Tip content={row.url} code whenCut>
        <span role="gridcell" className="truncate">
          {row.url}
        </span>
      </Tip>
    </>
  );
});
