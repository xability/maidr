import type { SmoothTrace } from '@model/smooth';
/**
 * How a fitted curve describes itself.
 *
 * `SmoothTrace` owns no description of its own -- it inherits `LineTrace`'s
 * whole -- but the samples it lists are positions along a curve the producer
 * fitted, not observations: the data the curve was fitted to is not in the
 * layer at all. Described in the line's words, a LOESS layer reads "Points per
 * line: 80" and a reader takes it for eighty measurements.
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/** A fitted curve, sampled evenly, with the band the fit carries. */
const CURVE: LinePoint[] = [
  { x: 0, y: 1, yMin: 0.5, yMax: 1.5, z: 'fit' },
  { x: 1, y: 2, yMin: 1.2, yMax: 2.8, z: 'fit' },
  { x: 2, y: 3, yMin: 2.4, yMax: 3.6, z: 'fit' },
];

/**
 * Build a smooth layer over the given curves.
 *
 * `selectors` is omitted so the trace needs no DOM.
 *
 * @param data - The curves, one array per fit
 * @returns A layer definition
 */
function layer(data: LinePoint[][] = [CURVE]): MaidrLayer {
  return {
    id: 'smooth-description-layer',
    type: TraceType.SMOOTH,
    title: 'Fit',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

/**
 * Build the trace.
 *
 * @param data - The curves the layer carries
 * @returns The trace
 */
function smooth(data?: LinePoint[][]): SmoothTrace {
  return TraceFactory.create(layer(data)) as SmoothTrace;
}

describe('the description of a fitted curve', () => {
  test('counts curves and samples rather than lines and points', () => {
    const labels = smooth().description.stats.map(stat => stat.label);

    expect(labels).toContain('Number of curves');
    expect(labels).toContain('Samples per curve');
    expect(labels).not.toContain('Number of lines');
    expect(labels).not.toContain('Points per line');
  });

  test('heads the series column with the curve on a multi-curve layer', () => {
    const second: LinePoint[] = CURVE.map(point => ({ ...point, z: 'other fit' }));

    expect(smooth([CURVE, second]).description.dataTable.headers).toEqual([
      'X',
      'Y',
      'Curve',
    ]);
  });

  test('names an unnamed curve after the curve, not after a line', () => {
    const bare: LinePoint[][] = [
      [{ x: 0, y: 1 }],
      [{ x: 0, y: 2 }],
    ];

    expect(smooth(bare).description.stats).toContainEqual({
      label: 'Curve names',
      value: 'Curve 1, Curve 2',
    });
  });

  test('still reports the band, which is why the curve is drawn', () => {
    const stats = new Map(
      smooth().description.stats.map(stat => [stat.label, stat.value]),
    );

    expect(stats.get('Narrowest interval')).toBe(1);
    expect(stats.get('Widest interval')).toBeCloseTo(1.6);
  });
});

describe('what a curve is called out loud', () => {
  test('is what the dialog calls it, not the line\'s "Group"', () => {
    const trace = smooth();
    trace.moveOnce('FORWARD');
    const state = trace.state as NonEmptyTraceState;

    expect(state.text.z).toEqual({ label: 'Curve', value: 'fit' });
  });
});
