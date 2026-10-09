import { describe, expect, it } from 'vitest';
import { compareVersions, isBreaking, parseVersion, type Version } from './semver';

const v = (text: string): Version => {
  const version = parseVersion(text);
  if (!version) throw new Error(text);
  return version;
};

describe('parseVersion', () => {
  it('reads release, pre-release and build', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] });
    expect(parseVersion('1.0.0-dev.2+abc')).toEqual({ major: 1, minor: 0, patch: 0, pre: ['dev', '2'] });
  });

  it('rejects anything else', () => {
    for (const text of ['', '1.2', 'v1.2.3', '1.2.3-', '1.2.3 ', 'latest']) expect(parseVersion(text)).toBeUndefined();
  });
});

describe('compareVersions', () => {
  it('orders by semver precedence', () => {
    const order = [
      '0.9.9',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.10.0',
      '2.0.0',
    ];
    for (let i = 1; i < order.length; i++) {
      expect(compareVersions(v(order[i - 1]!), v(order[i]!))).toBeLessThan(0);
      expect(compareVersions(v(order[i]!), v(order[i - 1]!))).toBeGreaterThan(0);
    }
  });

  it('ignores build metadata', () => {
    expect(compareVersions(v('1.0.0+a'), v('1.0.0+b'))).toBe(0);
  });
});

describe('isBreaking', () => {
  it('follows pub caret ranges', () => {
    expect(isBreaking(v('1.2.0'), v('1.9.0'))).toBe(false);
    expect(isBreaking(v('1.2.0'), v('2.0.0'))).toBe(true);
    expect(isBreaking(v('0.3.1'), v('0.3.4'))).toBe(false);
    expect(isBreaking(v('0.3.1'), v('0.4.0'))).toBe(true);
    expect(isBreaking(v('0.3.1'), v('1.0.0'))).toBe(true);
    expect(isBreaking(v('1.0.0-dev.1'), v('1.0.0'))).toBe(false);
  });
});
