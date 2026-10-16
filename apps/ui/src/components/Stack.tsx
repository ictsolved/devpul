import { Fragment, type ReactNode, useMemo, useState } from 'react';
import type { SourceLocation } from '../core/location';
import { foldStack, stackLines } from '../core/stack';
import { codeClass } from './JsonView';

export type OpenSource = (location: SourceLocation) => void;

const linkClass = 'cursor-pointer text-left text-primary hover:underline focus-visible:underline';

export function SourceLink({
  location,
  onOpen,
  children,
}: {
  location: SourceLocation;
  onOpen: OpenSource;
  children: ReactNode;
}) {
  return (
    <button type="button" className={linkClass} title="Open in the editor" onClick={() => onOpen(location)}>
      {children}
    </button>
  );
}

export function StackText({ stack, onOpen }: { stack: string; onOpen: OpenSource }) {
  const parts = useMemo(() => foldStack(stackLines(stack)), [stack]);
  const [opened, setOpened] = useState<{ stack: string; parts: ReadonlySet<number> }>({ stack, parts: new Set() });
  const open = opened.stack === stack ? opened.parts : new Set<number>();
  const items: ReactNode[] = [];
  for (const [p, part] of parts.entries()) {
    if (part.folded && !open.has(p)) {
      items.push(
        <button
          type="button"
          className="cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={() => setOpened({ stack, parts: new Set([...open, p]) })}
        >
          ... {part.frames} framework frames
        </button>,
      );
      continue;
    }
    for (const { text, frame } of part.lines) {
      items.push(
        frame ? (
          <>
            {text.slice(0, frame.start)}
            <SourceLink location={frame.location} onOpen={onOpen}>
              {text.slice(frame.start, frame.end)}
            </SourceLink>
            {text.slice(frame.end)}
          </>
        ) : (
          text
        ),
      );
    }
  }
  return (
    <pre className={codeClass}>
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {item}
        </Fragment>
      ))}
    </pre>
  );
}
