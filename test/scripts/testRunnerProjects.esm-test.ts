import { describe, expect, it } from '@jest/globals';
import jestConfig from '../../jest.config';
import { PROJECTS, WATCH_DEFAULT } from '../../scripts/testArgs';

/**
 * Keeps the runner's project list in step with `jest.config.ts`.
 *
 * `scripts/test.js` spawns one Jest process per project, because two projects
 * with different module semantics cannot share one — `jest-resolve` memoises
 * "is this file ESM?" by path alone, so whichever asks first about a shared
 * `src/` module answers for both. The runner therefore has to name every
 * project, and one left out is not a loud failure but a silent one: its suites
 * never run and `npm test` still reports success.
 *
 * The two lists cannot be one list. Jest loads `jest.config.ts` as CommonJS and
 * `scripts/testArgs.js` is ESM, so the config cannot import the constant —
 * which is the same split the runner exists to manage. So they are compared
 * instead.
 *
 * Both sides are imported rather than parsed. An earlier version read the names
 * back out of the runner's source with a regex, because the runner spawns Jest
 * on load and could not be imported; that needed its own cases for arrays
 * written across lines, for spreads, and for lists built by a call. Moving the
 * constants into the side-effect-free module deleted all of it, and a renamed
 * `displayName` or a retyped constant now fails to compile rather than failing
 * to match.
 */

/** Every project's display name, in the order the config declares them. */
function configuredProjects(): string[] {
  const projects = jestConfig.projects ?? [];

  return projects.map((project) => {
    const name = typeof project === 'object' ? project.displayName : undefined;
    if (typeof name !== 'string') {
      throw new TypeError('every jest project needs a string displayName');
    }
    return name;
  });
}

describe('the test runner\'s project list', () => {
  it('should name every project the jest config declares', () => {
    expect(PROJECTS).toEqual(configuredProjects());
  });

  it('should watch a project that exists', () => {
    expect(PROJECTS).toContain(WATCH_DEFAULT);
  });
});
