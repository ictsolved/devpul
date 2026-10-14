import { cn } from 'cn';
import { Braces, ChevronDown, ChevronRight, Ellipsis, ListTree, X } from 'lucide-react';
import { memo, type ReactNode, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { childPath, DECODE_LABELS, type DecodeAs, decodeAs, hint, type HintContext } from '../core/decode';
import { isObject, type Json, TRUNCATED } from '../core/events';
import { headerValue } from '../core/fetch';
import { type DataImage, dataImage } from '../core/image';
import { chunkLines, formatBytes, formatDateTime, highlight, pretty } from '../core/json';
import { load, save } from '../lib/storage';
import { contextMenu, menuButtonClass, openValueMenu } from './ValueMenu';

const LIMIT = 100_000;
const CHUNK = 50_000;
// Coloring a few MB of JSON makes hundreds of thousands of spans; past this it stays plain.
const HIGHLIGHT_LIMIT = 1_000_000;
const CHILDREN = 200;
// Top-level branches start open when there are this many or fewer.
export const OPEN_FIRST = 10;

// Shared with the plain DOM that plugins get from context.ui.
export const codeClass = 'm-0 rounded-md bg-secondary px-2.5 py-2 whitespace-pre-wrap wrap-anywhere';
export const noteClass = 'mb-1.5 text-xs text-warning';
export const treeToggleClass = '-ml-3.5 inline-flex items-center gap-0.5 [&_svg]:text-muted-foreground';
export const jsonClass = {
  key: 'text-json-key',
  str: 'text-json-string',
  num: 'text-json-number',
  lit: 'text-json-literal',
};
// highlight() marks tokens with j-* classes.
const highlightClass =
  '[&_.j-key]:text-json-key [&_.j-lit]:text-json-literal [&_.j-num]:text-json-number [&_.j-str]:text-json-string';
export const chipClass =
  'ml-1.5 inline-flex cursor-pointer rounded-sm bg-primary-soft px-1 align-middle font-sans text-[10px] leading-4 font-medium text-foreground outline-none hover:bg-primary/25 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-expanded:bg-primary aria-expanded:text-primary-foreground';
export const timeClass = 'ml-1.5 font-sans text-muted-foreground';
export const decodedClass = 'my-0.5 border-l-2 border-primary-soft pl-2';
export const closeClass =
  'inline-flex cursor-pointer rounded-sm hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none';
export const kvClass = {
  table: 'w-full border-collapse font-mono text-xs',
  key: 'w-[34%] max-w-60 border-b py-0.5 pr-2 text-left align-top font-semibold wrap-anywhere text-json-key',
  value: 'border-b py-0.5 pr-2 text-left align-top wrap-anywhere',
};

type BodyMode = 'tree' | 'raw';

// One setting for every JsonView, so a switch in one detail holds in the others.
let bodyMode: BodyMode | undefined;
const modeListeners = new Set<() => void>();
const getBodyMode = (): BodyMode => (bodyMode ??= load<BodyMode>('bodyMode', 'raw') === 'tree' ? 'tree' : 'raw');
const subscribeBodyMode = (listener: () => void) => {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
};
const setBodyMode = (next: BodyMode) => {
  bodyMode = next;
  save('bodyMode', next);
  for (const listener of modeListeners) listener();
};

const MODES = [
  ['tree', 'Tree', ListTree],
  ['raw', 'Raw', Braces],
] as const;

export function JsonModeToggle() {
  const mode = useSyncExternalStore(subscribeBodyMode, getBodyMode);
  return (
    <div
      role="group"
      aria-label="JSON view"
      className="inline-flex shrink-0 rounded-md border bg-background p-px shadow-xs dark:border-input dark:bg-input/30"
    >
      {MODES.map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => setBodyMode(value)}
          className={cn(
            'inline-flex h-5 cursor-pointer items-center gap-1 rounded-[5px] px-1.5 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-3',
            mode === value ? 'bg-primary-soft text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon />
          {label}
        </button>
      ))}
    </div>
  );
}

export const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (isObject(value) && Object.keys(value).length === 0);

function Truncated({ marker }: { marker: Json }) {
  const m = isObject(marker) ? marker : {};
  const size = typeof m.size === 'number' ? formatBytes(m.size) : 'unknown size';
  return (
    <div>
      <div className={noteClass}>Cut by the app at its maxValueLength. Full size {size}.</div>
      <pre className={codeClass}>{String(m.preview ?? '')}</pre>
    </div>
  );
}

// Transparent pixels show over a checkerboard.
const checkerClass = 'bg-[repeating-conic-gradient(var(--color-muted)_0_25%,transparent_0_50%)] bg-size-[12px_12px]';

interface PreviewProps {
  image: DataImage;
  small?: boolean;
}

