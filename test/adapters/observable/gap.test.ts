/**
 * A line broken by a gap is drawn in pieces, and the pieces are not the data
 * (#1079).
 *
 * Plot ends a line at a missing value and starts a new subpath after it, so
 * one `d` holds several. The reading pairs vertex `k` with sample `k`, and the
 * only thing standing between that and a wrong announcement is a count: how
 * many vertices there are, against how many datum indices Plot bound to the
 * element. A break moves both numbers at once, so the count cannot see it —
 * and on some curves the two land back on each other and the mark is read.
 *
 * The vertices are then a subpath's opening move, a corner, and whichever
 * samples happen to fall in between, announced as consecutive data. The gap
 * itself is gone. What the drawing actually says is in the `M` commands, and
 * a mark drawn in more than one piece is refused rather than guessed at.
 */

import type { LinePoint, ScatterPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layersOf(key: Parameters<typeof mountFixture>[0]): { type: TraceType; data: unknown }[] {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element)?.subplots[0][0].layers ?? [];
}

describe('a series Plot broke at a gap', () => {
  it('turns away a step line whose pieces add up to its sample count', () => {
    // 1, null, 3, 2 on `curve: 'step-after'`. Two subpaths, four vertices,
    // four samples — so the count agrees and the mark used to be read as
    // `(0,1) (2,3) (3,3) (3,2)`: the riser's corner at t=3 announced as a
    // fourth sample, and the missing value never mentioned.
    expect(layersOf('gappyStepLine')).toHaveLength(0);
  });

  it('turns away an area broken on the axis that cannot be filled', () => {
    // An area fills a null `y` down to the baseline and stays in one piece, so
    // the break has to come from the other axis: a row with no `t`. Eight
    // vertices halve to four against four samples, and the reading was
    // `(0,1) (0,0) (2,3) (3,1)` — the baseline where the subpath closed
    // announced as a datum, and t=3's value 2 announced as 1.
    expect(layersOf('gappyStepArea')).toHaveLength(0);
  });

  it('leaves the marks beside it alone', () => {
    // Refusing one mark is not refusing the chart. The dot mark over the same
    // rows draws nothing for the null rather than breaking, so it still holds
    // the three samples — and they are the ones the line was inventing a
    // fourth alongside.
    const layers = layersOf('gappyLineWithDots');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER]);
    expect((layers[0].data as ScatterPoint[]).map(point => [point.x, point.y]))
      .toEqual([[0, 1], [2, 3], [3, 2]]);
  });

  it('still reads a series drawn in one piece', () => {
    // The refusal is on the break, not on the curve: the same `step-after`
    // line without a null is a single subpath and comes back whole. Without
    // this every stepped line would be silent, which the guard has no way to
    // tell apart from doing its job.
    const layers = layersOf('stepAfterLine');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.STEP]);
    expect((layers[0].data as LinePoint[][])[0].map(point => [point.x, point.y]))
      .toEqual([[0, 1], [1, 1], [2, 3], [3, 2]]);
  });
});
