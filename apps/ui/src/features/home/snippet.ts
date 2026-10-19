export type Lang = 'yaml' | 'dart' | 'sh';
export type Kind = 'key' | 'string' | 'number' | 'keyword' | 'comment';

export interface Segment {
  text: string;
  kind?: Kind;
}

// Enough for the fixed snippets on the home page, not a general highlighter.
// Group names are the kinds; Dart types take the key color.
const PATTERNS: Record<Lang, RegExp> = {
  yaml: /(?<comment>#.*)|(?<key>[\w-]+)(?=:)|(?<number>\^?\d+(?:\.\d+)*)/g,
  dart: /(?<comment>\/\/.*)|(?<string>'(?:\\.|[^'\\])*')|(?<keyword>\b(?:void|const|final|var|return|await|async)\b)|(?<key>\b[A-Z]\w*)|(?<number>\b\d+(?:\.\d+)*\b)/g,
  sh: /(?<key>^\S+)/gm,
};

export function tokenize(code: string, lang: Lang): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of code.matchAll(PATTERNS[lang])) {
    const kind = Object.entries(match.groups ?? {}).find(([, v]) => v !== undefined)?.[0] as Kind | undefined;
    if (match.index > last) out.push({ text: code.slice(last, match.index) });
    out.push({ text: match[0], kind });
    last = match.index + match[0].length;
  }
  if (last < code.length) out.push({ text: code.slice(last) });
  return out;
}
