import { describe, expect, test } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { declarableTypes, SCHEMA, typesInBackticks } from './schemaTypes';

/**
 * `docs/SCHEMA.md` lists every declarable `type`, and nothing kept it in step.
 *
 * The list is what a producer reads to find out which types exist, and it
 * names itself the derived copy: "`TraceType` in `src/type/grammar.ts` is the
 * source of truth". A type added to the enum and not to the list is therefore
 * undocumented rather than wrong, which is the quiet kind of drift — the
 * build passes, the tests pass, and a producer looking for the type they need
 * concludes MAIDR does not have it.
 *
 * Measured when this was written: `tree` and `pack` had been in the grammar
 * for one and zero releases respectively and neither was listed. The list had
 * gone stale twice in a day, which is what makes it worth a check rather than
 * a note.
 *
 * `candlestick_delta` is excluded by the document itself, and for a stated
 * reason: it "is built at runtime from a candlestick and a reference line, so
 * it is not something a page declares". That exclusion is asserted below
 * rather than assumed, so removing it from the prose without removing it here
 * fails instead of passing silently.
 */

/** The types the document says a page may declare. */
function declaredInDocs(): string[] {
  const line = SCHEMA.split('\n').find(l => l.includes('The declarable types are'));
  if (line === undefined) {
    throw new Error('docs/SCHEMA.md no longer names the declarable types');
  }
  const listed = line.slice(line.indexOf('The declarable types are'));
  return typesInBackticks(listed).filter(name => name !== 'candlestick_delta');
}

describe('docs/SCHEMA.md declarable types', () => {
  test('lists every trace type the grammar declares', () => {
    expect(declaredInDocs().sort()).toEqual(declarableTypes().sort());
  });

  test('lists them in alphabetical order, so a reader can find one', () => {
    const listed = declaredInDocs();

    expect(listed).toEqual([...listed].sort());
  });

  test('excludes the one type the document says is not declarable', () => {
    // Named in the prose as built at runtime. If that stops being true the
    // filter above hides a real gap, so the exclusion is pinned to the text.
    expect(SCHEMA).toContain('`candlestick_delta` appears there but is built at runtime');
    expect(declaredInDocs()).not.toContain(TraceType.CANDLESTICK_DELTA);
  });
});
