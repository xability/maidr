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

/** The runner's source. */
function runnerSource(): string {
  return readFileSync(join(ROOT, 'scripts/test.js'), 'utf8');
}

/**
 * The `PROJECTS` list declared in a copy of the runner's source.
 *
 * The pattern reads across lines — `[^\]]` is a negated class rather than a
 * dot — so reformatting the array one name per line stays checked. What it
 * assumes is a bracketed literal: a list built by a call has no brackets, and
 * the throw is what makes that say so rather than surfacing as a comparison
 * against an empty array. A spread keeps its brackets and so is read rather
 * than refused, returning only the names it spells out — which the comparison
 * catches, being short by whatever the spread contributed.
 *
 * Taking the source as an argument is what lets those branches be tested,
 * since they are the one place a regression here could be silent.
 * @param source - The runner's source text.
 * @returns The project names the runner will run.
 * @throws If the declaration is no longer a literal array this can read.
 */
export function parseProjects(source: string): string[] {
  const declaration = /const PROJECTS = \[([^\]]*)\]/.exec(source);
  if (!declaration) {
    throw new Error('scripts/test.js no longer declares a PROJECTS array');
  }

  return Array.from(declaration[1].matchAll(/'([^']+)'/g), match => match[1]);
}

/**
 * The project the runner watches when the caller does not choose one.
 * @param source - The runner's source text.
 * @returns The project name.
 * @throws If the declaration is no longer a string literal this can read.
 */
export function parseWatchDefault(source: string): string {
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
    expect(parseProjects(runnerSource())).toEqual(configuredProjects());
  });

  it('should watch a project that exists', () => {
    expect(parseProjects(runnerSource())).toContain(parseWatchDefault(runnerSource()));
  });
});

describe('reading those declarations out of the source', () => {
  it('should read an array written one name per line', () => {
    // `[^\]]` is a negated class and not a dot, so the pattern already spans
    // lines. Pinned because it reads like it would not.
    expect(parseProjects('const PROJECTS = [\n  \'unit\',\n  \'esm\',\n];')).toEqual(['unit', 'esm']);
  });

  it('should refuse a list it cannot read rather than reporting an empty one', () => {
    // The branch that matters most and the one nothing exercised: a list built
    // by a call has no brackets to match, and without the throw both checks
    // above would compare against `[]` and pass vacuously — the silent success
    // this whole file exists to prevent, reappearing inside the guard itself.
    expect(() => parseProjects('const PROJECTS = projectNames();')).toThrow(
      'no longer declares a PROJECTS array',
    );
  });

  it('should read a spread array as the names it spells out', () => {
    // A spread still has brackets, so this reads rather than throws, and reads
    // only the literals. Caught all the same, one line up: the comparison
    // against the config's `displayName`s is short by whatever the spread
    // contributed. Pinned because "computed lists throw" is the tidier claim
    // and the wrong one — I wrote this case asserting it and it failed.
    expect(parseProjects('const PROJECTS = [...BASE, \'esm\'];')).toEqual(['esm']);
  });

  it('should refuse a watch default it cannot read', () => {
    expect(() => parseWatchDefault('const WATCH_DEFAULT = PROJECTS[0];')).toThrow(
      'no longer declares WATCH_DEFAULT',
    );
  });
});
