import { type MouseEvent as ReactMouseEvent, useSyncExternalStore } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { copyValue, DECODE_LABELS, type DecodeAs, decoders } from '../core/decode';
import type { Json } from '../core/events';
import { copyText } from './Copy';

export interface ValueMenuRequest {
  anchor: HTMLElement;
  value: Json;
  /** Copied by "Copy path", or by "Copy key" in a table. */
  path?: string;
  table?: boolean;
  onDecode: (as: DecodeAs) => void;
}

// One menu for every value, React or plugin DOM, so a tree of thousands of leaves holds no menu state.
// The last request stays after close, so the menu can animate out and hand focus back.
let state: { request?: ValueMenuRequest; open: boolean } = { open: false };
const listeners = new Set<() => void>();
const set = (next: typeof state) => {
  state = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const openValueMenu = (request: ValueMenuRequest) => set({ request, open: true });

export const menuButtonClass =
  'ml-1 inline-flex cursor-pointer rounded-sm align-middle text-muted-foreground opacity-0 outline-none group-hover/value:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:opacity-100';

/** Opens the menu from a right-click on a value, unless the user is selecting text to copy. */
export function contextMenu(e: MouseEvent | ReactMouseEvent, open: () => void) {
  if (window.getSelection()?.toString()) return;
  e.preventDefault();
  e.stopPropagation();
  open();
}

export function ValueMenu() {
  const { request: req, open } = useSyncExternalStore(subscribe, () => state);
  const rect = req?.anchor.getBoundingClientRect();
  return (
    <DropdownMenu open={open} onOpenChange={(next) => !next && set({ request: req, open: false })}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed"
          style={rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      </DropdownMenuTrigger>
      {req && (
        <DropdownMenuContent
          align="start"
          aria-label="Value"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (req.anchor.isConnected) req.anchor.focus();
          }}
        >
          {decoders(req.value).length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Decode as</DropdownMenuLabel>
              {decoders(req.value).map((as) => (
                <DropdownMenuItem key={as} onSelect={() => req.onDecode(as)}>
                  {DECODE_LABELS[as]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => void copyText(copyValue(req.value))}>Copy value</DropdownMenuItem>
          {req.path !== undefined && (
            <DropdownMenuItem onSelect={() => void copyText(req.path!)}>
              {req.table ? 'Copy key' : 'Copy path'}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
