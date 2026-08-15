import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';

/** The declaration union, whose `type` values are what authors type. */
const DECLARATION = join(__dirname, '..', '..', 'src', 'type', 'declaration.ts');

/** `  type: TraceType.SURVIVAL;` — one per variant of the union. */
const DISCRIMINANT = /^\s*type:\s*TraceType\.(\w+);$/gm;

/**
 * The word an author writes is the word MAIDR emits.
 *
 * A declaration's `type` is the `TraceType` **string value**, not a private
 * alias, so renaming one of those values is a breaking change to every chart
 * config in the wild that declares it — and the compiler cannot see it,
 * because the config is JSON or plain JS. Two of the values do not read like
 * their member names and are the ones an author is most likely to get wrong,
 * so they are pinned here by hand.
 */
describe('the declaration union is keyed on TraceType string values', () => {
  const source = readFileSync(DECLARATION, 'utf8');
  const members = [...source.matchAll(DISCRIMINANT)].map(match => match[1]);

  test('every variant discriminates on a TraceType member', () => {
    expect(members.length).toBeGreaterThan(0);
    const unknown = members.filter(member => !(member in TraceType));
    expect(unknown).toEqual([]);
  });

  test('the union covers the fourteen declarable types, each exactly once', () => {
    expect(members).toHaveLength(14);
    expect(new Set(members).size).toBe(14);
  });

  test('the two spellings that surprise authors are the ones that ship', () => {
    // `type: 'scatter'` and `type: 'parallel'` are rejected as unknown types.
    expect(members).toContain('SCATTER');
    expect(TraceType.SCATTER).toBe('point');
    expect(members).toContain('PARALLEL');
    expect(TraceType.PARALLEL).toBe('parallel_coordinates');
  });

  test('an orientation is written the grammar\'s way, not the word\'s', () => {
    // A plain-JS author has no enum, no autocomplete and no type error, and
    // will write `orientation: 'horizontal'`. It is warned about and dropped,
    // and both values are named on the two fields that carry them, so the
    // abbreviations are documented where they are written.
    expect(Orientation.HORIZONTAL).toBe('horz');
    expect(Orientation.VERTICAL).toBe('vert');
    expect(source).toContain('`\'horz\'` and `\'vert\'`');
  });
});
