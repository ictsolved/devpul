import { Chip } from '../../components/list';

interface Props {
  tags: Map<string, Set<string>>;
  selected: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}

/** Built from the tags seen on events; OR within a key, AND across keys. */
export function TagChips({ tags, selected, onChange }: Props) {
  if (!tags.size) return null;
  const toggle = (key: string, value: string) => {
    const current = selected[key] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...selected, [key]: next });
  };
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Tags">
      {[...tags.entries()].flatMap(([key, values]) =>
        [...values].toSorted().map((value) => (
          <Chip
            key={`${key}=${value}`}
            className="font-mono"
            on={selected[key]?.includes(value)}
            onClick={() => toggle(key, value)}
          >
            {key}={value}
          </Chip>
        )),
      )}
    </div>
  );
}
