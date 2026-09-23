import { describe, expect, test } from '@jest/globals';
import { declarableTypes, SCHEMA, typesInBackticks } from './schemaTypes';

/**
 * `docs/SCHEMA.md`'s "Selectors" section is the contract every producer
 * matches its rendering against: which `selectors` shape each layer type
 * reads, and what it means. Nothing in the type system says it -- `selectors`
 * is one union for every type -- so the table is the only statement of it.
 *
 * The 4.x changes that cost r-maidr's and py-maidr's charts their highlight
 * (#750, #991, #1135) each changed what a layer type read from `selectors`,
 * and nothing written down said what it had read before. A type missing
 * from the table leaves the next such change with no contract to be checked
 * against, which is the drift this guards.
 */

/** The first-column cells of the "By layer type" table. */
function typesInSelectorTable(): string[][] {
  const start = SCHEMA.indexOf('### By layer type\n');
  if (start === -1) {
    throw new Error('docs/SCHEMA.md no longer has a "By layer type" selectors table');
  }
  const rest = SCHEMA.slice(start);
  const end = rest.indexOf('\n#', 1);
  const section = end === -1 ? rest : rest.slice(0, end);

  return section
    .split('\n')
    .filter(line => line.startsWith('| `'))
    .map(line => typesInBackticks(line.split('|')[1] ?? ''));
}

describe('docs/SCHEMA.md selectors contract', () => {
  test('says what every declarable type reads from selectors', () => {
    const listed = typesInSelectorTable().flat();

    expect([...listed].sort()).toEqual(declarableTypes().sort());
  });

  test('puts each type in one row, so the table cannot contradict itself', () => {
    const listed = typesInSelectorTable().flat();
    const repeated = listed.filter((type, i) => listed.indexOf(type) !== i);

    expect(repeated).toEqual([]);
  });

  test('is where the console warning sends a producer', () => {
    // util/selectors.ts names SCHEMA.html#selectors in every warning.
    expect(SCHEMA).toMatch(/^## Selectors$/m);
  });
});
