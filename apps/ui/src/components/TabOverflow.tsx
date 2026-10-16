import { ChevronDown } from 'lucide-react';
import { type RefObject, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tip } from './Tip';

export interface TabEntry {
  id: string;
  label: string;
  count: number;
}

/** Which ends of a sideways scrolling strip have content out of view. [key] changes with its children. */
export function useOverflow(ref: RefObject<HTMLElement | null>, key: string) {
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // Children too: a tab's count can grow it past the edge.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
    // [key] reruns it for new children.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [ref, key]);
  return edges;
}

export const fadeClass = (edges: { start: boolean; end: boolean }) =>
  edges.start && edges.end
    ? '[mask-image:linear-gradient(to_right,transparent,#000_32px,#000_calc(100%-32px),transparent)]'
    : edges.end
      ? '[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]'
      : edges.start
        ? '[mask-image:linear-gradient(to_left,#000_calc(100%-32px),transparent)]'
        : '';

/** Lists the tabs of [strip] that are out of view, in strip order. */
export function HiddenTabs(props: {
  strip: RefObject<HTMLElement | null>;
  tabs: readonly TabEntry[];
  onSelect: (id: string) => void;
}) {
  const { strip, tabs, onSelect } = props;
  const [hidden, setHidden] = useState<TabEntry[]>([]);
  const measure = () => {
    const el = strip.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const triggers = [...el.querySelectorAll('[role=tab]')];
    setHidden(
      tabs.filter((_, i) => {
        const r = triggers[i]?.getBoundingClientRect();
        return r !== undefined && (r.left < box.left - 1 || r.right > box.right + 1);
      }),
    );
  };
  return (
    <DropdownMenu onOpenChange={(open) => open && measure()}>
      <Tip content="More tabs">
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="More tabs">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end">
        {hidden.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => onSelect(t.id)}>
            {t.label}
            {t.count > 0 && <span className="ml-auto pl-4 text-xs text-muted-foreground">{t.count}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
