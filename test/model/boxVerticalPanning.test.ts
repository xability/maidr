import type { BoxPoint, MaidrLayer } from '@type/grammar';
import type { AudioState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { ViolinBoxTrace } from '@model/violinBox';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Stereo panning follows the on-screen x position. On a vertical box plot the
 * boxes sit side by side along x, so moving between boxes is what pans left
 * to right; climbing the sections of one box is a vertical movement and must
 * not move the pan at all.
 *
 * `AudioService.stereoSlotOf` reads only `panning.x` against `panning.cols`,
 * which is why those two are what the tests pin.
 */

function box(z: string, offset: number): BoxPoint {
  return {
    z,
    lowerOutliers: [offset],
    min: offset + 1,
    q1: offset + 2,
    q2: offset + 3,
    q3: offset + 4,
    max: offset + 5,
    upperOutliers: [offset + 6],
  };
}

const GROUPS: BoxPoint[] = [box('A', 0), box('B', 10), box('C', 20)];

function boxLayer(type: TraceType): MaidrLayer {
  return {
    id: 'boxes',
    type,
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data: GROUPS,
  };
}

function audioOf(trace: { state: TraceState }): AudioState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.audio;
}

describe.each([
  ['box', (): BoxTrace => new BoxTrace(boxLayer(TraceType.BOX))],
  ['violin box', (): ViolinBoxTrace => new ViolinBoxTrace(boxLayer(TraceType.VIOLIN_BOX))],
])('vertical %s panning', (_name, build) => {
  test('pans across the groups', () => {
    const trace = build();

    // Sections are rows and groups are columns on a vertical layout.
    trace.moveToIndex(0, 0);
    const first = audioOf(trace).panning;
    trace.moveToIndex(0, 2);
    const last = audioOf(trace).panning;

    expect(first.x).toBe(0);
    expect(last.x).toBe(2);
    expect(first.cols).toBe(3);
    expect(last.cols).toBe(3);
  });

  test('holds the pan while climbing one group', () => {
    const trace = build();

    trace.moveToIndex(0, 1);
    const bottom = audioOf(trace).panning;
    trace.moveToIndex(3, 1);
    const higher = audioOf(trace).panning;

    expect(higher.x).toBe(bottom.x);
    expect(higher.cols).toBe(bottom.cols);
  });
});
