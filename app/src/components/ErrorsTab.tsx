import { memo } from 'react';
import { type DevEvent, str } from '../lib/events';
import { formatTime } from '../lib/json';

interface Props {
  errors: DevEvent[];
  runLabel: (run: string) => string;
}

// Rebuilds only when the list identity changes, so open traces stay open.
function ErrorsTabInner({ errors, runLabel }: Props) {
  if (!errors.length) return <div className="muted empty">No errors yet.</div>;
  return (
    <div className="scroll errors">
      {errors.map((e) => {
        const d = e.data;
        const stack = str(d.stack);
        const context = str(d.context);
        return (
          <article key={e.key} className="error-card">
            <header>
              <span className="badge err">{str(d.source) ?? 'error'}</span>
              <strong>{str(d.type) ?? 'Error'}</strong>
              {str(d.library) && <span className="muted">{str(d.library)}</span>}
              <span className="grow" />
              <span className="muted">{runLabel(e.run)}</span>
              <span className="muted">{formatTime(e.ts)}</span>
            </header>
            <pre className="error-message">{str(d.message) ?? ''}</pre>
            {context && <div className="muted">{context}</div>}
            {stack && (
              <details>
                <summary>Stack trace</summary>
                <pre className="code">{stack}</pre>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}

export const ErrorsTab = memo(ErrorsTabInner);
