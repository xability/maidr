import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';

/** The input schema, where every addition lands between existing members. */
const GRAMMAR = join(__dirname, '..', '..', 'src', 'type', 'grammar.ts');

/**
 * Two JSDoc blocks in a row, with only whitespace between them.
 *
 * Only the closer block attaches to a declaration, so the outer one documents
 * nothing: it does not render on hover, it does not reach the generated docs,
 * and it reads to anyone skimming the file as describing whatever follows it.
 */
const STACKED_BLOCKS = /\*\/[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*\/\*\*/g;

/**
 * `grammar.ts` is where new trace types and point shapes go, and it is one
 * long file of documented members. Inserting near a landmark without checking
 * what the landmark is attached to strands the block that was already there.
 *
 * Four occurrences were caught in review -- `WATERFALL`, `StepPoint`,
 * `DIVERGING` and `SURVIVAL` -- and writing this check found two more that
 * nobody had noticed, stranding the docs for `Maidr`, `DumbbellPoint`,
 * `GAUGE`, `GANTT` and `MOSAIC`. Each time the *new* member reads correctly,
 * which is exactly why it survives a re-read, and nothing else catches it:
 * the file compiles, the tests pass, and the damage is to documentation that
 * only shows up where nobody is looking.
 */
describe('no doc comment is orphaned in the grammar', () => {
  const source = readFileSync(GRAMMAR, 'utf8');

  test('the grammar is where it is expected to be', () => {
    // A path that stopped resolving would make the case below vacuous.
    expect(source).toContain('export enum TraceType');
  });

  test('no JSDoc block is immediately followed by another', () => {
    const lineOf = (index: number): number =>
      source.slice(0, index).split('\n').length;
    const stranded = [...source.matchAll(STACKED_BLOCKS)]
      .map(match => `grammar.ts:${lineOf(match.index ?? 0)}`);

    expect(stranded).toEqual([]);
  });
});
