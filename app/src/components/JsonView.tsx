import { memo, useState } from 'react';
import { isObject, TRUNCATED } from '../lib/events';
import { formatBytes, highlight, pretty } from '../lib/json';

const LIMIT = 100_000;

function JsonViewInner({ value }: { value: unknown }) {
  const [all, setAll] = useState(false);
  if (value === undefined || value === null || value === '') {
    return <div className="muted empty">empty</div>;
  }
  if (isObject(value) && isObject(value[TRUNCATED])) {
    const marker = value[TRUNCATED];
    const size = typeof marker.size === 'number' ? formatBytes(marker.size) : 'unknown size';
    return (
      <div>
        <div className="note">Cut by the app at its maxValueLength. Full size {size}.</div>
        <pre className="code">{String(marker.preview ?? '')}</pre>
      </div>
    );
  }
  const text = pretty(value);
  const long = text.length > LIMIT && !all;
  const shown = long ? text.slice(0, LIMIT) : text;
  return (
    <div>
      {typeof value === 'string' ? (
        <pre className="code">{shown}</pre>
      ) : (
        <pre className="code" dangerouslySetInnerHTML={{ __html: highlight(shown) }} />
      )}
      {long && (
        <button type="button" className="btn small" onClick={() => setAll(true)}>
          Show all ({formatBytes(text.length)})
        </button>
      )}
    </div>
  );
}

export const JsonView = memo(JsonViewInner);
