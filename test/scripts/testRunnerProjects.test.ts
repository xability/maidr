import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import jestConfig from '../../jest.config';

/**
 * Keeps `scripts/test.js` in step with the projects in `jest.config.ts`.
 *
 * The runner spawns one Jest process per project, because two projects with
 * different module semantics cannot share one — `jest-resolve` memoises
 * "is this file ESM?" by path alone, so whichever asks first about a shared
 * `src/` module answers for both. The runner therefore has to name every
 * project: one left out is not a loud failure but a silent one, since its
 * suites simply never run and `npm test` still reports success.
 *
 * The list cannot be imported from the runner — `scripts/test.js` is ESM and
 * this project compiles to CommonJS, which is the same split the runner exists
 * to manage — so it is read out of the source. The config side is imported
 * properly, so a renamed `displayName` is caught rather than matched as text.
 */

const ROOT = resolve(__dirname, '../..');

/**
 * The `PROJECTS` list declared in the runner.
 *
 * The pattern reads across lines — `[^\]]` is a negated class rather than a
 * dot — so reformatting the array one name per line stays checked. What it
 * assumes is a literal: a computed list would stop matching, and the throw
 * below is what makes that say so rather than surfacing as a comparison
 * against an empty array.
 * @returns The project names the runner will run.
 */
function runnerProjects(): string[] {
  const source = readFileSync(join(ROOT, 'scripts/test.js'), 'utf8');
  const declaration = /const PROJECTS = \[([^\]]*)\]/.exec(source);
  if (!declaration) {
    throw new Error('scripts/test.js no longer declares a PROJECTS array');
  }

  return Array.from(declaration[1].matchAll(/'([^']+)'/g), match => match[1]);
}

/** The project the runner watches when the caller does not choose one. */
function watchDefault(): string {
  const source = readFileSync(join(ROOT, 'scripts/test.js'), 'utf8');
  const declaration = /const WATCH_DEFAULT = '([^']+)'/.exec(source);
  if (!declaration) {
    throw new Error('scripts/test.js no longer declares WATCH_DEFAULT');
  }

  return declaration[1];
}

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
    expect(runnerProjects()).toEqual(configuredProjects());
  });

  it('should watch a project that exists', () => {
    expect(runnerProjects()).toContain(watchDefault());
  });
});
