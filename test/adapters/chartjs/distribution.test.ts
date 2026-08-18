/**
 * A Chart.js boxplot has to read the summary the plugin computed, and a violin
 * has to be read at all (#1049).
 *
 * `extractBoxplotLayers` read the author's `dataset.data` and kept only values
 * carrying a `median`. But `@sgratzl/chartjs-chart-boxplot`'s documented
 * primary form is a **raw array of samples** per box, which carries no summary
 * — the plugin computes one — so every point was skipped and the layer came
 * out with `data: []`. Its sibling type from the same plugin, `violin`, was not
 * in the type switch at all and reached the `default` branch, which throws.
 *
 * Measured on real Chart.js 4 plus `@sgratzl/chartjs-chart-boxplot@4` in
 * Chromium, driven through `extractChartData`:
 *
 *   chart     written as                        emitted
 *   boxplot   data: [[1,2,2,3,4,4,5,6,7,9]]     []          <- empty
 *   boxplot   data: [{min,q1,median,q3,max}]    correct
 *   boxplot   raw samples plus an outlier 42    []          <- empty
 *   violin    data: [[1,2,2,3,4,4,5,6,7,9]]     throws
 *
 * `chart.getDatasetMeta(d)._parsed[i]` holds the plugin's own parse whichever
 * form was written, and the outlier chart is what pins which fields to take:
 *
 *   min: 1   max: 42   whiskerMin: 1   whiskerMax: 9   outliers: [42]
 *
 * `min`/`max` are the data extremes; `whiskerMin`/`whiskerMax` are the ends the
 * chart draws. The old code took the extremes and then split the outliers with
 * `filter(v => v > point.max)` — a test no outlier can ever pass, so every one
 * was silently dropped and the box was announced as reaching 42.
 *
 * A violin's parse adds `coords`: 101 samples of `{ v, estimate }` along the
 * measured axis, which is the `ViolinKdePoint` shape exactly. So it emits the
 * same two layers the plotly adapter does — the quartiles and the curve.
 */
