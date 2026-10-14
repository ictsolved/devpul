import { describe, expect, it } from 'vitest';
import { dataImage, dataUrl, dataUrlLength, imageType, svgImage } from './image';

describe('image', () => {
  it('reads data image strings with their decoded size', () => {
    expect(dataImage('data:image/png;base64,AQID')).toEqual({
      src: 'data:image/png;base64,AQID',
      type: 'image/png',
      bytes: 3,
    });
    expect(dataImage('data:image/GIF;base64,AQI=')?.bytes).toBe(2);
    expect(dataImage('data:image/png;base64,AQ==')?.bytes).toBe(1);
    expect(dataImage('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')?.type).toBe('image/svg+xml');
    expect(dataImage('data:text/plain;base64,AQID')).toBeUndefined();
    expect(dataImage('see data:image/png;base64,AQID')).toBeUndefined();
    expect(dataImage(42)).toBeUndefined();
  });

  it('takes image types from a Content-Type value', () => {
    expect(imageType('Image/WebP; q=1')).toBe('image/webp');
    expect(imageType('application/json')).toBeUndefined();
    expect(imageType(undefined)).toBeUndefined();
  });

  it('turns an SVG text body into a data URL', () => {
    expect(svgImage('<svg/>', { 'Content-Type': 'image/svg+xml; charset=utf-8' })).toEqual({
      src: 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E',
      type: 'image/svg+xml',
      bytes: 6,
    });
    expect(svgImage('<svg/>', { 'content-type': ['image/svg+xml'] })).toBeDefined();
    expect(svgImage('<svg/>', { 'content-type': 'text/xml' })).toBeUndefined();
    expect(svgImage({}, { 'content-type': 'image/svg+xml' })).toBeUndefined();
  });

  it('encodes bytes as the adapters do', () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 256);
    const url = dataUrl('image/png', big);
    expect(url.length).toBe(dataUrlLength('image/png', big.length));
    expect(dataImage(url)?.bytes).toBe(big.length);
    expect(dataUrl('image/gif', new Uint8Array([71, 73, 70]))).toBe('data:image/gif;base64,R0lG');
  });
});
