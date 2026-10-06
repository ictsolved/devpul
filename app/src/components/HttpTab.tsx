import { ArrowDownWideNarrow, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyFilter,
  filterRows,
  type HttpFilter,
  type StatusFilter,
} from '../lib/filter';
import { formatTime } from '../lib/json';
import { load, save, type Settings } from '../lib/storage';
import type { HttpRow, Store } from '../lib/store';
import { DetailPanel, StatusBadge } from './DetailPanel';
import { TagChips } from './TagChips';
import { VirtualList } from './VirtualList';

const STATUSES: StatusFilter[] = ['all', '2xx', '3xx', '4xx', '5xx', 'err', 'pending'];
const ROW = 26;

type Item = { type: 'row'; row: HttpRow } | { type: 'divider'; run: string; key: string };

interface Props {
  store: Store;
  settings: Settings;
  runLabel: (run: string) => string;
  filterRef: React.RefObject<HTMLInputElement | null>;
}

export function HttpTab({ store, settings, runLabel, filterRef }: Props) {
  const [filter, setFilterState] = useState<HttpFilter>(() => load('httpFilter', emptyFilter));
  const [byDuration, setByDuration] = useState(() => load('httpByDuration', false));
  const [paused, setPaused] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setFilter = (next: HttpFilter) => {
    setFilterState(next);
    save('httpFilter', next);
  };

  const rows = store.httpRows;
  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const visible = useMemo(
    () => (paused ? filtered.filter((r) => paused.has(r.key)) : filtered),
    [filtered, paused],
  );
  const newCount = filtered.length - visible.length;

  const multiRun = store.runs.size > 1;
  const items = useMemo<Item[]>(() => {
    if (byDuration) {
      return visible
        .toSorted((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1))
        .map((row) => ({ type: 'row', row }));
    }
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
  }, [visible, byDuration, multiRun]);

  const methods = useMemo(() => [...new Set(rows.map((r) => r.method))].toSorted(), [rows]);
  const selectedRow = selected ? rows.find((r) => r.key === selected) : undefined;
  const selectedIndex = items.findIndex((i) => i.type === 'row' && i.row.key === selected);

  const close = useCallback(() => setSelected(null), []);

  const move = useCallback(
    (delta: number) => {
      let i = selectedIndex;
      for (;;) {
        i = i < 0 ? (delta > 0 ? 0 : items.length - 1) : i + delta;
        const item = items[i];
        if (!item) return;
        if (item.type === 'row') {
          setSelected(item.row.key);
          return;
        }
      }
    },
    [items, selectedIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select');
      if (e.key === 'Escape') {
        if (typing) (e.target as HTMLElement).blur();
        else setSelected(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  const togglePause = () => setPaused(paused ? null : new Set(filtered.map((r) => r.key)));

  const toggleMethod = (m: string) =>
    setFilter({
      ...filter,
      methods: filter.methods.includes(m)
        ? filter.methods.filter((x) => x !== m)
        : [...filter.methods, m],
    });

  const runs = [...store.runs.values()].toSorted((a, b) => b.last - a.last);

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
            placeholder="Filter: words AND, -word excludes (url, id, bodies)"
            value={filter.text}
            onChange={(e) => setFilter({ ...filter, text: e.target.value })}
            aria-label="Filter requests"
          />
          <div className="chips" role="group" aria-label="Status">
            {STATUSES.map((s) => (
              <button
                type="button"
                key={s}
                className={`chip ${filter.status === s ? 'on' : ''}`}
                onClick={() => setFilter({ ...filter, status: s })}
              >
                {s}
              </button>
            ))}
          </div>
          {methods.length > 1 && (
            <div className="chips" role="group" aria-label="Method">
              {methods.map((m) => (
                <button
                  type="button"
                  key={m}
                  className={`chip ${filter.methods.includes(m) ? 'on' : ''}`}
                  onClick={() => toggleMethod(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          <TagChips
            tags={store.tags}
            selected={filter.tags}
            onChange={(tags) => setFilter({ ...filter, tags })}
          />
          {runs.length > 1 && (
            <div className="chips" role="group" aria-label="App run">
              {runs.slice(0, 8).map((r) => (
                <button
                  type="button"
                  key={r.run}
                  className={`chip ${filter.runs.includes(r.run) ? 'on' : ''}`}
                  onClick={() =>
                    setFilter({
                      ...filter,
                      runs: filter.runs.includes(r.run)
                        ? filter.runs.filter((x) => x !== r.run)
                        : [...filter.runs, r.run],
                    })
                  }
                >
                  {runLabel(r.run)}
                </button>
              ))}
            </div>
          )}
          <span className="grow" />
          <button
            type="button"
            className={`chip ${byDuration ? 'on' : ''}`}
            onClick={() => {
              setByDuration(!byDuration);
              save('httpByDuration', !byDuration);
            }}
          >
            <ArrowDownWideNarrow size={13} /> Slowest first
          </button>
          <button type="button" className={`btn ${paused ? 'warn' : ''}`} onClick={togglePause}>
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? `Resume${newCount ? ` (${newCount} new)` : ''}` : 'Pause'}
          </button>
        </div>
        <div className="http-head" role="row">
          <span>#</span>
          <span>time</span>
          <span>method</span>
          <span>status</span>
          <span className="num">ms</span>
          <span>url</span>
        </div>
        {items.length === 0 ? (
          <div className="muted empty">
            {rows.length ? 'No requests match the filter.' : 'No HTTP requests yet.'}
          </div>
        ) : (
          <VirtualList
            listRef={listRef}
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
                  onClick={() => setSelected(item.row.key)}
                >
                  <span className="muted">{item.row.id}</span>
                  <span className="muted">{formatTime(item.row.ts)}</span>
                  <span className={`method m-${item.row.method}`}>{item.row.method}</span>
                  <span>
                    <StatusBadge row={item.row} />
                  </span>
                  <span className="num">{item.row.durationMs ?? ''}</span>
                  <span className="url" data-tip={item.row.url}>
                    {item.row.url}
                  </span>
                </div>
              )
            }
          />
        )}
      </div>
      {selectedRow && <DetailPanel key={selectedRow.key} row={selectedRow} onClose={close} />}
    </div>
  );
}
