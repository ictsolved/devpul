import { cn } from 'cn';
import { Pause, Play } from 'lucide-react';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

export const toolbarClass = 'flex flex-wrap items-center gap-2 border-b px-3 py-2';
export const filterClass = 'w-[340px] max-w-full max-[860px]:w-full';
export const emptyClass = 'px-3 py-6 text-muted-foreground';
export const rowClass = (selected: boolean) =>
  cn('cursor-pointer border-b font-mono text-xs whitespace-nowrap', selected ? 'bg-selection' : 'hover:bg-secondary');

/** j/k and arrows move the selection, Esc closes it or leaves the filter. */
export function useListKeys(
  keys: readonly string[],
  selected: string | null,
  select: (key: string | null) => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select');
      if (target?.closest('[role=dialog], [role=menu]')) return;
      if (e.key === 'Escape') {
        if (typing) target?.blur();
        else select(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const delta = e.key === 'ArrowDown' || e.key === 'j' ? 1 : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0;
      if (!delta || !keys.length) return;
      e.preventDefault();
      const i = selected === null ? -1 : keys.indexOf(selected);
      const next = i < 0 ? (delta > 0 ? 0 : keys.length - 1) : i + delta;
      const key = keys[next];
      if (key !== undefined) select(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, selected, select]);
}

/** Freezes which items are listed; listed ones still update. */
export function usePause<T extends { key: string }>(items: readonly T[]) {
  const [frozen, setFrozen] = useState<Set<string> | null>(null);
  const visible = useMemo(() => (frozen ? items.filter((i) => frozen.has(i.key)) : items), [items, frozen]);
  return {
    visible,
    paused: frozen !== null,
    newCount: items.length - visible.length,
    toggle: () => setFrozen(frozen ? null : new Set(items.map((i) => i.key))),
  };
}

export function PauseButton(props: { paused: boolean; newCount: number; onClick: () => void }) {
  const { paused, newCount, onClick } = props;
  return (
    <Button type="button" variant={paused ? 'warning' : 'outline'} size="sm" onClick={onClick}>
      {paused ? <Play /> : <Pause />}
      {paused ? `Resume${newCount ? ` (${newCount} new)` : ''}` : 'Pause'}
    </Button>
  );
}

/** A toggle in a row of filter values. */
export function Chip({ on, className, ...props }: ComponentProps<'button'> & { on?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        'cursor-pointer rounded-full border px-2.5 py-px text-xs whitespace-nowrap hover:bg-accent',
        on && 'border-primary bg-primary-soft text-foreground hover:bg-primary-soft',
        className,
      )}
      {...props}
    />
  );
}

/** Toggle chips for values seen in the data. Hidden when there is nothing to pick. */
export function ValueChips(props: {
  label: string;
  values: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  render?: (value: string) => string;
  max?: number;
  prefix?: string;
}) {
  const { label, values, selected, onChange, render, max = 8, prefix } = props;
  const [all, setAll] = useState(false);
  if (values.length < 2) return null;
  const shown = all ? values : values.filter((v, i) => i < max || selected.includes(v));
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {prefix && <span className="self-center text-[11px] text-muted-foreground">{prefix}</span>}
      {shown.map((v) => (
        <Chip
          key={v}
          on={selected.includes(v)}
          onClick={() => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])}
        >
          {render ? render(v) : v}
        </Chip>
      ))}
      {values.length > max && (
        <Chip className="border-dashed text-muted-foreground" onClick={() => setAll(!all)}>
          {all ? 'less' : `+${values.length - max}`}
        </Chip>
      )}
    </div>
  );
}
