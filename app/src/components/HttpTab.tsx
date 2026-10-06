import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo } from 'react';
import {
  defaultSort,
  emptyFilter,
  filterRows,
  type HttpFilter,
  type Sort,
  type SortKey,
  sortRows,
  type StatusFilter,
} from '../lib/filter';
import { formatBytes, formatTime } from '../lib/json';
import { type Settings, useStored } from '../lib/storage';
import type { HttpRow, Store } from '../lib/store';
import { DetailPanel, StatusBadge } from './DetailPanel';
import { PauseButton, useListKeys, usePause, ValueChips } from './list';
import { TagChips } from './TagChips';
import { VirtualList } from './VirtualList';

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

  const keys = useMemo(
    () => items.flatMap((i) => (i.type === 'row' ? [i.row.key] : [])),
    [items],
  );
  useListKeys(keys, selected, onSelect);

  const methods = useMemo(() => [...new Set(rows.map((r) => r.method))].toSorted(), [rows]);
  const hosts = useMemo(
    () => [...new Set(rows.map((r) => r.host).filter(Boolean))].toSorted(),
    [rows],
  );
  const runs = useMemo(
    () => [...store.runs.values()].toSorted((a, b) => b.last - a.last).map((r) => r.run),
    [store.runs],
  );
  const selectedRow = selected ? rows.find((r) => r.key === selected) : undefined;
  const selectedIndex = items.findIndex((i) => i.type === 'row' && i.row.key === selected);

  const sortBy = (key: SortKey) =>
    setSort(
      sort.key === key ? { key, desc: !sort.desc } : { key, desc: !ASCENDING_FIRST.includes(key) },
    );

  const slowClass = (row: HttpRow) => {
    const ms = row.durationMs;
    if (ms === undefined) return '';
    if (ms >= settings.verySlowMs) return 'very-slow';
    if (ms >= settings.slowMs) return 'slow';
    return '';
  };

  return (
    <div className={`pane-split ${selectedRow ? 'has-detail' : ''}`}>
      <div className="pane-main">
        <div className="toolbar">
          <input
            ref={filterRef}
            className="filter"
            type="search"
            placeholder="Filter, e.g. login -health status:4xx ms:>500"
            data-tip={SYNTAX}
            value={filter.text}
            onChange={(e) => setFilter({ ...filter, text: e.target.value })}
            aria-label="Filter requests"
          />
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
          <TagChips
            tags={store.tags}
            selected={filter.tags}
            onChange={(tags) => setFilter({ ...filter, tags })}
          />
          <ValueChips
            label="App run"
            values={runs}
            selected={filter.runs}
            onChange={(v) => setFilter({ ...filter, runs: v })}
            render={runLabel}
            max={4}
          />
          <span className="grow" />
          <PauseButton paused={paused} newCount={newCount} onClick={toggle} />
        </div>
        <div className="http-head" role="row">
          {COLUMNS.map((c) => (
            <button
              type="button"
              key={c.key}
              className={`sort ${c.num ? 'num' : ''} ${sort.key === c.key ? 'on' : ''}`}
              onClick={() => sortBy(c.key)}
              aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
            >
              {c.label}
              {sort.key === c.key && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
            </button>
          ))}
        </div>
        {items.length === 0 ? (
          <div className="muted empty">
            {rows.length ? 'No requests match the filter.' : 'No HTTP requests yet.'}
          </div>
        ) : (
          <VirtualList
            items={items}
            rowHeight={ROW}
            scrollToIndex={selectedIndex}
            render={(item) =>
              item.type === 'divider' ? (
                <div key={item.key} className="divider" style={{ height: ROW }}>
                  {runLabel(item.run)}
                </div>
              ) : (
                <div
                  key={item.row.key}
                  role="row"
                  aria-selected={item.row.key === selected}
                  className={`http-row ${item.row.key === selected ? 'selected' : ''} ${slowClass(item.row)}`}
                  style={{ height: ROW }}
                  onClick={() => onSelect(item.row.key)}
                >
                  <span className="muted">{item.row.id}</span>
                  <span className="muted">{formatTime(item.row.ts)}</span>
                  <span className={`method m-${item.row.method}`}>{item.row.method}</span>
                  <span>
                    <StatusBadge row={item.row} />
                  </span>
                  <span className="num ms">{item.row.durationMs ?? ''}</span>
                  <span className="num muted">
                    {item.row.size === undefined ? '' : formatBytes(item.row.size)}
                  </span>
                  <span className="url" data-tip={item.row.url}>
                    {item.row.url}
                  </span>
                </div>
              )
            }
          />
        )}
      </div>
      {selectedRow && (
        <DetailPanel key={selectedRow.key} row={selectedRow} onClose={() => onSelect(null)} />
      )}
    </div>
  );
}
