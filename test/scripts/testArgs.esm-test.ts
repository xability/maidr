import { describe, expect, it } from '@jest/globals';
import { hasPathFilter, isNarrowed, takeSelection } from '../../scripts/testArgs';

/**
 * Tests for `scripts/testArgs.js`, the decisions `scripts/test.js` makes about
 * its own arguments.
 *
 * The runner spawns one Jest process per project, which is what makes these
 * decisions load-bearing rather than cosmetic. Two have already been wrong:
 * `--selectProjects unit esm` reached a single process and undid the split, and
 * a filter naming a file in one project made the other project's run fail on
 * finding nothing. Both were caught in review rather than by a test, which is
 * why this file exists.
 *
 * It runs in the `esm` project because the module under test is ESM — the repo
 * is `"type": "module"` — and the CommonJS project cannot require it. That is
 * the same split the runner exists to manage, arrived at from the other side.
 * The alternative, a `node --input-type=module` subprocess per call as
 * `mathStylesheet.test.ts` uses, gives up the type checking that
 * `scripts/testArgs.d.ts` provides here.
 */

describe('taking the project selection out of the arguments', () => {
  it('should leave an argument list that names no project alone', () => {
    expect(takeSelection(['--coverage', 'test/util'])).toEqual({
      rest: ['--coverage', 'test/util'],
      selected: [],
    });
  });

  it('should collect every value of the variadic form', () => {
    // The form that undid the split: Jest accepts both names on one flag, and
    // passing it through unchanged put two module systems in one process.
    expect(takeSelection(['--selectProjects', 'unit', 'esm'])).toEqual({
      rest: [],
      selected: ['unit', 'esm'],
    });
  });

  it('should stop collecting at the next flag', () => {
    expect(takeSelection(['--selectProjects', 'unit', '--coverage', 'test/util'])).toEqual({
      rest: ['--coverage', 'test/util'],
      selected: ['unit'],
    });
  });

  it('should collect the equals form, including when it is repeated', () => {
    expect(takeSelection(['--selectProjects=unit', '--selectProjects=esm'])).toEqual({
      rest: [],
      selected: ['unit', 'esm'],
    });
  });

  it('should leave a comma-separated value as the one name it is', () => {
    // Not a form Jest accepts either, so it is left to fail as the unknown
    // project it names rather than being quietly reinterpreted here.
    expect(takeSelection(['--selectProjects=unit,esm'])).toEqual({
      rest: [],
      selected: ['unit,esm'],
    });
  });
});

describe('deciding whether a run could narrow the test files', () => {
  it('should say no when every argument is a flag', () => {
    expect(hasPathFilter(['--coverage', '--ci'])).toBe(false);
  });

  it('should say yes for a path', () => {
    expect(hasPathFilter(['--coverage', 'test/util/version.test.ts'])).toBe(true);
  });

  it('should say yes for a flag value it cannot tell from a path', () => {
    // Wrong, and deliberately harmless: the check below then finds the set was
    // not narrowed and the run stays strict. The opposite mistake cannot
    // happen, because a path never begins with a dash.
    expect(hasPathFilter(['--maxWorkers', '2'])).toBe(true);
  });

  it('should say yes for a name filter, whose value also looks like a path', () => {
    // Worth pinning rather than leaving to the comment: a name filter does
    // reach the check, and is answered there rather than being routed past it.
    // `--listTests` lists files and `-t` selects tests within them, so nothing
    // is narrowed and the run stays strict — which is right, since Jest reports
    // a name matching nothing as skipped tests, not as none found.
    expect(hasPathFilter(['-t', 'some name'])).toBe(true);
  });
});

describe('deciding whether a project may match no tests', () => {
  it('should tolerate it when the filter matched a subset', () => {
    expect(isNarrowed(['a.test.ts'], ['a.test.ts', 'b.esm-test.ts'])).toBe(true);
  });

  it('should refuse when the filter matched nothing at all', () => {
    // A typo. Every project would pass, having run nothing.
    expect(isNarrowed([], ['a.test.ts'])).toBe(false);
  });

  it('should refuse when nothing was narrowed', () => {
    // `--coverage` is an argument and not a filter, so a project matching
    // nothing here means a broken `testMatch` — its suites would silently never
    // run while the command reported success.
    expect(isNarrowed(['a.test.ts'], ['a.test.ts'])).toBe(false);
  });

  it('should refuse when jest could not be asked', () => {
    expect(isNarrowed(null, ['a.test.ts'])).toBe(false);
    expect(isNarrowed(['a.test.ts'], null)).toBe(false);
  });
});
