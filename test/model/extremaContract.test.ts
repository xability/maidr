import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';

/** Where the trace implementations live. */
const MODEL_DIR = join(__dirname, '..', '..', 'src', 'model');

/**
 * `supportsExtrema` and `getExtremaTargets` have to agree, and nothing in the
 * type system says so.
 *
 * `AbstractTrace.getExtremaTargets` defaults to `[]` and
 * `AbstractTrace.navigateToExtrema` *throws*, while `GoToExtremaToggleCommand`
 * gates only on the flag. A trace that turns the flag on without supplying
 * targets therefore sends the reader into the `GO_TO_EXTREMA` scope, where
 * the dialog renders nothing -- it is gated on a non-empty target list -- and
 * the arrow keys answer to a keymap that is no longer the trace's. That is a
 * keyboard trap, and its only exit is a binding the help menu does not list.
 *
 * It reached review once, on the treemap, and it is invisible in every other
 * kind of test: nothing crashes, nothing is announced, and the trace's own
 * navigation tests all pass because they never enter the scope.
 *
 * This reads the sources rather than constructing traces because the flag is
 * a protected instance field: reaching it means building one of every trace,
 * which means a valid fixture for each, which is the thing that would rot.
 */
describe('a trace offering extrema navigation implements it', () => {
  const sources = readdirSync(MODEL_DIR)
    .filter(name => name.endsWith('.ts'))
    .map(name => ({ name, body: readFileSync(join(MODEL_DIR, name), 'utf8') }));

  test('there are trace sources to check', () => {
    // A path that stopped resolving would make every case below vacuous.
    expect(sources.length).toBeGreaterThan(20);
  });

  /**
   * A declaration of the method, rather than a mention of its name.
   *
   * The looser check -- does the file contain the string at all -- passes on
   * a file whose only occurrence is the comment explaining why the flag is
   * off, which is exactly the file this test exists to watch.
   */
  const DECLARES_TARGETS = /(?:public|override|protected)[^\n]+getExtremaTargets\s*\(/;

  test('every trace claiming extrema support supplies targets', () => {
    const claiming = sources.filter(source =>
      /supportsExtrema\s*=\s*true/.test(source.body));
    const withoutTargets = claiming
      .filter(source => !DECLARES_TARGETS.test(source.body))
      .map(source => source.name);

    expect(claiming.length).toBeGreaterThan(0);
    expect(withoutTargets).toEqual([]);
  });

  test('the check reads declarations rather than mentions', () => {
    // The treemap's flag is off and its comment names the method, so it is
    // the case that separates the two readings.
    const treemap = sources.find(source => source.name === 'treemap.ts');

    expect(treemap?.body).toContain('getExtremaTargets');
    expect(DECLARES_TARGETS.test(treemap?.body ?? '')).toBe(false);
  });
});
