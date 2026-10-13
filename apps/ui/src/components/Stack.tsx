import { Fragment, type ReactNode, useMemo } from 'react';
import type { SourceLocation } from '../core/location';
import { stackLines } from '../core/stack';
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
  const lines = useMemo(() => stackLines(stack), [stack]);
  return (
    <pre className={codeClass}>
      {lines.map(({ text, frame }, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {frame ? (
            <>
              {text.slice(0, frame.start)}
              <SourceLink location={frame.location} onOpen={onOpen}>
                {text.slice(frame.start, frame.end)}
              </SourceLink>
              {text.slice(frame.end)}
            </>
          ) : (
            text
          )}
        </Fragment>
      ))}
    </pre>
  );
}
