import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, it } from '@jest/globals';
import { Histogram } from '@model/histogram';
import { TraceType } from '@type/grammar';

/**
 * A histogram answers the bracket keys and the Go To Extrema dialog ('g').
 *
 * `Histogram` inherited `supportsExtrema = true` from `AbstractBarPlot`, so
 * both entry points treated it as navigable, but the targets themselves were
 * only implemented on `BarTrace`. The histogram fell through to
 * `AbstractTrace`'s empty list: `[` and `]` announced that there was no
 * minimum or maximum, and the dialog had nothing in it to choose.
 */

const LAYER: MaidrLayer = {
  id: 'hist',
  type: TraceType.HISTOGRAM,
  axes: { x: { label: 'Petal Length' }, y: { label: 'Count' } },
  data: [
    { x: 1, y: 4, xMin: 0, xMax: 2, yMin: 0, yMax: 4 },
    { x: 3, y: 33, xMin: 2, xMax: 4, yMin: 0, yMax: 33 },
    { x: 5, y: 2, xMin: 4, xMax: 6, yMin: 0, yMax: 2 },
    { x: 7, y: 12, xMin: 6, xMax: 8, yMin: 0, yMax: 12 },
  ],
};

describe('Histogram extrema', () => {
  it('offers its tallest and shortest bins as targets', () => {
    const trace = new Histogram(LAYER);
    trace.moveToIndex(0, 0);

    const targets = trace.getExtremaTargets();
    const max = targets.find(target => target.type === 'max');
    const min = targets.find(target => target.type === 'min');

    expect(max).toMatchObject({ value: 33, pointIndex: 1, xValue: 3 });
    expect(min).toMatchObject({ value: 2, pointIndex: 2, xValue: 5 });
  });

  it('moves to the target it is sent to', () => {
    const trace = new Histogram(LAYER);
    trace.moveToIndex(0, 0);

    const max = trace.getExtremaTargets().find(target => target.type === 'max');
    if (max === undefined) {
      throw new Error('no maximum target');
    }
    trace.navigateToExtrema(max);

    const state = trace.state as TraceState;
    expect(state.empty === false && state.text.main.value).toBe(3);
    expect(state.empty === false && state.text.cross?.value).toBe(33);
  });
});
