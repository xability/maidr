/**
 * A Vega-Lite histogram binned up the y axis was read as an upright one.
 *
 * `binX` and `binY` compile to the same `bar` mark, and `extractHistogramData`
 * looked for the compiled bin columns under the **x** field's name whichever
 * of the two the spec used. For a `binY` spec it found none, so every bin fell
 * back to `row[xField] ?? 0` and `binMin + 1` — the count's own extent — and
 * the layer declared no `orientation`, which resolves to `vert`.
 *
 * Measured in Chromium on vega-lite 5, twenty petal lengths binned up y with
 * `x: {aggregate: 'count'}`, before and after:
 *
 *   announced on the first bin
 *   before   "Count is 0 through 1, Petal Length is 3"
 *   after    "Petal Length is 6 through 7, Count is 2"
 *
 * Every number in the first reading is on the chart and none of them is the
 * one being named: the bins were lost entirely, and what was left was
 * announced against the other axis. That is the failure
 * {@link MaidrLayer.orientation} exists to prevent, so the payload is
 * transposed as well as labelled — `Histogram` takes the bin bounds from
 * `yMin`/`yMax` and the count from `x` when the layer says `horz`.
 *
 * The binned channel, not `isHorizontalEncoding`, is what decides: both of a
 * histogram's channels are quantitative — the bins as much as the count — so
 * the measured-against-naming test the bar family uses answers `false` for
 * every histogram, upright or sideways.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';

/** Two bins of the compiled `binX` output, as Vega leaves the rows. */
const BINNED_X = {
  values: [
    { bin_maxbins_10_petal: 1, bin_maxbins_10_petal_end: 2, __count: 3 },
    { bin_maxbins_10_petal: 2, bin_maxbins_10_petal_end: 3, __count: 4 },
  ],
};

/** The same two bins, from a `binY` spec — identical rows, other channel. */
const BINNED_Y = BINNED_X;

/**
 * The layer one binned bar mark converts to.
 * @param spec - The spec to convert
 * @returns The single emitted layer
 */
function onlyLayer(spec: VegaLiteSpec): MaidrLayer {
  const layers = vegaLiteToMaidr(spec).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

/** A histogram with its bins across the page, the ordinary way round. */
function upright(): MaidrLayer {
  return onlyLayer({
    data: BINNED_X,
    mark: 'bar',
    encoding: {
      x: { bin: true, field: 'petal', type: 'quantitative', title: 'Petal Length' },
      y: { aggregate: 'count', type: 'quantitative', title: 'Count' },
    },
  });
}

/** The same distribution binned up the y axis instead. */
function sideways(): MaidrLayer {
  return onlyLayer({
    data: BINNED_Y,
    mark: 'bar',
    encoding: {
      y: { bin: true, field: 'petal', type: 'quantitative', title: 'Petal Length' },
      x: { aggregate: 'count', type: 'quantitative', title: 'Count' },
    },
  });
}

describe('a vega-Lite histogram binned along x', () => {
  it('is read as a histogram drawn upright', () => {
    const layer = upright();

    expect(layer.type).toBe(TraceType.HISTOGRAM);
    expect(layer.orientation).toBeUndefined();
  });

  it('puts the bin on x and the count on y', () => {
    const points = upright().data as HistogramPoint[];

    expect(points[0]).toEqual({ x: '1-2', y: 3, xMin: 1, xMax: 2, yMin: 0, yMax: 3 });
  });
});

describe('a vega-Lite histogram binned up y', () => {
  it('says it is drawn sideways', () => {
    const layer = sideways();

    expect(layer.type).toBe(TraceType.HISTOGRAM);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
  });

  it('reads the compiled bin columns off the channel that carries them', () => {
    // Looked up under the x field's name these were not found at all, and the
    // bin became "0 through 1" — the same span for every bin on the chart.
    const points = sideways().data as HistogramPoint[];

    expect(points.map(point => [point.yMin, point.yMax])).toEqual([[1, 2], [2, 3]]);
  });

  it('takes the count from the aggregated channel and puts it on x', () => {
    const points = sideways().data as HistogramPoint[];

    expect(points[0]).toEqual({ x: 3, y: '1-2', xMin: 0, xMax: 3, yMin: 1, yMax: 2 });
  });

  it('leaves the channel titles where the spec put them', () => {
    // No swap here, unlike the Highcharts adapter's: a Vega-Lite encoding
    // names what is on each channel, so `x` already titles the count on a
    // `binY` spec -- which is where the horizontal payload puts the count.
    expect(sideways().axes).toEqual({
      x: { label: 'Count' },
      y: { label: 'Petal Length' },
    });
    expect(upright().axes).toEqual({
      x: { label: 'Petal Length' },
      y: { label: 'Count' },
    });
  });
});
