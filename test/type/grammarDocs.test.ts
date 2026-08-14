import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';

/**
 * The input types, where every addition lands between existing members: the
 * schema itself, and the co-located declaration block that feeds it.
 *
 * Each entry carries a landmark string that must still be found, so a path
 * that stopped resolving cannot make the case below vacuous.
 */
const INPUT_TYPES = [
  { file: 'grammar.ts', landmark: 'export enum TraceType' },
  { file: 'declaration.ts', landmark: 'export type MaidrTraceDeclaration' },
] as const;

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
describe.each(INPUT_TYPES)('no doc comment is orphaned in $file', ({ file, landmark }) => {
  const source = readFileSync(join(__dirname, '..', '..', 'src', 'type', file), 'utf8');

  test('the file is where it is expected to be', () => {
    expect(source).toContain(landmark);
  });

  test('no JSDoc block is immediately followed by another', () => {
    const lineOf = (index: number): number =>
      source.slice(0, index).split('\n').length;
    const stranded = [...source.matchAll(STACKED_BLOCKS)]
      .map(match => `${file}:${lineOf(match.index ?? 0)}`);

    expect(stranded).toEqual([]);
  });
});
