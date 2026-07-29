import { describe, expect, it } from '@jest/globals';
import { MAIDR_VERSION } from '@util/version';
import { version as packageVersion } from '../../package.json';

describe('mAIDR_VERSION', () => {
  it('reports the version declared in package.json', () => {
    expect(MAIDR_VERSION).toBe(packageVersion);
  });

  it('is a non-empty semantic version string', () => {
    expect(typeof MAIDR_VERSION).toBe('string');
    expect(MAIDR_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
