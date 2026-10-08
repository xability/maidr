/**
 * A Plot line of precision against recall is a precision-recall curve.
 *
 * Plot has no such mark, so the curve is either said -- `markTypes: { line:
 * TraceType.PR_CURVE }` -- or read off the axis labels Plot writes from the
 * field names, the reading the Vega-Lite adapter gives the same chart. Both
 * fixtures are what the real Plot 0.6.17 drew from three operating points.
 */

import type { MaidrLayer, PrCurvePoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

/**
 * The three operating points, as the path's three-decimal pixels give them
 * back: 0.8 is drawn at 136.667, which inverts to 0.799999.
 */
const CURVE: PrCurvePoint[] = [
  { x: 0, y: 1 },
  { x: 0.5, y: 0.799999 },
  { x: 1, y: 0.4 },
];

function layerOf(
  key: 'prCurveLine' | 'unlabelledRateLine' | 'percentRateLine',
  markTypes?: Record<string, string>,
): MaidrLayer | undefined {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element, markTypes ? { markTypes } : {})?.subplots[0][0].layers[0];
}

describe('a precision-recall curve drawn by Observable Plot', () => {
  it('is read as one when its axes are labelled recall and precision', () => {
    const layer = layerOf('prCurveLine');

    expect(layer?.type).toBe(TraceType.PR_CURVE);
    expect(layer?.data).toEqual([CURVE]);
    // The line's own mark, stamped as any line's is.
    expect(layer?.selectors).toHaveLength(1);
  });

  it('stays a line when nothing names the rates', () => {
    expect(layerOf('unlabelledRateLine')?.type).toBe(TraceType.LINE);
  });

  it('is read as one when the caller declares the line mark a curve', () => {
    const layer = layerOf('unlabelledRateLine', { line: TraceType.PR_CURVE });

    expect(layer?.type).toBe(TraceType.PR_CURVE);
    expect(layer?.data).toEqual([CURVE]);
  });

  it('stays a line when its rates are written as percentages', () => {
    expect(layerOf('percentRateLine')?.type).toBe(TraceType.LINE);
    expect(layerOf('percentRateLine', { line: TraceType.PR_CURVE })?.type).toBe(TraceType.LINE);
  });
});
