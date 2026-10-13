import { describe, expect, it } from 'vitest';
import { filePath, locationText, readLocation, shortPath } from './location';

describe('location', () => {
  it('reads a location only when every field is there', () => {
    expect(readLocation({ file: 'file:///a/lib/b.dart', line: 3, column: 7 })).toEqual({
      file: 'file:///a/lib/b.dart',
      line: 3,
      column: 7,
    });
    expect(readLocation({ file: 'file:///a.dart', line: 3 })).toBeUndefined();
    expect(readLocation('file:///a.dart:3:7')).toBeUndefined();
  });

  it('turns file URIs into paths', () => {
    expect(filePath('file:///home/me/my%20app/lib/main.dart')).toBe('/home/me/my app/lib/main.dart');
    expect(filePath('file:///C:/src/shop/lib/main.dart')).toBe('C:/src/shop/lib/main.dart');
    expect(filePath('org-dartlang-app:///lib/main.dart')).toBe('org-dartlang-app:///lib/main.dart');
  });

  it('shortens to the package folder', () => {
    expect(shortPath('file:///home/me/shop/lib/src/cart.dart')).toBe('shop/lib/src/cart.dart');
    expect(shortPath('org-dartlang-app:///lib/main.dart')).toBe('lib/main.dart');
    expect(shortPath('file:///home/me/shop/test/cart_test.dart')).toBe('/home/me/shop/test/cart_test.dart');
  });

  it('formats path:line:column', () => {
    expect(locationText({ file: 'file:///a/lib/b.dart', line: 3, column: 7 })).toBe('/a/lib/b.dart:3:7');
  });
});
