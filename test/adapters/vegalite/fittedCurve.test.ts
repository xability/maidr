import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

/**
 * A `regression` or `loess` curve is a fit, not a series (#1162).
 *
 * Both transforms replace the rows with a model. Driven through
 * vega-lite 5.23 / vega 5.33 on twenty-four points whose y alternates
 * low/high, so a smoother is visible rather than merely plausible:
 *
 * ```
 * raw y        [0, 11, 2, 13, 4, 15, 6, 17]  n=24
 * loess        [3.04, 4.82, 6.62, 7.84, …]   n=24
 * regression   [4.4, 28.6]                   n=2   (the fitted endpoints)
 * ```
 *
 * The data was always right — `view.data(…)` returns the post-transform
 * rows, so the fit is what arrives. What was wrong is the **name**: both
 * read as `line`, which tells a reader the chart draws a series. It draws
 * a model of one.
 *
 * Every other producer already calls a fitted curve a smooth — Observable's
 * `linearRegressionY`, Highcharts' `bellcurve` (#1138), plotly's
 * `trendline`, ggplot2's `geom_smooth`. This makes Vega-Lite the fifth.
 *
 * `density` is deliberately untouched: it also replaces the rows, but the
 * author picks `line` or `area` for it deliberately and both are ordinary
 * readings of a curve. That half is left open on #1162.
 */

/** Twenty-four alternating points — the raw rows, before any transform. */
const RAW = Array.from({ length: 6 }, (_, i) => ({ a: i, b: (i % 2 ? 10 : 0) + i }));

/** What vega's loess returns for them: a curve, not the observations. */
const SMOOTHED = [
  { a: 0, b: 3.04 },
  { a: 1, b: 4.82 },
  { a: 2, b: 6.62 },
  { a: 3, b: 7.84 },
  { a: 4, b: 9.12 },
  { a: 5, b: 9.87 },
];

/** What vega's regression returns: the fitted line's two endpoints. */
const FITTED = [{ a: 0, b: 4.4 }, { a: 5, b: 28.6 }];

const XY = {
  x: { field: 'a', type: 'quantitative' as const, title: 'A' },
  y: { field: 'b', type: 'quantitative' as const, title: 'B' },
};

function specWith(transform: unknown[], mark = 'line'): VegaLiteSpec {
  return { transform, mark, encoding: XY } as VegaLiteSpec;
}

/**
 * Convert a spec and assert it produced exactly one layer.
 * @param spec The Vega-Lite spec to convert
 * @param rows The rows the compiled view yields for the mark's dataset
 * @returns The single converted layer
 */
function onlyLayer(spec: VegaLiteSpec, rows: unknown[]): MaidrLayer {
  const result = vegaLiteToMaidr(spec, makeView({ data_0: rows }));
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite fitted curves', () => {
  it('reads a loess curve as a smooth, not a line', () => {
    const layer = onlyLayer(specWith([{ loess: 'b', on: 'a' }]), SMOOTHED);

    expect(layer.type).toBe(TraceType.SMOOTH);
  });

  it('reads a regression curve as a smooth, not a line', () => {
    const layer = onlyLayer(specWith([{ regression: 'b', on: 'a' }]), FITTED);

    expect(layer.type).toBe(TraceType.SMOOTH);
  });

  it('still carries the fitted rows, and does not vanish', () => {
    // The failure this pins was measured: resolving the type to `smooth`
    // without adding it to the extraction dispatch left the layer with no
    // data at all, because the default branch returns null. A name change
    // that silently empties the chart is worse than the wrong name.
    const layer = onlyLayer(specWith([{ loess: 'b', on: 'a' }]), SMOOTHED);

    expect(layer.data as LinePoint[][]).toEqual([
      SMOOTHED.map(row => ({ x: row.a, y: row.b })),
    ]);
  });

  it('carries a regression down to its two endpoints', () => {
    const layer = onlyLayer(specWith([{ regression: 'b', on: 'a' }]), FITTED);

    expect(layer.data as LinePoint[][]).toEqual([
      [{ x: 0, y: 4.4 }, { x: 5, y: 28.6 }],
    ]);
  });

  it('leaves a line with no fitted transform alone', () => {
    // The name has to come from the transform, not from the mark: an
    // ordinary line over the same channels is still a line.
    const layer = onlyLayer({ mark: 'line', encoding: XY } as VegaLiteSpec, RAW);

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves a density area alone, which is the half left open', () => {
    const spec = specWith([{ density: 'b', as: ['v', 'd'] }], 'area');

    expect(onlyLayer(spec, RAW).type).toBe(TraceType.AREA);
  });

  it('keeps its axis titles', () => {
    const layer = onlyLayer(specWith([{ regression: 'b', on: 'a' }]), FITTED);

    expect(layer.axes?.x?.label).toBe('A');
    expect(layer.axes?.y?.label).toBe('B');
  });
});
