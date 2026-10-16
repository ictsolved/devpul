import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { load, save } from '../lib/storage';

let collapsed = load<Record<string, boolean>>('collapsed', {});

interface Props {
  id: string;
  title: string;
  summary?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Collapse state is persisted per section id across requests. */
export function Section({ id, title, summary, actions, children }: Props) {
  const [closed, setClosed] = useState(collapsed[id] ?? false);
  const toggle = () => {
    const next = !closed;
    collapsed = { ...collapsed, [id]: next };
    save('collapsed', collapsed);
    setClosed(next);
  };
  return (
    <section className="group/section">
      <header
        className="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 select-none hover:bg-secondary"
        onClick={toggle}
      >
        <span className="inline-flex text-muted-foreground" aria-hidden="true">
          {closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
        <h3 className="text-xs font-semibold">{title}</h3>
        {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
        <span className="flex-1" />
        {actions && (
          // Shown on hover so a column of identical buttons does not compete with the content.
          <span className="flex gap-1 group-hover/section:opacity-100 focus-within:opacity-100 [@media(hover:hover)]:opacity-0">
            {actions}
          </span>
        )}
      </header>
      {!closed && <div className="pr-3 pb-2 pl-[30px]">{children}</div>}
    </section>
  );
}
