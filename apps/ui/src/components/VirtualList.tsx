import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { emptyClass } from './list';

/** Spread on the row element. */
export interface RowProps {
  id: string;
  'aria-rowindex': number;
}

interface Props<T> {
  items: readonly T[];
  rowHeight: number;
  render: (item: T, row: RowProps) => ReactNode;
  /** Scrolled into view and announced as the active row. */
  selectedIndex?: number;
  label: string;
  /** A header row above the scrolling rows, with `aria-rowindex` 1. */
  header?: ReactNode;
  /** Shown as the only row when there are no items. */
  empty: ReactNode;
}

const OVERSCAN = 10;

/** A grid that renders only the rows in view. Focus stays on the grid; the selected row is its active descendant. */
export function VirtualList<T>(props: Props<T>) {
  const { items, rowHeight, render, selectedIndex = -1, label, header, empty } = props;
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const first = header ? 2 : 1;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    setHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || selectedIndex < 0) return;
    const top = selectedIndex * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + rowHeight - el.clientHeight;
    }
  }, [selectedIndex, rowHeight]);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + OVERSCAN);
  const visible: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    visible.push(render(items[i] as T, { id: `${id}-${i}`, 'aria-rowindex': i + first }));
  }

  return (
    <div
      role="grid"
      aria-label={label}
      aria-rowcount={Math.max(items.length, 1) + first - 1}
      aria-activedescendant={selectedIndex >= 0 ? `${id}-${selectedIndex}` : undefined}
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {header}
      {items.length === 0 && (
        <div role="row" aria-rowindex={first}>
          <div role="gridcell" className={emptyClass}>
            {empty}
          </div>
        </div>
      )}
      <div ref={ref} className="min-h-0 flex-1 overflow-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ height: items.length * rowHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: start * rowHeight, left: 0, right: 0 }}>{visible}</div>
        </div>
      </div>
    </div>
  );
}
