import { describe, expect, it } from 'vitest';
import { tokenize, type Segment } from './snippet';

const marked = (segments: Segment[]) => segments.map((s) => (s.kind ? `${s.kind}(${s.text})` : s.text)).join('');

describe('tokenize', () => {
  it('marks yaml keys, versions and comments', () => {
    expect(marked(tokenize('dependencies:\n  devpul_dio: ^1.1.0  # Dio, or package:http', 'yaml'))).toBe(
      'key(dependencies):\n  key(devpul_dio): number(^1.1.0)  comment(# Dio, or package:http)',
    );
  });

  it('marks dart keywords, types, strings and numbers', () => {
    expect(marked(tokenize("void main() {\n  Devpul.session({'v': '1.0'}, 2); // x\n}", 'dart'))).toBe(
      "keyword(void) main() {\n  key(Devpul).session({string('v'): string('1.0')}, number(2)); comment(// x)\n}",
    );
  });

  it('marks the command in a shell line', () => {
    expect(marked(tokenize('dart pub global activate devpul_cli', 'sh'))).toBe(
      'key(dart) pub global activate devpul_cli',
    );
  });

  it('keeps the text', () => {
    const code = "a: 'b' # c\n";
    expect(
      tokenize(code, 'yaml')
        .map((s) => s.text)
        .join(''),
    ).toBe(code);
  });
});
