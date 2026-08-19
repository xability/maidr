/**
 * A `link` joins two points, and says something only when they share one
 * (#1094).
 *
 * Both ends on the same coordinate makes the segment a **span** along the
 * other axis, at one position on this one — an interval in a lane, which is
 * what a gantt, a timeline and a swimlane diagram all are. Ends that share
 * nothing are an edge in a node-link diagram, and there is no lane to put it
 * in.
 *
 * A gantt rather than a dumbbell, deliberately. `DumbbellPoint` would assert
 * that the two ends are a comparison, and only the dots that usually sit at
 * each end suggest that — a separate mark, with its own label, which pairing
 * would mean inferring a composite the way #1088 showed to be unsafe.
 */

import type { GanttData } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layersOf(key: Parameters<typeof mountFixture>[0]): { type: TraceType; data: unknown }[] {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element)?.subplots[0][0].layers ?? [];
}

function spansOf(key: Parameters<typeof mountFixture>[0]): [string, number, number][][] {
  const data = layersOf(key)[0]?.data as GanttData;
  return data.points.map(row => row.map(point => [String(point.x), point.start, point.end]));
}

describe('a link mark whose ends share a coordinate', () => {
  it('is read as a gantt of one span per lane', () => {
    expect(layersOf('rangeLinks')[0]?.type).toBe(TraceType.GANTT);
    expect(spansOf('rangeLinks')).toEqual([[['A', 3, 9]], [['B', 5, 14]], [['C', 2, 6]]]);
  });

  it('reads the same spans turned on their side', () => {
    // `x` names the lane here and the interval runs down y. Which axis is which
    // is the orientation, not a different reading.
    expect(layersOf('verticalRangeLinks')[0]?.type).toBe(TraceType.GANTT);
    expect(spansOf('verticalRangeLinks')).toEqual([[['A', 3, 9]], [['B', 5, 14]], [['C', 2, 6]]]);
  });

  it('takes only the two ends of a curved connector', () => {
    // `bump-x` writes `M88.333,32C233.333,32,233.333,32,378.333,32`. The
    // control points are the shape of the connector; reading them as data
    // would put samples at 5.5 that nothing was measured at.
    expect(spansOf('curvedRangeLinks')).toEqual([[['A', 3, 9]], [['B', 5, 14]], [['C', 2, 6]]]);
  });

  it('drops an arrow\'s head, which is drawn into the same path', () => {
    // `M88.333,32L378.333,32M371.405,28L378.333,32L371.405,36` — the head is a
    // second subpath. Its vertices sit near the span's far end, so taken as
    // data they would announce the interval ending short of where it does.
    expect(layersOf('arrowRanges')[0]?.type).toBe(TraceType.GANTT);
    expect(spansOf('arrowRanges')).toEqual([[['A', 3, 9]], [['B', 5, 14]], [['C', 2, 6]]]);
  });

  it('keeps a lane holding two intervals, and one holding none', () => {
    // A resource booked twice and a phase never booked are both ordinary in a
    // schedule, and the empty row is the thing a flat list cannot say.
    expect(spansOf('laneWithTwoIntervals')).toEqual([
      [['design', 0, 4]],
      [['build', 3, 10], ['build', 12, 15]],
      [],
    ]);
  });

  it('names every lane, including the one with nothing in it', () => {
    const data = layersOf('laneWithTwoIntervals')[0]?.data as GanttData;

    expect(data.lanes).toEqual(['design', 'build', 'test']);
  });
});

describe('a link mark whose ends share nothing', () => {
  it('turns away an edge in a node-link diagram', () => {
    // Both coordinates differ at both ends, so there is no lane to announce
    // and no interval either — only a connection between two places.
    expect(layersOf('edgeLinks')).toHaveLength(0);
  });

  it('turns away links that cross between lanes', () => {
    // The same shape on a categorical axis, where a lane could be named. Each
    // path still fails on its own account: a link from A to C is at neither.
    expect(layersOf('laneCrossingLinks')).toHaveLength(0);
  });

  it('turns away a mark holding spans and a lane-crossing link together', () => {
    // Asked per path this would read three spans and drop the fourth, so the
    // announcement would be a gantt missing a quarter of its chart without
    // saying so. Asked of the mark, the whole thing is handed back.
    expect(layersOf('mixedLaneLinks')).toHaveLength(0);
  });

  it('turns away a path carrying more than two ends', () => {
    // Hand-edited: Plot joins a link's two endpoints with one command whatever
    // the curve, so this cannot be asked for. Read anyway, the middle vertex
    // would have to be guessed past to find the ends.
    const { element, svg } = mountFixture('rangeLinks');
    svg.querySelector('g[aria-label="link"] path')
      ?.setAttribute('d', 'M88.333,32L200,32L378.333,32');

    // That path is dropped, and the whole-mark rule then declines the rest.
    expect(observablePlotToMaidr(element)?.subplots[0][0].layers ?? []).toHaveLength(0);
  });

  it('still turns away the linear-scaled diagonals', () => {
    // `mixedLinks` and `edgeLinks` have no categorical axis at all, so they are
    // refused before the span test is reached — which is why they cannot stand
    // in for the two cases above.
    expect(layersOf('mixedLinks')).toHaveLength(0);
  });
});
