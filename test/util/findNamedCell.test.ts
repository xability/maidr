import { describe, expect, test } from '@jest/globals';
import { findNamedCell } from '@util/navigation';

function cells(...rows: string[][]): { name: string }[][] {
  return rows.map(row => row.map(name => ({ name })));
}

describe('finding a node by name for a layer switch', () => {
  test('stays on the cursor\'s own node when it carries the name', () => {
    const levels = cells(['A', 'B'], ['Other', 'Other']);

    expect(findNamedCell(levels, 'Other', 1, 1)).toEqual({ row: 1, col: 1 });
  });

  test('prefers the cursor\'s depth, then the first depth that has it', () => {
    const levels = cells(['X', 'Y'], ['Y', 'Z']);

    expect(findNamedCell(levels, 'Y', 1, 1)).toEqual({ row: 1, col: 0 });
    expect(findNamedCell(levels, 'Z', 0, 0)).toEqual({ row: 1, col: 1 });
  });

  test('matches a name with a note in parentheses to the bare name, either way', () => {
    const levels = cells(['Complex (Probe → Sense → Respond)', 'Clear (Sense → Categorise → Respond)']);

    expect(findNamedCell(levels, 'Clear', 0, 0)).toEqual({ row: 0, col: 1 });
    expect(findNamedCell(cells(['Complex', 'Clear']), 'Clear (Best Practices)', 0, 0))
      .toEqual({ row: 0, col: 1 });
  });

  test('an exact name wins over a noted one', () => {
    const levels = cells(['Sales (EU)', 'Sales']);

    expect(findNamedCell(levels, 'Sales', 0, 0)).toEqual({ row: 0, col: 1 });
  });

  test('two different notes are two different nodes', () => {
    expect(findNamedCell(cells(['Sales (EU)']), 'Sales (US)', 0, 0)).toBeNull();
  });

  test('skips the gaps a level may hold', () => {
    const levels = [[null, { name: 'A' }]];

    expect(findNamedCell(levels, 'A', 0, 0)).toEqual({ row: 0, col: 1 });
  });
});
