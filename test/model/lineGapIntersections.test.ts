import type { ExtremaTarget } from '@type/extrema';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Intersections on a multiline chart where one series has a gap (#925).
 *
 * A gap is a sample with a position and no reading. The chart draws nothing
 * through it, so no crossing can happen there: a segment into or out of a gap
 * does not exist, and neither does a point at it. Coercing the gap to `0`
 * puts a vertex on the x axis that the chart never drew, and every other line
 * that passes between the gap's neighbours and that phantom vertex is then
 * reported as crossing the series.
 */

function lineLayer(rows: LinePoint[][]): MaidrLayer {
  return {
    id: 'l',
    type: TraceType.LINE,
    title: 'Series',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: rows,
  };
}

function intersectionTargets(trace: LineTrace): ExtremaTarget[] {
  return trace.getExtremaTargets().filter(target => target.type === 'intersection');
}

/** A series held at 10 with its middle sample unmeasured. */
const GAPPED: LinePoint[] = [
  { x: 0, y: 10 },
  { x: 1, y: null },
  { x: 2, y: 10 },
];

describe('a gap in the current line', () => {
  test('does not create crossings with a line running below it', () => {
    // Held at 5, the other line sits between the gap's measured neighbours
    // at 10 and the phantom vertex a coerced gap would put at 0. It never
    // meets the series the chart actually draws.
    const trace = new LineTrace(lineLayer([
      GAPPED,
      [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }],
    ]));

    expect(intersectionTargets(trace)).toEqual([]);
  });

  test('is not itself a point intersection with a line running at zero', () => {
    // The worst case: the other line really is at 0, exactly where the
    // coerced gap would land, so the two would match as a shared sampled
    // point and the rotor would navigate onto a sample that reads "missing".
    const trace = new LineTrace(lineLayer([
      GAPPED,
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    ]));
    trace.col = 0;

    expect(intersectionTargets(trace)).toEqual([]);
    expect(trace.moveToNextIntersection()).toBe(false);
    expect(trace.col).toBe(0);
  });

  test('leaves a real crossing elsewhere on the line intact', () => {
    // The guard has to remove the segments that touch the gap, not the
    // series: after the gap this line falls through the other one.
    const trace = new LineTrace(lineLayer([
      [...GAPPED, { x: 3, y: 0 }],
      [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }],
    ]));

    const targets = intersectionTargets(trace);

    expect(targets).toHaveLength(1);
    expect(targets[0].intersectionKind).toBe('slope');
    expect(targets[0].value).toBeCloseTo(5);
  });
});

describe('a gap in another line', () => {
  test('does not create crossings with the current line either', () => {
    const trace = new LineTrace(lineLayer([
      [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }],
      GAPPED,
    ]));

    expect(intersectionTargets(trace)).toEqual([]);
  });
});
