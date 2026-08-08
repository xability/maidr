import type { ListWindowItem, ListWindowParams } from '@util/listWindow';
import { describe, expect, test } from '@jest/globals';
import { computeListWindow } from '@util/listWindow';

/** Defaults matching the Go-To dialog's X-value dropdown. */
const BASE: ListWindowParams = {
  scrollTop: 0,
  itemHeight: 36,
  viewportHeight: 180,
  overscan: 5,
  totalCount: 6500,
  activeIndex: -1,
};

/**
 * Sum of rows represented by a render plan (options count as one row each).
 * @param items The render plan
 * @returns Total row count the plan stands in for
 */
function totalRows(items: ListWindowItem[]): number {
  return items.reduce((sum, item) => sum + (item.kind === 'spacer' ? item.rows : 1), 0);
}

/**
 * Option indices present in a render plan, in DOM order.
 * @param items The render plan
 * @returns The option indices
 */
function optionIndices(items: ListWindowItem[]): number[] {
  return items.filter(item => item.kind === 'option').map(item => (item as { index: number }).index);
}

describe('computeListWindow', () => {
  test('mounts only a small window of a large list', () => {
    const items = computeListWindow(BASE);
    const options = optionIndices(items);

    // capacity = ceil(180/36) + 2*5 = 15
    expect(options).toHaveLength(15);
    expect(options[0]).toBe(0);
    expect(totalRows(items)).toBe(BASE.totalCount);
  });

  test('rows always sum to totalCount across scroll positions and active indices', () => {
    // Sweep boundary-heavy combinations: window at the start, middle, end,
    // beyond the end (stale scrollTop), with the active row inside, above,
    // below, unset, and at both extremes of the list.
    const scrollTops = [0, 35, 36, 90 * 36, 6484 * 36, 6500 * 36, 10_000_000];
    const activeIndices = [-1, 0, 7, 90, 91, 3000, 6499];
    for (const scrollTop of scrollTops) {
      for (const activeIndex of activeIndices) {
        const items = computeListWindow({ ...BASE, scrollTop, activeIndex });
        const options = optionIndices(items);

        expect(totalRows(items)).toBe(BASE.totalCount);
        // Strictly increasing option indices — no duplicates, DOM order intact
        for (let i = 1; i < options.length; i++) {
          expect(options[i]).toBeGreaterThan(options[i - 1]);
        }
        // A valid active index is always mounted (aria-activedescendant contract)
        if (activeIndex >= 0) {
          expect(options).toContain(activeIndex);
        }
      }
    }
  });

  test('keeps the active option mounted as an island above the window', () => {
    // Scrolled deep into the list while row 2 is highlighted
    const items = computeListWindow({ ...BASE, scrollTop: 3000 * 36, activeIndex: 2 });
    const options = optionIndices(items);

    expect(options).toContain(2);
    // Island is separated from the contiguous window
    expect(options[0]).toBe(2);
    expect(options[1]).toBeGreaterThan(3);
    expect(totalRows(items)).toBe(BASE.totalCount);
  });

  test('keeps the active option mounted as an island below the window', () => {
    const items = computeListWindow({ ...BASE, scrollTop: 0, activeIndex: 6000 });
    const options = optionIndices(items);

    expect(options[options.length - 1]).toBe(6000);
    expect(totalRows(items)).toBe(BASE.totalCount);
  });

  test('does not duplicate the active option when it is inside the window', () => {
    const items = computeListWindow({ ...BASE, scrollTop: 0, activeIndex: 3 });
    const options = optionIndices(items);

    expect(options.filter(index => index === 3)).toHaveLength(1);
  });

  test('clamps the window at the end of the list', () => {
    const items = computeListWindow({ ...BASE, scrollTop: BASE.totalCount * 36 * 2 });
    const options = optionIndices(items);

    expect(options[options.length - 1]).toBe(BASE.totalCount - 1);
    expect(totalRows(items)).toBe(BASE.totalCount);
  });

  test('renders lists smaller than the window without spacers', () => {
    const items = computeListWindow({ ...BASE, totalCount: 4, activeIndex: 1 });

    expect(items).toEqual([
      { kind: 'option', index: 0 },
      { kind: 'option', index: 1 },
      { kind: 'option', index: 2 },
      { kind: 'option', index: 3 },
    ]);
  });

  test('returns an empty plan for an empty list', () => {
    expect(computeListWindow({ ...BASE, totalCount: 0 })).toEqual([]);
    expect(computeListWindow({ ...BASE, totalCount: 0, activeIndex: 0 })).toEqual([]);
  });
});
