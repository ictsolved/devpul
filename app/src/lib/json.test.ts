import { describe, expect, it } from 'vitest';
import { formatBytes, highlight } from './json';

describe('highlight', () => {
  it('escapes before tokenizing', () => {
    const html = highlight(JSON.stringify({ '<b>': '<script>&' }, null, 2));
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;&amp;');
  });

  it('marks keys, strings, numbers and literals', () => {
    const html = highlight('{"a": "x", "n": -1.5e3, "t": true, "z": null}');
    expect(html).toContain('<span class="j-key">"a"</span>:');
    expect(html).toContain('<span class="j-str">"x"</span>');
    expect(html).toContain('<span class="j-num">-1.5e3</span>');
    expect(html).toContain('<span class="j-lit">true</span>');
    expect(html).toContain('<span class="j-lit">null</span>');
  });

  it('leaves numbers inside strings alone', () => {
    expect(highlight('"v1 2 true"')).toBe('<span class="j-str">"v1 2 true"</span>');
  });

  it('handles escaped quotes', () => {
    expect(highlight('"a\\"b"')).toBe('<span class="j-str">"a\\"b"</span>');
  });
});

describe('formatBytes', () => {
  it('picks a unit', () => {
    expect(formatBytes(10)).toBe('10 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
