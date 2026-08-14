import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { TraceType } from '@type/grammar';

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

  test('the union covers the thirteen declarable types, each exactly once', () => {
    expect(members).toHaveLength(13);
    expect(new Set(members).size).toBe(13);
  });

  test('the two spellings that surprise authors are the ones that ship', () => {
    // `type: 'scatter'` and `type: 'parallel'` are rejected as unknown types.
    expect(members).toContain('SCATTER');
    expect(TraceType.SCATTER).toBe('point');
    expect(members).toContain('PARALLEL');
    expect(TraceType.PARALLEL).toBe('parallel_coordinates');
  });
});
