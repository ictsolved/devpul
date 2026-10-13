import type { SourceLocation } from './location';

export interface StackLine {
  text: string;
  /** The location's span in `text`, for frames an editor can open. */
  frame?: { start: number; end: number; location: SourceLocation };
}

// VM: `#3      Cart.add (package:shop/cart.dart:12:5)`.
const VM = /\(((?:package|file):[^()\s]*?):(\d+)(?::(\d+))?\)\s*$/;
// Web, as stack_trace formats it: `package:shop/cart.dart 12:5   add`.
const WEB = /^((?:package|file):\S+) (\d+)(?::(\d+))?(?=\s|$)/;

function frameOf(text: string): StackLine['frame'] {
  const vm = VM.exec(text);
  const m = vm ?? WEB.exec(text);
  if (!m) return undefined;
  const start = m.index + (vm ? 1 : 0);
  const location: SourceLocation = { file: String(m[1]), line: Number(m[2]) };
  if (m[3] !== undefined) location.column = Number(m[3]);
  return { start, end: start + m[0].trimEnd().length - (vm ? 2 : 0), location };
}

/** Splits a stack trace into lines, with the frames that have a `package:` or `file:` URI. */
export function stackLines(stack: string): StackLine[] {
  return stack.split('\n').map((text) => {
    const frame = frameOf(text);
    return frame ? { text, frame } : { text };
  });
}
