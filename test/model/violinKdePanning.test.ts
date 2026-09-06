import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { AudioState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ViolinKdeTrace } from '@model/violin';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Stereo panning follows the on-screen x position. On a vertical violin the
 * violins sit side by side along x, so switching violins is what pans left to
 * right; climbing the density curve of one violin is a vertical movement and
 * must not move the pan at all. On a horizontal violin the curve runs along
 * x, so the position on it pans.
 *
 * `AudioService.stereoSlotOf` reads only `panning.x` against `panning.cols`,
 * which is why those two are what the tests pin.
 */

function violinKdeLayer(orientation: Orientation): MaidrLayer {
  const curve = (offset: number): ViolinKdePoint[] => [
    { x: 'g', y: offset, density: 0.1 },
    { x: 'g', y: offset + 1, density: 0.5 },
    { x: 'g', y: offset + 2, density: 0.2 },
  ];
  return {
    id: 'kde',
    type: TraceType.VIOLIN_KDE,
    orientation,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: [],
    data: [curve(0), curve(10), curve(20)],
  };
}

function audioOf(trace: { state: TraceState }): AudioState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.audio;
}

describe('vertical violin kde panning', () => {
  test('pans across the violins', () => {
    const trace = new ViolinKdeTrace(violinKdeLayer(Orientation.VERTICAL));

    // Violins are rows and curve positions are columns.
    trace.moveToIndex(0, 0);
    const first = audioOf(trace).panning;
    trace.moveToIndex(2, 0);
    const last = audioOf(trace).panning;

    expect(first.x).toBe(0);
    expect(last.x).toBe(2);
    expect(first.cols).toBe(3);
    expect(last.cols).toBe(3);
  });

  test('holds the pan while climbing one violin', () => {
    const trace = new ViolinKdeTrace(violinKdeLayer(Orientation.VERTICAL));

    trace.moveToIndex(1, 0);
    const bottom = audioOf(trace).panning;
    trace.moveToIndex(1, 2);
    const higher = audioOf(trace).panning;

    expect(higher.x).toBe(bottom.x);
    expect(higher.cols).toBe(bottom.cols);
  });
});

describe('horizontal violin kde panning', () => {
  test('pans along the curve', () => {
    const trace = new ViolinKdeTrace(violinKdeLayer(Orientation.HORIZONTAL));

    trace.moveToIndex(0, 0);
    const first = audioOf(trace).panning;
    trace.moveToIndex(0, 2);
    const last = audioOf(trace).panning;

    expect(first.x).toBe(0);
    expect(last.x).toBe(2);
    expect(last.cols).toBe(3);
  });
});
