import { describe, expect, it } from '@jest/globals';
import {
  hasPathFilter,
  isNarrowed,
  PROJECTS,
  SELECT,
  takeSelection,
  WATCH_DEFAULT,
} from '../../scripts/testArgs';

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

/** What `scripts/testArgs.d.ts` promises `takeSelection` returns. */
interface Selection {
  rest: string[];
  selected: string[];
  dangling: boolean;
}

describe('the declarations beside the module', () => {
  it('should describe what the module actually returns', () => {
    // `testArgs.d.ts` is hand-written and `tsc` never sees the JavaScript, so
    // nothing catches the two disagreeing: changing `dangling` to `string` in
    // the declarations type-checks the whole repo clean. The annotations below
    // are that check — a declared type that no longer fits stops compiling
    // here — and the runtime assertions are the other half, since annotations
    // alone would be satisfied by declarations that are wrong in the same way
    // the expectation is.
    const selection: Selection = takeSelection([`${SELECT}=unit`]);
    const narrowing: [boolean, boolean] = [hasPathFilter([]), isNarrowed([], [])];
    const names: [string[], string, string] = [PROJECTS, WATCH_DEFAULT, SELECT];

    expect(typeof selection.dangling).toBe('boolean');
    expect(Array.isArray(selection.rest)).toBe(true);
    expect(Array.isArray(selection.selected)).toBe(true);
    expect(narrowing.every(value => typeof value === 'boolean')).toBe(true);
    expect(Array.isArray(names[0]) && names[0].every(name => typeof name === 'string')).toBe(true);
    expect(typeof names[1]).toBe('string');
    expect(names[2]).toBe('--selectProjects');
  });
});

describe('taking the project selection out of the arguments', () => {
  it('should leave an argument list that names no project alone', () => {
    expect(takeSelection(['--coverage', 'test/util'])).toEqual({
      rest: ['--coverage', 'test/util'],
      selected: [],
      dangling: false,
    });
  });

  it('should collect every value of the variadic form', () => {
    // The form that undid the split: Jest accepts both names on one flag, and
    // passing it through unchanged put two module systems in one process.
    expect(takeSelection(['--selectProjects', 'unit', 'esm'])).toEqual({
      rest: [],
      selected: ['unit', 'esm'],
      dangling: false,
    });
  });

  it('should stop collecting at the next flag', () => {
    expect(takeSelection(['--selectProjects', 'unit', '--coverage', 'test/util'])).toEqual({
      rest: ['--coverage', 'test/util'],
      selected: ['unit'],
      dangling: false,
    });
  });

  it('should swallow a path written after it, as jest does', () => {
    // Deliberate, and matching Jest rather than improving on it. Given
    // `--selectProjects unit test/util/version.test.ts`, Jest's own variadic
    // parse takes the path as a second project name and the filter has no
    // effect — `jest --listTests` with those arguments lists the whole `unit`
    // project. Stopping at the first positional here would make the runner do
    // something Jest does not, which is a worse surprise than the ambiguity.
    // The `=` form is the way out for anyone who meant a filter.
    expect(takeSelection(['--selectProjects', 'unit', 'test/util/version.test.ts'])).toEqual({
      rest: [],
      selected: ['unit', 'test/util/version.test.ts'],
      dangling: false,
    });

    expect(takeSelection(['--selectProjects=unit', 'test/util/version.test.ts'])).toEqual({
      rest: ['test/util/version.test.ts'],
      selected: ['unit'],
      dangling: false,
    });
  });

  it('should collect the equals form, including when it is repeated', () => {
    expect(takeSelection(['--selectProjects=unit', '--selectProjects=esm'])).toEqual({
      rest: [],
      selected: ['unit', 'esm'],
      dangling: false,
    });
  });

  it('should leave a comma-separated value as the one name it is', () => {
    // Not a form Jest accepts either, so it is left to fail as the unknown
    // project it names rather than being quietly reinterpreted here.
    expect(takeSelection(['--selectProjects=unit,esm'])).toEqual({
      rest: [],
      selected: ['unit,esm'],
      dangling: false,
    });
  });

  it('should report the flag naming no project rather than reading it as all', () => {
    // Jest rejects a bare `--selectProjects`. Without this the runner would
    // read "named nothing" as "named everything" and run both projects, which
    // is the opposite of what was asked for. Putting the bare flag back into
    // `rest` does not work either: Jest absorbs it once the per-project flag is
    // added alongside, so the run has to go over untouched.
    expect(takeSelection(['--coverage', '--selectProjects'])).toEqual({
      rest: ['--coverage'],
      selected: [],
      dangling: true,
    });
  });

  it('should report a dangling flag that another occurrence still names past', () => {
    // Both true at once, and the runner has to read `selected` rather than
    // `dangling` alone. Jest does not error on this — it runs both projects in
    // one process, which is the clash the runner exists to prevent, and handing
    // the arguments over untouched put it straight back:
    // `Must use import to load ES Module: src/type/grammar.ts`.
    expect(takeSelection(['--selectProjects', '--selectProjects', 'unit', 'esm'])).toEqual({
      rest: [],
      selected: ['unit', 'esm'],
      dangling: true,
    });
  });

  it('should treat an empty equals form the same way', () => {
    // Jest gives `--selectProjects=` the same error as the bare flag, so it
    // takes the same route out. Passing the empty name through instead reached
    // Jest as a project that does not exist, which it reports as
    // `0 files checked across 0 projects` — true, and no help at all.
    expect(takeSelection(['--selectProjects='])).toEqual({
      rest: [],
      selected: [],
      dangling: true,
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
