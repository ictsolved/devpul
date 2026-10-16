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

// The SDK and Flutter: frames between the app's own that it rarely needs to read.
const FRAMEWORK = /\((?:dart:|package:flutter\/)|^(?:dart:|package:flutter\/)/;
const GAP = /^(?:<asynchronous suspension>|=+ asynchronous gap =+)$/;
const isFramework = (line: StackLine) => FRAMEWORK.test(line.text.trim());

/** A folded part's `frames` counts its frames; its `lines` also hold the gaps between them. */
export type StackPart = { lines: StackLine[]; folded: boolean; frames: number };

/**
 * Splits lines into shown parts and runs of at least [min] framework frames to fold. The first
 * [head] lines always show: where the error was thrown can be framework code.
 */
export function foldStack(lines: StackLine[], min = 3, head = 5): StackPart[] {
  const parts: StackPart[] = [];
  const push = (part: StackLine[], folded: boolean, frames: number) => {
    const last = parts.at(-1);
    if (last && !last.folded && !folded) {
      last.lines.push(...part);
    } else parts.push({ lines: part, folded, frames });
  };
  if (lines.length) push(lines.slice(0, head), false, 0);
  let i = head;
  while (i < lines.length) {
    if (!isFramework(lines[i]!)) {
      push([lines[i]!], false, 0);
      i++;
      continue;
    }
    // A run spans framework frames and the gaps between them, not a trailing gap.
    let end = i;
    let frames = 0;
    for (let j = i; j < lines.length; j++) {
      const line = lines[j]!;
      if (isFramework(line)) {
        frames++;
        end = j + 1;
      } else if (!GAP.test(line.text.trim())) break;
    }
    push(lines.slice(i, end), frames >= min, frames);
    i = end;
  }
  return parts;
}
