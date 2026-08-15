import type { NavigateCallback } from '@type/grammar';
import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import { isPointCloudHighlightable } from '@type/navigation';

/**
 * Build the observer that turns a trace's state updates into navigate events.
 *
 * This is the only path a canvas chart has to a highlight. An SVG adapter
 * highlights through `selectors` and never registers a `NavigateCallback` at
 * all, so nothing here can reach one; a canvas adapter has no elements to
 * select and draws an overlay from what this reports instead.
 *
 * Two kinds of trace report differently:
 *
 * - A **point cloud** — a scatter, volcano or Manhattan — selects a *set of
 *   points*, and its braille surface is a binned grid that names none of them.
 *   The position it could carry would address a cell of that grid, so an
 *   overlay reading it as a point index would outline whichever mark happened
 *   to sit at that ordinal. The identity of the points is sent instead, as
 *   indices into the layer's `data` array. The `-1` position is deliberate: a
 *   consumer that has not learned about `pointIndices` bounds-checks the pair
 *   and clears, rather than outlining the wrong mark.
 * - **Everything else** reports the braille position, which for those traces
 *   does name the mark, and stays silent while braille is empty.
 *
 * Extracted from `Controller` so the contract is testable: constructing a
 * `Controller` needs a live DOM, a Redux store and every service, and a test
 * that re-implemented this instead would keep passing while the shipped
 * wiring drifted.
 *
 * @param trace - The trace being observed, feature-tested once here rather
 *   than on every keystroke: whether it can name its points is fixed at
 *   construction.
 * @param callback - The adapter's navigate callback.
 * @returns An observer to register on that trace.
 */
export function createNavigateObserver(
  trace: unknown,
  callback: NavigateCallback,
): Observer<TraceState> {
  const cloud = isPointCloudHighlightable(trace) ? trace : null;
  return {
    update: (state: TraceState): void => {
      if (state.empty) {
        return;
      }
      if (cloud) {
        callback({
          layerId: state.layerId,
          row: -1,
          col: -1,
          pointIndices: cloud.highlightedPointIndices,
        });
      } else if (!state.braille.empty) {
        callback({
          layerId: state.layerId,
          row: state.braille.row,
          col: state.braille.col,
        });
      }
    },
  };
}
