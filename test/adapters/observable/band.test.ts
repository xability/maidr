/**
 * An area given `y1` and `y2` off the data is an interval, not a magnitude
 * (#1092).
 *
 * `convertLine` reads an area's value as the height of its band, which is what
 * turns a stack's running total back into each series' own value. Applied to a
 * band that stacks on nothing it measures the wrong thing: the distance from a
 * lower bound up to an upper one is the interval's width, and announcing it
 * hands a reader a number the chart's own axis contradicts.
 *
 * What separates the two is whether the floor moves. A level floor is one the
 * chart chose — the baseline, or a constant `y1` — and the height above it is
 * a magnitude. A floor that follows the data sample by sample is tracing a
 * bound, and there is no value between it and the ceiling to announce.
 */

import type { LinePoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layersOf(key: Parameters<typeof mountFixture>[0]): { type: TraceType; data: unknown }[] {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element)?.subplots[0][0].layers ?? [];
}

function valuesOf(layer: { data: unknown }): number[][] {
  return (layer.data as LinePoint[][]).map(points => points.map(point => Number(point.y)));
}

describe('an area whose floor follows the data', () => {
  it('is handed back rather than read as the width between its edges', () => {
    // Drawn at 8/12, 11/15, 9/13 and 13/17, it was announced as 4, 4, 4, 4 —
    // one unchanging tone across a chart that is not flat, and a number that
    // appears nowhere on the y axis.
    expect(layersOf('confidenceBand')).toHaveLength(0);
  });

  it('leaves a Bollinger chart\'s moving average alone', () => {
    // `Plot.bollingerY` is two ordinary marks, so the band goes the same way
    // the confidence band does and the average beside it is read as the line
    // it is. Announced together, the band contributed a flat 2.582 — 2σ — as
    // though it were a second series.
    const layers = layersOf('bollingerChart');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.LINE]);
    expect(valuesOf(layers[0])).toEqual([[11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5]]);
  });
});

describe('an area whose floor is level', () => {
  it('still reads a plain area resting on the baseline', () => {
    // The baseline is the level floor every ordinary area has, so the height
    // above it is the value and nothing here changes. Without this the guard
    // would refuse every area on the chart.
    const layers = layersOf('steppedArea');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.AREA]);
    expect(valuesOf(layers[0])).toEqual([[1, 1, 3, 2]]);
  });

  it('still reads a band raised onto a constant base', () => {
    // `independentAreas` draws its second band from a fixed 5 rather than from
    // zero. A base the chart chose is not a bound it measured, so the height
    // above it is still a magnitude — the case that keeps this from being
    // "refuse anything off the baseline".
    const layers = layersOf('independentAreas');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.AREA]);
    expect(valuesOf(layers[0])).toEqual([[10, 15, 12], [35, 40, 33]]);
  });

  it('still reads a stack, whose floors move because they are its series', () => {
    // A stack's floor moves too, and there it really is data — the series
    // below. That is what the stack test settles before this one is asked,
    // and dropping it would silence every stacked area.
    const layers = layersOf('stackedArea');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.STACKED_AREA]);
    expect(valuesOf(layers[0])).toEqual([[120, 135, 150], [60, 70, 65], [30, 25, 40]]);
  });
});