import type { ChartJsChart, ChartJsData, ChartJsParsedValue } from '@adapters/chartjs/types';
import type { BoxPoint, ViolinKdePoint } from '@type/grammar';
import { extractMaidrData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * A drawn distribution chart: the author's data plus the parse the plugin
 * would have left on the dataset's meta.
 * @param type - `'boxplot'` or `'violin'`
 * @param data - The chart's data, as the author wrote it
 * @param parsed - What the plugin parsed each value into
 * @returns The mock chart
 */
function createChart(
  type: string,
  data: ChartJsData,
  parsed: ChartJsParsedValue[],
): ChartJsChart {
  return {
    canvas: { id: 'dist-chart' } as unknown as HTMLCanvasElement,
    data,
    options: {},
    config: { type },
    getDatasetMeta: () => ({ data: [], type, _parsed: parsed }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The parse the plugin leaves for `[1,2,2,3,4,4,5,6,7,9]`, measured. */
const PLAIN_PARSE: ChartJsParsedValue = {
  x: 0,
  items: [1, 2, 2, 3, 4, 4, 5, 6, 7, 9],
  outliers: [],
  whiskerMax: 9,
  whiskerMin: 1,
  max: 9,
  median: 4,
  mean: 4.3,
  min: 1,
  q1: 2.25,
  q3: 5.75,
  y: 4,
};

/** The same sample with a 42 tacked on, measured. */
const OUTLIER_PARSE: ChartJsParsedValue = {
  x: 0,
  items: [1, 2, 2, 3, 4, 4, 5, 6, 7, 9, 42],
  outliers: [42],
  whiskerMax: 9,
  whiskerMin: 1,
  max: 42,
  median: 4,
  mean: 7.7272727272727275,
  min: 1,
  q1: 2.5,
  q3: 6.5,
  y: 4,
};

/** Three samples of a violin's density curve, in the plugin's own shape. */
const CURVE = [
  { v: 1, estimate: 0.0866684563030127 },
  { v: 1.08, estimate: 0.08948574273336438 },
  { v: 1.16, estimate: 0.09226322412732878 },
];

const RAW_DATA: ChartJsData = {
  labels: ['A'],
  datasets: [{ label: 'group', data: [[1, 2, 2, 3, 4, 4, 5, 6, 7, 9]] as never }],
};

/** The layers a chart converts to. */
function layersOf(chart: ChartJsChart): ReturnType<typeof extractMaidrData>['subplots'][0][0]['layers'] {
  return extractMaidrData(chart).subplots[0][0].layers;
}

describe('chart.js distribution charts', () => {
  it('reads a boxplot written as raw samples', () => {
    const layers = layersOf(createChart('boxplot', RAW_DATA, [PLAIN_PARSE]));

    expect(layers[0].type).toBe(TraceType.BOX);
    expect(layers[0].data as BoxPoint[]).toEqual([{
      z: 'A',
      lowerOutliers: [],
      min: 1,
      q1: 2.25,
      q2: 4,
      q3: 5.75,
      max: 9,
      upperOutliers: [],
      mean: 4.3,
    }]);
  });

  it('still reads a boxplot written as a pre-computed summary', () => {
    // The plugin normalises that form into the same parse, whiskers included,
    // so nothing about the second input form changes.
    const chart = createChart(
      'boxplot',
      {
        labels: ['A'],
        datasets: [{ label: 'group', data: [{ min: 1, q1: 2, median: 4, q3: 6, max: 9 }] as never }],
      },
      [{ x: 0, min: 1, q1: 2, median: 4, q3: 6, max: 9, outliers: [], whiskerMin: 1, whiskerMax: 9, y: 4 }],
    );

    expect((layersOf(chart)[0].data as BoxPoint[])[0]).toEqual({
      z: 'A',
      lowerOutliers: [],
      min: 1,
      q1: 2,
      q2: 4,
      q3: 6,
      max: 9,
      upperOutliers: [],
    });
  });

  it('draws the box to the whiskers and keeps the outlier outside it', () => {
    const chart = createChart('boxplot', RAW_DATA, [OUTLIER_PARSE]);
    const box = (layersOf(chart)[0].data as BoxPoint[])[0];

    // The whisker end, not the data maximum of 42.
    expect(box.max).toBe(9);
    expect(box.upperOutliers).toEqual([42]);
    expect(box.lowerOutliers).toEqual([]);
  });

  it('reads a violin as its quartiles and its curve', () => {
    const chart = createChart(
      'violin',
      RAW_DATA,
      [{ ...PLAIN_PARSE, coords: CURVE, maxEstimate: 0.135 } as ChartJsParsedValue],
    );
    const layers = layersOf(chart);

    expect(layers.map(l => l.type)).toEqual([TraceType.VIOLIN_BOX, TraceType.VIOLIN_KDE]);
    expect((layers[0].data as BoxPoint[])[0].q2).toBe(4);
    expect(layers[1].data as ViolinKdePoint[][]).toEqual([[
      { x: 'A', y: 1, density: 0.0866684563030127 },
      { x: 'A', y: 1.08, density: 0.08948574273336438 },
      { x: 'A', y: 1.16, density: 0.09226322412732878 },
    ]]);
  });

  it('emits the box alone for a violin whose parse carries no curve', () => {
    // An empty second layer would announce a curve the chart does not have.
    const chart = createChart('violin', RAW_DATA, [PLAIN_PARSE]);
    expect(layersOf(chart).map(l => l.type)).toEqual([TraceType.VIOLIN_BOX]);
  });

  it('no longer throws on a violin', () => {
    const chart = createChart('violin', RAW_DATA, [PLAIN_PARSE]);
    expect(() => extractMaidrData(chart)).not.toThrow();
  });
});
