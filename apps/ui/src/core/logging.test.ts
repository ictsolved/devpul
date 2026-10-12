import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { JsonObject } from './events';
import { DEVELOPER_LOG, fromLogging, levelName, loadFull, logObjects } from './logging';

// Recorded from a real VM by packages/devpul/test/vm_service_test.dart.
interface Fixture {
  events: JsonObject[];
  getObject: { request: JsonObject; result: JsonObject };
  invoke: { request: JsonObject; result: JsonObject }[];
}
const fixture = JSON.parse(
  readFileSync(new URL('../../../../contract/logging.json', import.meta.url), 'utf8'),
) as Fixture;

const ids = (n: number) => ({ conn: 'c1', run: 'c1|isolateGroups/1', n });
const [withError, long] = fixture.events.map((e, i) => fromLogging(e, ids(i + 1)));

// Answers getObject and invoke from the fixture, as the app did.
async function call(method: string, params: Record<string, unknown>): Promise<unknown> {
  await Promise.resolve();
  const { isolateId, ...rest } = params;
  expect(isolateId).toBe('isolates/1');
  if (method === 'getObject') {
    expect(rest).toEqual(fixture.getObject.request);
    return fixture.getObject.result;
  }
  const hit = fixture.invoke.find((i) => i.request.targetId === rest.targetId);
  expect(rest).toEqual(hit?.request);
  return hit?.result;
}

describe('fromLogging', () => {
  it('maps a record with logger, level, error and stack', () => {
    expect(withError).toMatchObject({
      kind: 'log',
      session: 'log:isolates/1',
      run: 'c1|isolateGroups/1',
      isolate: 'main',
      isolateId: 'isolates/1',
      ts: 1767225600000,
      data: {
        level: 'warning',
        message: 'token refresh failed',
        name: 'auth',
        source: DEVELOPER_LOG,
        // The class until the row opens; the VM sends no text for either.
        error: 'StateError',
        objects: { error: 'objects/3', stack: 'objects/4' },
      },
    });
    expect(withError?.data.stack).toBeUndefined();
  });

  it('keeps the start of a cut message and where the rest is', () => {
    expect(long?.data.message).toHaveLength(128);
    expect(long?.data).toMatchObject({ level: 'info', objects: { message: 'objects/5', length: 371 } });
    // developer.log's default name is empty.
    expect(long?.data.name).toBeUndefined();
    expect(long?.data.error).toBeUndefined();
  });

  it('takes a stack trace the VM sends as text', () => {
    const [event] = fixture.events;
    const record = event?.logRecord as JsonObject;
    const e = fromLogging(
      {
        ...event,
        logRecord: { ...record, stackTrace: { type: '@Instance', kind: 'StackTrace', valueAsString: '#0 main' } },
      },
      ids(3),
    );
    expect(e?.data.stack).toBe('#0 main');
    expect(e?.data.objects).toEqual({ error: 'objects/3' });
  });

  it('keys a record by its isolate and time, the same on every replay', () => {
    const again = fromLogging(fixture.events[0]!, ids(9));
    expect(again?.key).toBe(withError?.key);
    expect(withError?.key).toBe(`log:isolates/1|${withError?.seq}`);
    expect(Math.floor(withError!.seq / 1000)).toBe(withError?.ts);
    expect(long!.seq).toBeGreaterThan(withError!.seq);
  });

  it('skips events without a record', () => {
    expect(fromLogging({ kind: 'Logging' }, ids(4))).toBeNull();
  });
});

describe('levelName', () => {
  it("names package:logging's levels and the values between them", () => {
    expect([0, 300, 500, 700, 800, 850, 900, 1000, 1200, 2000].map(levelName)).toEqual([
      'info',
      'finest',
      'fine',
      'config',
      'info',
      'info',
      'warning',
      'severe',
      'shout',
      'shout',
    ]);
  });
});

const expired = () => Promise.resolve({ type: 'Sentinel', kind: 'Expired', valueAsString: '<expired>' });

describe('loadFull', () => {
  it('reads the full message, error and stack from the app', async () => {
    const objects = { message: 'objects/5', length: 371, error: 'objects/3', stack: 'objects/4' };
    expect(logObjects(long!)).toEqual({ message: 'objects/5', length: 371 });
    expect(logObjects(withError!)).toEqual({ error: 'objects/3', stack: 'objects/4' });
    const full = await loadFull(call, 'isolates/1', objects);
    expect(full.message).toHaveLength(371);
    expect(full.message?.startsWith(String(long?.data.message))).toBe(true);
    expect(full.error).toBe('Bad state: expired');
    expect(full.stack).toBe('#0      main (file:///app/main.dart:5:3)');
  });

  it('fails when the app has dropped the object', async () => {
    await expect(loadFull(expired, 'isolates/1', logObjects(long!)!)).rejects.toThrow(
      'The app no longer holds this value.',
    );
  });
});
