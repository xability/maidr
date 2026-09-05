import type { AxisConfig, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * `resolveGridConfig` only checked that the six grid values were present,
 * never that they described a grid. A `tickStep` of `0` over a positive range
 * made `computeGridSteps` compute `Infinity` bins and push bin objects until
 * the tab ran out of memory -- inside the constructor, so `new Figure(...)`
 * never returned and there was nothing to catch. A negative step or an
 * inverted range produced the opposite: zero bins, and a grid mode that was
 * advertised but had no cell to enter.
 *
 * The Plotly extractor rejects a non-positive step before it reaches here,
 * but hand-authored JSON and other producers construct the trace directly.
 */
function scatterLayer(x: AxisConfig, y: AxisConfig): MaidrLayer {
  return {
    id: 'grid-tick-step-layer',
    type: TraceType.SCATTER,
    title: 'Grid tick step',
    axes: { x, y },
    data: [{ x: 1, y: 1 }, { x: 3, y: 3 }],
  };
}

describe('a scatter grid config that does not describe a grid', () => {
  test.each([
    ['a zero x tick step', { min: 0, max: 4, tickStep: 0 }, { min: 0, max: 4, tickStep: 2 }],
    ['a zero y tick step', { min: 0, max: 4, tickStep: 2 }, { min: 0, max: 4, tickStep: 0 }],
    ['a negative tick step', { min: 0, max: 4, tickStep: -2 }, { min: 0, max: 4, tickStep: 2 }],
    ['a non-finite tick step', { min: 0, max: 4, tickStep: Number.POSITIVE_INFINITY }, { min: 0, max: 4, tickStep: 2 }],
    ['a NaN tick step', { min: 0, max: 4, tickStep: Number.NaN }, { min: 0, max: 4, tickStep: 2 }],
    ['an inverted range', { min: 4, max: 0, tickStep: 2 }, { min: 0, max: 4, tickStep: 2 }],
    ['a collapsed range', { min: 2, max: 2, tickStep: 2 }, { min: 0, max: 4, tickStep: 2 }],
  ])('%s constructs without a grid', (_name, x, y) => {
    const trace = new ScatterTrace(scatterLayer({ label: 'X', ...x }, { label: 'Y', ...y }));

    expect(trace.supportsGridMode()).toBe(false);
    expect(trace.getGridDimensions()).toBeNull();
    expect(trace.state.empty).toBe(false);
  });

  test('a well-formed config still builds the grid', () => {
    const trace = new ScatterTrace(scatterLayer(
      { label: 'X', min: 0, max: 4, tickStep: 2 },
      { label: 'Y', min: 0, max: 4, tickStep: 2 },
    ));

    expect(trace.supportsGridMode()).toBe(true);
    expect(trace.getGridDimensions()).toEqual({ rows: 2, cols: 2 });
  });
});
