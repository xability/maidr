import { describe, expect, test } from '@jest/globals';
import { declarableTypes, SCHEMA, typesInBackticks } from './schemaTypes';

/**
 * `docs/SCHEMA.md` splits the declarable types into a stable set and an
 * experimental one, and the split is a promise to producers: the stable set
 * is what MAIDR was built around and has been exercised by real users, and
 * the experimental set is prototypes that may change in a patch release.
 *
 * A type that is in neither list inherits whichever promise the reader
 * assumes, which is the failure this guards. Thirty-seven types were added
 * in about two weeks; at that rate a new one reaching the enum and not the
 * split is the expected outcome, not an unlikely one.
 *
 * A type in *both* lists is the other direction of the same drift, and is
 * worse, because each list reads as complete on its own.
 *
 * `candlestick_delta` is excluded for the reason `schemaTraceTypes.test.ts`
 * already pins: it is built at runtime rather than declared, so it is not a
 * type a producer chooses and carries no stability promise either way.
 */

/**
 * The stable set as it stood at `84d9003`, the last commit before #814.
 *
 * Written out rather than spot-checked, so the whole classification is what
 * the suite verifies. A future contributor can otherwise misfile a type into
 * the wrong list and still leave both lists internally consistent -- the
 * partition check below would pass, and only this would notice.
 *
 * Re-derive with:
 *   git show 84d9003:src/type/grammar.ts | grep -oE "= '[a-z_0-9]+'"
 */
const STABLE_AT_84D9003 = [
  'bar',
  'box',
  'candlestick',
  'dodged_bar',
  'heat',
  'hist',
  'line',
  'pie',
  'point',
  'smooth',
  'stacked_bar',
  'stacked_normalized_bar',
  'step',
  'violin_box',
  'violin_kde',
];

/** The types named under one `###` heading of the stability section. */
function listedUnder(heading: string): string[] {
  const start = SCHEMA.indexOf(`### ${heading}\n`);
  if (start === -1) {
    throw new Error(`docs/SCHEMA.md no longer has a "${heading}" heading`);
  }
  const rest = SCHEMA.slice(start + heading.length + 5);
  const end = rest.indexOf('\n#');

  return typesInBackticks(end === -1 ? rest : rest.slice(0, end));
}

describe('docs/SCHEMA.md trace type stability', () => {
  test('classifies every declarable type as stable or experimental', () => {
    const classified = [...listedUnder('Stable'), ...listedUnder('Experimental')];

    expect(classified.sort()).toEqual(declarableTypes().sort());
  });

  test('puts no type in both sets', () => {
    const stable = new Set(listedUnder('Stable'));
    const both = listedUnder('Experimental').filter(type => stable.has(type));

    expect(both).toEqual([]);
  });

  test('keeps each list alphabetical, so a reader can find a type', () => {
    for (const heading of ['Stable', 'Experimental']) {
      const listed = listedUnder(heading);

      expect(listed).toEqual([...listed].sort());
    }
  });

  test('says what the experimental set does not promise', () => {
    // The lists alone would read as a changelog. What makes the section
    // usable is the claim attached to it, so the claim is pinned too --
    // softening the wording without revisiting the split fails here.
    // Normalised, because these phrases are wrapped across lines in the
    // source and a reflow should not be what breaks this test.
    const prose = SCHEMA.split(/\s+/).join(' ');

    expect(prose).toContain('**These are prototypes. Treat them as prototypes.**');
    expect(prose).toContain('has been through a user study');
    expect(prose).toContain('without a deprecation period');
  });

  test('the stable set is exactly the one that predates the roadmap', () => {
    // The whole set, not a sample: the partition check above is satisfied by
    // any split that covers the enum, including a wrong one.
    expect(listedUnder('Stable').sort()).toEqual([...STABLE_AT_84D9003].sort());
  });

  test('everything else is experimental', () => {
    const expected = declarableTypes()
      .filter(type => !STABLE_AT_84D9003.includes(type));

    expect(listedUnder('Experimental').sort()).toEqual(expected.sort());
  });
});
