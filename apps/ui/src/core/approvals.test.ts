import { describe, expect, it } from 'vitest';
import { type Approval, approve, approvedAndCached, toLoad } from './approvals';

const all = () => true;

describe('toLoad', () => {
  const approvals: Approval[] = [
    { id: 'a', hash: 'h1', version: '1.0.0' },
    { id: 'b', hash: 'h2', off: true },
    { id: 'c', hash: 'h3' },
  ];

  it('loads cached approvals for listed packages before any source arrives', () => {
    expect(toLoad(approvals, [{ id: 'a' }, { id: 'b' }, { id: 'x' }], all)).toEqual(new Map([['a', 'h1']]));
  });

  it('skips packages no run lists and sources not at hand', () => {
    expect(toLoad(approvals, [{ id: 'c' }], (h) => h !== 'h3').size).toBe(0);
    expect(toLoad(approvals, [], all).size).toBe(0);
  });

  it('follows the source a live app sent', () => {
    expect(toLoad(approvals, [{ id: 'a', hash: 'h9' }], all).size).toBe(0);
    expect(
      toLoad(
        approvals,
        [
          { id: 'a', hash: 'h9' },
          { id: 'a', hash: 'h1' },
        ],
        all,
      ),
    ).toEqual(new Map([['a', 'h1']]));
    expect(toLoad(approvals, [{ id: 'a' }, { id: 'a', hash: 'h9' }], all).size).toBe(0);
  });
});

describe('approve', () => {
  it('replaces the approval of the same package', () => {
    const list = approve(
      [
        { id: 'a', hash: 'h1' },
        { id: 'b', hash: 'h2' },
      ],
      { id: 'a', hash: 'h3', version: '2' },
    );
    expect(list).toEqual([
      { id: 'b', hash: 'h2' },
      { id: 'a', hash: 'h3', version: '2' },
    ]);
  });
});

const notGone = (hash: string) => hash !== 'gone';

describe('approvedAndCached', () => {
  const approvals: Approval[] = [
    { id: 'a', hash: 'h1' },
    { id: 'b', hash: 'h2', off: true },
  ];

  it('needs an approval for that package and hash, and its source', () => {
    expect(approvedAndCached(approvals, 'a', 'h1', notGone)).toBe(true);
    expect(approvedAndCached(approvals, 'b', 'h2', notGone)).toBe(true);
    expect(approvedAndCached(approvals, 'a', 'h2', notGone)).toBe(false);
    expect(approvedAndCached(approvals, 'c', 'h1', notGone)).toBe(false);
    expect(approvedAndCached(approvals, 'a', undefined, notGone)).toBe(false);
    expect(approvedAndCached([{ id: 'a', hash: 'gone' }], 'a', 'gone', notGone)).toBe(false);
  });
});
