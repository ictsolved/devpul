import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
      if (target?.closest('dialog')) return;
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
  const visible = useMemo(
    () => (frozen ? items.filter((i) => frozen.has(i.key)) : items),
    [items, frozen],
  );
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
    <button type="button" className={`btn ${paused ? 'warn' : ''}`} onClick={onClick}>
      {paused ? <Play size={13} /> : <Pause size={13} />}
      {paused ? `Resume${newCount ? ` (${newCount} new)` : ''}` : 'Pause'}
    </button>
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
    <div className="chips" role="group" aria-label={label}>
      {prefix && <span className="chips-prefix">{prefix}</span>}
      {shown.map((v) => (
        <button
          type="button"
          key={v}
          className={`chip ${selected.includes(v) ? 'on' : ''}`}
          onClick={() =>
            onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
          }
        >
          {render ? render(v) : v}
        </button>
      ))}
      {values.length > max && (
        <button type="button" className="chip more" onClick={() => setAll(!all)}>
          {all ? 'less' : `+${values.length - max}`}
        </button>
      )}
    </div>
  );
}
