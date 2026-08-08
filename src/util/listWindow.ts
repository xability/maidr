/**
 * Pure math for windowed (virtualized) rendering of a fixed-row-height list.
 *
 * Extracted from the Go-To dialog's X-value dropdown so the spacer/island
 * arithmetic is unit-testable without a DOM: only rows near the scroll
 * position are mounted, spacer rows preserve the scrollbar geometry, and the
 * active (aria-activedescendant) row is always part of the plan — rendered as
 * an "island" between re-split spacers when scrolling moves the window away
 * from it.
 */

/** One entry of the render plan, in DOM order. */
export type ListWindowItem
  = | { kind: 'spacer'; rows: number }
    | { kind: 'option'; index: number };

export interface ListWindowParams {
  /** Current scroll offset of the list viewport, in px. */
  scrollTop: number;
  /** Fixed height of every row, in px. */
  itemHeight: number;
  /** Height of the list viewport, in px. */
  viewportHeight: number;
  /** Extra rows rendered above and below the visible range. */
  overscan: number;
  /** Total number of options in the list. */
  totalCount: number;
  /** Index of the active (highlighted) option, or -1 for none. */
  activeIndex: number;
}

/**
 * Computes the render plan for a windowed list.
 *
 * Invariants (relied on by the Go-To dialog's accessibility contract):
 * - Option rows plus spacer rows always sum to exactly `totalCount`, so the
 *   scrollbar geometry matches a fully-rendered list.
 * - A valid `activeIndex` is always present as an option row, wherever the
 *   window is — aria-activedescendant must reference a mounted element.
 * - Option indices are strictly increasing with no duplicates.
 * @param params - The window parameters
 * @returns Spacer and option entries to render, in DOM order
 */
export function computeListWindow(params: ListWindowParams): ListWindowItem[] {
  const { scrollTop, itemHeight, viewportHeight, overscan, totalCount, activeIndex } = params;

  if (totalCount <= 0) {
    return [];
  }

  const capacity = Math.ceil(viewportHeight / itemHeight) + 2 * overscan;
  const first = Math.max(0, Math.min(
    Math.floor(scrollTop / itemHeight) - overscan,
    totalCount - capacity,
  ));
  const last = Math.min(totalCount - 1, first + capacity - 1);

  const items: ListWindowItem[] = [];
  const pushSpacer = (rows: number): void => {
    if (rows > 0) {
      items.push({ kind: 'spacer', rows });
    }
  };

  const activeAbove = activeIndex >= 0 && activeIndex < first;
  const activeBelow = activeIndex > last && activeIndex < totalCount;

  if (activeAbove) {
    pushSpacer(activeIndex);
    items.push({ kind: 'option', index: activeIndex });
    pushSpacer(first - activeIndex - 1);
  } else {
    pushSpacer(first);
  }

  for (let index = first; index <= last; index++) {
    items.push({ kind: 'option', index });
  }

  if (activeBelow) {
    pushSpacer(activeIndex - last - 1);
    items.push({ kind: 'option', index: activeIndex });
    pushSpacer(totalCount - 1 - activeIndex);
  } else {
    pushSpacer(totalCount - 1 - last);
  }

  return items;
}
