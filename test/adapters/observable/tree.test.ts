/**
 * A node-link diagram, which is the case the span readings refuse (#1106).
 *
 * `Plot.tree` is the first one to reach these tests. It draws three kinds of
 * mark at once — `link` for the edges, `dot` for the nodes, `text` for their
 * names — so it exercises two things the adapter already decided and one it
 * has not.
 *
 * The edges are what #1094 and #1100 wrote their whole-mark span test for: a
 * link whose two ends share a coordinate is an interval in a lane, and one
 * whose ends share nothing is an edge with no lane to sit in. A tree's links
 * are the second kind, four of them, and this is the first chart in the suite
 * where that is true.
 *
 * What the chart also shows is a defect, pinned below rather than fixed here.
 * Its dots read as an ordinary scatter, so the chart binds and navigates —
 * and what it announces is d3's tree *layout* coordinates, depth against
 * sibling offset, on scales the chart draws with `axis: null` precisely
 * because they mean nothing to a reader. Every node's path is sitting in the
 * `<title>` of the circle being announced, and in a `text` mark beside it,
 * and both are dropped. Deciding what to do about that needs a hierarchy
 * reading or a rule for declining a mark whose axes are suppressed, which is
 * #1106; the pin turns red the day either lands.
 */

import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layersOf(key: Parameters<typeof mountFixture>[0]): { type: TraceType }[] {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element)?.subplots[0][0].layers ?? [];
}

describe('a tree\'s edges', () => {
  it('are not claimed as a gantt', () => {
    // Four curves running `M0,266C…,319.5,133` — both ends differ on both
    // axes, so no coordinate is shared and there is no lane. Read as spans
    // they would announce a schedule whose tasks are tree depths.
    expect(layersOf('hierarchyTree').some(layer => layer.type === TraceType.GANTT))
      .toBe(false);
  });
});

describe('a tree\'s nodes', () => {
  it.failing('are not announced as layout coordinates (#1106)', () => {
    // The dots are read as a scatter of `x = depth`, `y = sibling offset`.
    // Those are d3's layout output, not anything plotted, and the node names
    // are in the `<title>` of each circle and in a `text` mark beside them.
    // Announcing the coordinates and dropping the names describes a chart the
    // reader does not have.
    expect(layersOf('hierarchyTree').some(layer => layer.type === TraceType.SCATTER))
      .toBe(false);
  });
});
