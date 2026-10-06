import { memo, useState } from 'react';
import { isObject, TRUNCATED } from '../lib/events';
import { formatBytes, highlight, pretty } from '../lib/json';

const LIMIT = 100_000;

export const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (isObject(value) && Object.keys(value).length === 0);

function JsonViewInner({ value }: { value: unknown }) {
  const [all, setAll] = useState(false);
  if (isEmptyValue(value)) return <div className="muted">empty</div>;
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
