import { describe, expect, it } from 'vitest';
import { type EditorDeps, openInEditor } from './editor';

const NO_LISTENER = { code: 130, message: 'Custom stream does not exist' };
const UNKNOWN = { code: -32601, message: 'Unknown method "Editor.navigateToCode".' };

function deps(over: { vm?: Record<string, unknown>; dtd?: Record<string, unknown> } = {}) {
  const calls: { to: string; method: string; params: Record<string, unknown> }[] = [];
  const copied: string[] = [];
  const answer = (to: string, table: Record<string, unknown>) => (method: string, params: Record<string, unknown>) => {
    calls.push({ to, method, params });
    const v = table[method];
    return v instanceof Error || (v && typeof v === 'object' && 'code' in v) ? Promise.reject(v) : Promise.resolve(v);
  };
  const d: EditorDeps = {
    vm: answer('vm', {
      lookupResolvedPackageUris: { type: 'UriList', uris: ['file:///home/me/shop/lib/cart.dart'] },
      postEvent: NO_LISTENER,
      ...over.vm,
    }),
    isolateId: 'isolates/1',
    dtd: over.dtd && answer('dtd', over.dtd),
    copy: (text) => {
      copied.push(text);
      return Promise.resolve(true);
    },
  };
  return { d, calls, copied };
}

const cart = { file: 'package:shop/cart.dart', line: 12, column: 5 };

describe('openInEditor', () => {
  it('opens through the editor on DTD', async () => {
    const { d, calls } = deps({ dtd: { 'Editor.navigateToCode': { type: 'Success' } } });
    expect(await openInEditor(cart, d)).toEqual({
      how: 'editor',
      location: { file: 'file:///home/me/shop/lib/cart.dart', line: 12, column: 5 },
    });
    expect(calls[0]).toEqual({
      to: 'vm',
      method: 'lookupResolvedPackageUris',
      params: { isolateId: 'isolates/1', uris: ['package:shop/cart.dart'], local: true },
    });
    expect(calls[1]).toEqual({
      to: 'dtd',
      method: 'Editor.navigateToCode',
      params: { uri: 'file:///home/me/shop/lib/cart.dart', line: 12, column: 5 },
    });
    expect(calls).toHaveLength(2);
  });

  it('posts a ToolEvent when no editor is on DTD', async () => {
    const { d, calls } = deps({ vm: { postEvent: { type: 'Success' } }, dtd: { 'Editor.navigateToCode': UNKNOWN } });
    expect((await openInEditor({ ...cart, column: undefined }, d)).how).toBe('ide');
    expect(calls.at(-1)).toEqual({
      to: 'vm',
      method: 'postEvent',
      params: {
        stream: 'ToolEvent',
        eventKind: 'navigate',
        eventData: { fileUri: 'file:///home/me/shop/lib/cart.dart', line: 12, column: 1, source: 'devpul' },
      },
    });
  });

  it('copies the path when nothing listens', async () => {
    const { d, copied } = deps();
    expect(await openInEditor(cart, d)).toEqual({ how: 'copied', text: '/home/me/shop/lib/cart.dart:12:5' });
    expect(copied).toEqual(['/home/me/shop/lib/cart.dart:12:5']);
  });

  it('copies the package URI it cannot resolve', async () => {
    const { d, calls } = deps({ vm: { lookupResolvedPackageUris: { type: 'UriList', uris: [null] } } });
    expect(await openInEditor({ ...cart, column: undefined }, d)).toEqual({
      how: 'copied',
      text: 'package:shop/cart.dart:12',
    });
    expect(calls.map((c) => c.method)).toEqual(['lookupResolvedPackageUris']);
  });

  it('copies without a connection', async () => {
    const { d } = deps({ vm: { lookupResolvedPackageUris: new Error('not connected'), postEvent: new Error('x') } });
    expect(await openInEditor({ file: 'file:///a/lib/b.dart', line: 3 }, d)).toEqual({
      how: 'copied',
      text: '/a/lib/b.dart:3',
    });
  });
});
