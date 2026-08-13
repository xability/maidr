import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

/**
 * The Jest core and its jsdom environment run a major apart, deliberately.
 *
 * Nothing in the dependency graph says so: `jest-environment-jsdom` declares
 * a peer on `canvas` and **not on `jest`**, so npm has no constraint to check
 * and installs the combination silently. `@jest/environment` then resolves at
 * two majors in one tree and the suites pass by observation rather than by any
 * declared contract (#766).
 *
 * A note in `.claude/rules/testing.md` is the only thing standing between the
 * next person bumping `jest` and a confusing afternoon — so this fails if the
 * note and the installed versions stop agreeing, **in either direction**. Skew
 * without the note is the state the issue describes; the note without the skew
 * is a warning about a hazard that no longer exists, which is how a rules file
 * starts being ignored.
 */

const ROOT = resolve(__dirname, '../..');
const RULE = join(ROOT, '.claude/rules/testing.md');

/**
 * The installed major of a package.
 *
 * Read from the installed tree rather than from `package.json`'s range,
 * because the range is what was asked for and this is about what arrived.
 *
 * @param name The package to look up
 * @returns Its major version
 */
function installedMajor(name: string): number {
  const manifest = join(ROOT, 'node_modules', name, 'package.json');
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    version: string;
  };
  const major = Number.parseInt(version.split('.')[0], 10);

  expect(Number.isFinite(major)).toBe(true);
  return major;
}

describe('the jest core and its jsdom environment', () => {
  const core = installedMajor('jest');
  const environment = installedMajor('jest-environment-jsdom');
  const rule = readFileSync(RULE, 'utf8');

  test('are both installed, so the comparison below means something', () => {
    expect(core).toBeGreaterThan(0);
    expect(environment).toBeGreaterThan(0);
  });

  test('have their skew written down while it exists', () => {
    // The note names both packages in one sentence; matching on that rather
    // than on a version keeps a routine bump from failing this for the wrong
    // reason.
    const documented = /`jest` and `jest-environment-jsdom` are a major apart/
      .test(rule);

    if (core === environment) {
      expect(documented).toBe(false);
    } else {
      expect(documented).toBe(true);
    }
  });

  test('point at the issue tracking the realignment', () => {
    if (core === environment) {
      return;
    }

    // Without the number the note is folklore: a reader has no way to find
    // what was weighed, or to see that realigning is a `ts-jest` question
    // rather than a version bump.
    expect(rule).toContain('#766');
  });
});