// Keyed by source, so another event's image starts with fresh state.
export const ImagePreview = (props: PreviewProps) => <Preview key={props.image.src} {...props} />;

function Preview({ image, small }: PreviewProps) {
  const [size, setSize] = useState<string>();
  const [failed, setFailed] = useState(false);
  const caption = [image.type, size, formatBytes(image.bytes)].filter(Boolean).join(' · ');
  // Spans, so a preview can sit inside a button.
  return (
    <span className="block">
      {failed ? (
        <span className={cn('block', noteClass)}>Not a valid image.</span>
      ) : (
        <img
          src={image.src}
          alt={`${image.type} preview`}
          onLoad={(e) => setSize(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
          onError={() => setFailed(true)}
          className={cn(
            'block min-h-8 max-w-full min-w-8 rounded-sm border object-contain',
            checkerClass,
            small ? 'max-h-24' : 'max-h-80',
          )}
        />
      )}
      <span className="mt-0.5 block text-xs text-muted-foreground">{caption}</span>
    </span>
  );
}

function JsonViewInner({ value }: { value: unknown }) {
  const mode = useSyncExternalStore(subscribeBodyMode, getBodyMode);
  if (isEmptyValue(value)) return <div className="text-muted-foreground">empty</div>;
  if (isObject(value) && value[TRUNCATED] !== undefined) return <Truncated marker={value[TRUNCATED]} />;
  const image = dataImage(value);
  if (image) return <ImagePreview image={image} />;
  if (mode === 'tree' && (isObject(value) || Array.isArray(value))) {
    return (
      <div className={codeClass}>
        <Children value={value} depth={0} path="" />
      </div>
    );
  }
  return <Raw value={value} />;
}

function Raw({ value }: { value: unknown }) {
  const [all, setAll] = useState(false);
  const text = useMemo(() => pretty(value), [value]);
  const long = text.length > LIMIT && !all;
  const chunks = useMemo(() => chunkLines(long ? text.slice(0, LIMIT) : text, CHUNK), [text, long]);
  const colored = typeof value !== 'string' && (long || text.length <= HIGHLIGHT_LIMIT);
  return (
    <div>
      <pre className={cn(codeClass, colored && highlightClass)}>
        {chunks.map((chunk, i) => (
          <div
            key={i}
            // Off-screen chunks skip layout, so a body of several MB opens at once.
            style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${lineCount(chunk)}lh` }}
            {...(colored ? { dangerouslySetInnerHTML: { __html: highlight(chunk) } } : { children: chunk })}
          />
        ))}
      </pre>
      {long && (
        <Button type="button" variant="outline" size="xs" onClick={() => setAll(true)}>
          Show all ({formatBytes(text.length)})
        </Button>
      )}
    </div>
  );
}

const lineCount = (text: string) => {
  let n = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < text.length - 1; i = text.indexOf('\n', i + 1)) n++;
  return n;
};

export const JsonView = memo(JsonViewInner);

function Children(props: { value: Json[] | { [key: string]: Json }; depth: number; path?: string }) {
  const { value, depth, path } = props;
  const [limit, setLimit] = useState(CHILDREN);
  const index = Array.isArray(value);
  const shown: [string, Json][] = Array.isArray(value)
    ? value.slice(0, limit).map((v, i) => [String(i), v])
    : Object.entries(value).slice(0, limit);
  const total = Array.isArray(value) ? value.length : Object.keys(value).length;
  const open = depth === 0 && total <= OPEN_FIRST;
  return (
    <ul className={depth ? 'pl-4' : undefined}>
      {shown.map(([k, v]) => (
        <TreeNode
          key={k}
          name={k}
          value={v}
          depth={depth}
          open={open}
          index={index}
          path={path === undefined ? undefined : childPath(path, k, index)}
        />
      ))}
      {total > limit && (
        <li>
          <Button type="button" variant="outline" size="xs" onClick={() => setLimit(limit + CHILDREN)}>
            Show {Math.min(CHILDREN, total - limit)} more of {total - limit}
          </Button>
        </li>
      )}
    </ul>
  );
}

function TreeNode(props: { name: string; value: Json; depth: number; open: boolean; index: boolean; path?: string }) {
  const { name, value, depth, index, path } = props;
  const [open, setOpen] = useState(props.open);
  const branch = isObject(value) || Array.isArray(value);
  const label = <span className={jsonClass.key}>{name}</span>;
  if (!branch || isEmptyValue(value)) {
    return (
      <li className="wrap-anywhere">
        <Value value={value} name={index ? undefined : name} path={path} label={<>{label}: </>} />
      </li>
    );
  }
  const size = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
  return (
    <li className="wrap-anywhere">
      <Value value={value} path={path}>
        <button type="button" className={treeToggleClass} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label} <span className="text-muted-foreground">{size}</span>
        </button>
      </Value>
      {open && <Children value={value} depth={depth + 1} path={path} />}
    </li>
  );
}

interface ValueProps extends HintContext {
  value: Json;
  /** The key, for hints that go by name; none for array items. */
  name?: string;
  path?: string;
  /** In a table: strings as they are, "Copy key". */
  table?: boolean;
  label?: ReactNode;
  /** Shown in place of the value, as a branch's toggle. */
  children?: ReactNode;
}

/** A value with its hint, the value menu and what it decodes to. */
function Value({ value, name, path, table, label, children, headers, at }: ValueProps) {
  const [decoded, setDecoded] = useState<DecodeAs>();
  const found = useMemo(
    () => (children ? undefined : hint(name, value, { headers, at })),
    [children, name, value, headers, at],
  );
  const button = useRef<HTMLButtonElement>(null);
  const open = () => {
    if (!button.current) return;
    openValueMenu({ anchor: button.current, value, path, table, onDecode: setDecoded });
  };
  const toggle = (as: DecodeAs) => setDecoded(decoded === as ? undefined : as);
  return (
    <>
      <span className="group/value" onContextMenu={(e) => contextMenu(e, open)}>
        {label}
        {children ?? (table && typeof value === 'string' ? value : <Leaf value={value} />)}
        {found && 'as' in found && (
          <button
            type="button"
            className={chipClass}
            aria-expanded={decoded === found.as}
            onClick={() => toggle(found.as)}
          >
            {DECODE_LABELS[found.as]}
          </button>
        )}
        {found && 'time' in found && <span className={timeClass}>{formatDateTime(found.time)}</span>}
        <button
          ref={button}
          type="button"
          aria-label="Value menu"
          aria-haspopup="menu"
          className={menuButtonClass}
          onClick={open}
        >
          <Ellipsis size={12} />
        </button>
      </span>
      {decoded && <DecodedValue as={decoded} value={value} onClose={() => setDecoded(undefined)} />}
    </>
  );
}

function DecodedValue({ as, value, onClose }: { as: DecodeAs; value: Json; onClose: () => void }) {
  const result = useMemo(() => decodeAs(as, value), [as, value]);
  const label = DECODE_LABELS[as];
  return (
    <div className={decodedClass} role="group" aria-label={`Decoded as ${label}`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <button type="button" className={closeClass} aria-label={`Close ${label}`} onClick={onClose}>
          <X size={12} />
        </button>
      </div>
      {'error' in result ? (
        <div className={noteClass}>{result.error}</div>
      ) : 'text' in result ? (
        <div>{result.text}</div>
      ) : (isObject(result.value) || Array.isArray(result.value)) && !isEmptyValue(result.value) ? (
        <Children value={result.value} depth={0} />
      ) : (
        <Value value={result.value} />
      )}
    </div>
  );
}

// Enough of a data URL to show its type and start.
const DATA_PREFIX = 48;

function ImageLeaf({ image }: { image: DataImage }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className={jsonClass.str}>"{image.src.slice(0, DATA_PREFIX)}…"</span>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Show smaller' : 'Show larger'}
        className="block cursor-zoom-in py-0.5 text-left aria-expanded:cursor-zoom-out"
        onClick={() => setOpen(!open)}
      >
        <ImagePreview image={image} small={!open} />
      </button>
    </>
  );
}

function Leaf({ value }: { value: Json }) {
  const image = dataImage(value);
  if (image) return <ImageLeaf key={image.src} image={image} />;
  if (typeof value === 'string') return <span className={jsonClass.str}>{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className={jsonClass.num}>{value}</span>;
  if (value === null || typeof value === 'boolean') return <span className={jsonClass.lit}>{String(value)}</span>;
  return <span className="text-muted-foreground">{Array.isArray(value) ? '[]' : '{}'}</span>;
}

/** Headers and params: one row per value. */
export function KeyValues({ value, headers, at }: { value: unknown } & HintContext) {
  if (!isObject(value)) return <JsonView value={value} />;
  if (isEmptyValue(value)) return <div className="text-muted-foreground">empty</div>;
  if (value[TRUNCATED] !== undefined) return <Truncated marker={value[TRUNCATED]} />;
  const rows: [string, string, string][] = Object.entries(value).flatMap(([k, v]): [string, string, string][] =>
    Array.isArray(v) ? v.map((x, i) => [`${k}|${i}`, k, headerValue(x)]) : [[k, k, v === null ? '' : headerValue(v)]],
  );
  return (
    <table className={kvClass.table}>
      <tbody>
        {rows.map(([id, k, v]) => (
          <tr key={id}>
            <th className={kvClass.key}>{k}</th>
            <td className={kvClass.value}>
              <Value value={v} name={k} path={k} table headers={headers} at={at} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
