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
    <section className={`section ${closed ? 'closed' : ''}`}>
      <header onClick={toggle}>
        <span className="caret" aria-hidden="true">
          {closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
        <h3>{title}</h3>
        {summary && <span className="muted summary">{summary}</span>}
        <span className="grow" />
        {actions}
      </header>
      {!closed && <div className="section-body">{children}</div>}
    </section>
  );
}
