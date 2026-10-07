import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';

interface Props<T> {
  items: readonly T[];
  rowHeight: number;
  render: (item: T, index: number) => ReactNode;
  scrollToIndex?: number;
  className?: string;
  listRef?: RefObject<HTMLDivElement | null>;
}

const OVERSCAN = 10;

export function VirtualList<T>({
  items,
  rowHeight,
  render,
  scrollToIndex,
  className,
  listRef,
}: Props<T>) {
  const own = useRef<HTMLDivElement>(null);
  const ref = listRef ?? own;
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    setHeight(el.clientHeight);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el || scrollToIndex === undefined || scrollToIndex < 0) return;
    const top = scrollToIndex * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + rowHeight - el.clientHeight;
    }
  }, [scrollToIndex, rowHeight, ref]);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + OVERSCAN);
  const visible: ReactNode[] = [];
  for (let i = start; i < end; i++) visible.push(render(items[i] as T, i));

  return (
    <div
      ref={ref}
      className={`vlist ${className ?? ''}`}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: start * rowHeight, left: 0, right: 0 }}>
          {visible}
        </div>
      </div>
    </div>
  );
}
