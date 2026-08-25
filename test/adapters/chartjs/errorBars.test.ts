/**
 * The Chart.js adapter refused error-bar charts, though `error_bar` has
 * existed since #789 (#1176).
 *
 * `chartjs-chart-error-bars` is the sibling of the boxplot plugin the adapter
 * already reads, and `ErrorBarPoint` is `{x, y?, yMin?, yMax?, z?}` -- the
 * exact shape its controllers parse into. An identical interval chart drawn
 * in plotly, Vega-Lite or ggplot2 was navigable; only a Chart.js one raised.
 *
 * Measured against a running chart -- `chart.js@4.5` with
 * `chartjs-chart-error-bars@4.4.5`, driven headlessly through Chart.js's own
 * `BasicPlatform` -- and the fixtures below are what `_parsed` came back as:
 *
 *     barWithErrorBars      {x: 0, y: 10, yMin: 8, yMax: 13, yMinMin: 8, yMaxMax: 13}
 *     lineWithErrorBars     the same
 *     scatterWithErrorBars  the same plus xMin/xMax/xMinMin/xMaxMax
 *     indexAxis: 'y'        {y: 0, x: 10, xMin: 8, xMax: 13, xMinMin: 8, xMaxMax: 13}
 *
 * Four things that decided the reading, each measured rather than assumed:
 *
 *   - **`_parsed`, not `dataset.data`.** Both are available -- the controller
 *     leaves the caller's rows verbatim, as the sankey one does -- but only
 *     the parse resolves the horizontal case, where the bounds and the value
 *     move to X and the category to Y.
 *
 *   - **a bound may be an array.** The plugin draws nested intervals from
 *     `yMin: [8, 7]` / `yMax: [13, 14]`, and the parse then carries scalar
 *     `yMinMin: 7` / `yMaxMax: 14` beside them -- the outermost pair, which
 *     is the interval the drawn whiskers reach.
 *
 *   - **"no interval" has two spellings.** A datum written as a plain number
 *     parses to `yMin: null`; an object datum with no bounds omits the key
 *     entirely. Both mean no whiskers, and neither is an interval of width
 *     zero, so the test is `!= null`.
 *
 *   - **a `null` entry is not a case to handle.** The controller throws
 *     laying the chart out ("Cannot read properties of null") before MAIDR
 *     sees it -- the same shape a sankey row with no `flow` has.
 */
import type { ChartJsChart, ChartJsDataset, ChartJsParsedValue } from '@adapters/chartjs/types';
import type { ErrorBarPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';

interface ChartOptions {
  type?: string;
  labels?: (string | number)[];
  indexAxis?: 'x' | 'y';
  reverse?: boolean;
}

/**
 * An error-bar chart as Chart.js leaves it after `update()`.
 *
 * @param parsed - One parse per dataset, in the shape measured above
 * @param options - The chart type, its labels and its axis settings
 * @returns The chart
 */
function errorBarChart(
  parsed: ChartJsParsedValue[][],
  options: ChartOptions = {},
): ChartJsChart {
  const { type = 'barWithErrorBars', labels = ['a', 'b', 'c'], indexAxis, reverse } = options;
  const datasets = parsed.map((_, index) => ({
    label: `S${index + 1}`,
    // The controller leaves the caller's rows alone, so `data` is only ever
    // read here for its length; every value comes from the parse.
    data: parsed[index].map(() => 0),
  })) as unknown as ChartJsDataset[];

  const categoryAxis = indexAxis === 'y' ? 'y' : 'x';
  return {
    canvas: {} as HTMLCanvasElement,
    data: { labels, datasets },
    options: {
      plugins: {},
      ...(indexAxis ? { indexAxis } : {}),
      scales: {
        x: { title: { text: 'Treatment' } },
        y: { title: { text: 'Response' } },
        ...(reverse ? { [categoryAxis]: { reverse: true, title: { text: categoryAxis === 'x' ? 'Treatment' : 'Response' } } } : {}),
      },
    },
    config: { type },
    getDatasetMeta: (index: number) => ({ data: [], type, _parsed: parsed[index] ?? [] }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** One dataset of three categories with a symmetric interval at each. */
const THREE_INTERVALS: ChartJsParsedValue[] = [
  { x: 0, y: 10, yMin: 8, yMax: 13, yMinMin: 8, yMaxMax: 13 },
  { x: 1, y: 20, yMin: 17, yMax: 22, yMinMin: 17, yMaxMax: 22 },
  { x: 2, y: 15, yMin: 14, yMax: 19, yMinMin: 14, yMaxMax: 19 },
];

/** The single layer of an error-bar chart. */
function errorBarLayer(chart: ChartJsChart): {
  layer: any;
  points: ErrorBarPoint[];
  series: ErrorBarPoint[][];
} {
  const layer = extractChartData(chart).maidr.subplots[0][0].layers[0];
  const data = layer.data as ErrorBarPoint[] | ErrorBarPoint[][];
  const grouped = Array.isArray(data[0]);
  return {
    layer,
    points: grouped ? (data as ErrorBarPoint[][]).flat() : (data as ErrorBarPoint[]),
    series: grouped ? (data as ErrorBarPoint[][]) : [data as ErrorBarPoint[]],
  };
}

describe('chart.js error bars', () => {
  it('reads a barWithErrorBars as an error_bar rather than raising', () => {
    // The reproduction. Before this the dispatcher's default threw, naming
    // sixteen supported types and not this one.
    const { layer, points } = errorBarLayer(errorBarChart([THREE_INTERVALS]));

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    expect(points).toEqual([
      { x: 'a', y: 10, yMin: 8, yMax: 13 },
      { x: 'b', y: 20, yMin: 17, yMax: 22 },
      { x: 'c', y: 15, yMin: 14, yMax: 19 },
    ]);
  });

  it.each(['barWithErrorBars', 'lineWithErrorBars', 'scatterWithErrorBars'])(
    'reads %s the same way',
    (type) => {
      // The three cartesian controllers differ only in the mark drawn at the
      // estimate, which is not something a reader is told.
      const { layer, points } = errorBarLayer(errorBarChart([THREE_INTERVALS], { type }));

      expect(layer.type).toBe(TraceType.ERROR_BAR);
      expect(points.map(point => [point.y, point.yMin, point.yMax])).toEqual([
        [10, 8, 13],
        [20, 17, 22],
        [15, 14, 19],
      ]);
    },
  );

  it('names the axes from the chart rather than the generic pair', () => {
    const { layer } = errorBarLayer(errorBarChart([THREE_INTERVALS]));

    expect(layer.axes).toEqual({
      x: { label: 'Treatment' },
      y: { label: 'Response' },
    });
  });

  it('leaves the payload alone on a horizontal chart and says it is horizontal', () => {
    // `MaidrLayer.orientation` swaps `x` and `y` for the bar family and for
    // nothing else: an `error_bar` keeps the category on `x` and the
    // magnitudes on `y`/`yMin`/`yMax` either way, and `horz` moves only which
    // axis label the reading is announced against.
    //
    // The parse is where the horizontal case is resolved: measured, the
    // bounds and the value arrive on X and the category on Y.
    const horizontal: ChartJsParsedValue[] = [
      { y: 0, x: 10, xMin: 8, xMax: 13, xMinMin: 8, xMaxMax: 13 },
      { y: 1, x: 20, xMin: 17, xMax: 22, xMinMin: 17, xMaxMax: 22 },
    ];
    const { layer, points } = errorBarLayer(
      errorBarChart([horizontal], { labels: ['a', 'b'], indexAxis: 'y' }),
    );

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(points).toEqual([
      { x: 'a', y: 10, yMin: 8, yMax: 13 },
      { x: 'b', y: 20, yMin: 17, yMax: 22 },
    ]);
  });

  it('announces the outermost of a nested pair of intervals', () => {
    // The plugin draws a 95% inside a 99% from an array bound, and
    // `ErrorBarPoint.yMin` is one number. The outermost is the interval the
    // whiskers reach; the inner one is dropped, which is a real loss and not
    // a rounding.
    const nested: ChartJsParsedValue[] = [
      { x: 0, y: 10, yMin: [8, 7], yMax: [13, 14], yMinMin: 7, yMaxMax: 14 },
    ];
    const { points } = errorBarLayer(errorBarChart([nested], { labels: ['a'] }));

    expect(points).toEqual([{ x: 'a', y: 10, yMin: 7, yMax: 14 }]);
  });

  it.each([
    ['a plain-number datum, whose bounds parse to null', null],
    ['an object datum with no bounds at all', undefined],
  ])('announces no interval for %s', (_label, bound) => {
    // Both spellings mean "no whiskers", and neither is an interval of width
    // zero -- which is why the parse's own `yMinMin`/`yMaxMax` are not used
    // as a fallback here: measured, they are both the estimate itself.
    const bare: ChartJsParsedValue[] = [
      { x: 0, y: 10, yMinMin: 10, yMaxMax: 10, ...(bound === null ? { yMin: null, yMax: null } : {}) },
    ];
    const { points } = errorBarLayer(errorBarChart([bare], { labels: ['a'] }));

    expect(points).toEqual([{ x: 'a', y: 10 }]);
  });

  it('gives every estimate its group name when there is more than one dataset', () => {
    // #942 added `ErrorBarPoint.z` for exactly this: a dodged interval chart
    // puts two estimates at every category, and without a name they arrive as
    // two readings of one category with nothing telling them apart.
    const second: ChartJsParsedValue[] = [
      { x: 0, y: 30, yMin: 28, yMax: 33, yMinMin: 28, yMaxMax: 33 },
      { x: 1, y: 40, yMin: 37, yMax: 42, yMinMin: 37, yMaxMax: 42 },
      { x: 2, y: 35, yMin: 34, yMax: 39, yMinMin: 34, yMaxMax: 39 },
    ];
    const { series } = errorBarLayer(errorBarChart([THREE_INTERVALS, second]));

    expect(series).toHaveLength(2);
    expect(series[0].every(point => point.z === 'S1')).toBe(true);
    expect(series[1].every(point => point.z === 'S2')).toBe(true);
    expect(series[1].map(point => point.y)).toEqual([30, 40, 35]);
  });

  it('names no group on a single-dataset chart', () => {
    // One group needs no name for itself, and `z` is documented as meaningful
    // on the grouped shape.
    const { points } = errorBarLayer(errorBarChart([THREE_INTERVALS]));

    expect(points.every(point => point.z === undefined)).toBe(true);
  });

  it('reads a reversed category axis in the order it is drawn', () => {
    // The family of bugs #1024 closed: `chart.data.labels` and the datasets
    // stay in the written order while the axis is drawn from the far end, and
    // `ErrorBarTrace` announces `layer.data` as it arrives.
    const { points } = errorBarLayer(errorBarChart([THREE_INTERVALS], { reverse: true }));

    expect(points.map(point => point.x)).toEqual(['c', 'b', 'a']);
    expect(points.map(point => point.y)).toEqual([15, 20, 10]);
  });

  it('outlines the mark the payload announces, in that same drawn order', () => {
    // The half an accessibility suite cannot hear: audio, text and braille
    // read from the payload while the highlight is resolved by index, so a
    // table built by a different walk lights up a different mark.
    const chart = errorBarChart([THREE_INTERVALS], { reverse: true });
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const targets = [0, 1, 2].map(col =>
      resolveActiveTargets(layers, maps, extraction.layerDatasetIndices, layers[0].id, 0, col));

    expect(targets).toEqual([
      [{ datasetIndex: 0, index: 2 }],
      [{ datasetIndex: 0, index: 1 }],
      [{ datasetIndex: 0, index: 0 }],
    ]);
  });

  it('outlines the right dataset when there are several', () => {
    const second: ChartJsParsedValue[] = [
      { x: 0, y: 30, yMin: 28, yMax: 33, yMinMin: 28, yMaxMax: 33 },
      { x: 1, y: 40, yMin: 37, yMax: 42, yMinMin: 37, yMaxMax: 42 },
      { x: 2, y: 35, yMin: 34, yMax: 39, yMinMin: 34, yMaxMax: 39 },
    ];
    const chart = errorBarChart([THREE_INTERVALS, second]);
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const first = resolveActiveTargets(
      layers,
      maps,
      extraction.layerDatasetIndices,
      layers[0].id,
      0,
      1,
    );
    const other = resolveActiveTargets(
      layers,
      maps,
      extraction.layerDatasetIndices,
      layers[0].id,
      1,
      1,
    );

    expect(first).toEqual([{ datasetIndex: 0, index: 1 }]);
    expect(other).toEqual([{ datasetIndex: 1, index: 1 }]);
  });

  it('keeps a drawing dataset paired with its own row when another draws nothing', () => {
    // A dataset that contributed no points emits no row, so the default
    // "every dataset, in order" would put the survivor's row one place out
    // and outline the empty dataset instead.
    const chart = errorBarChart([[], THREE_INTERVALS]);
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const { series } = errorBarLayer(chart);
    expect(series).toHaveLength(1);
    expect(resolveActiveTargets(
      layers,
      maps,
      extraction.layerDatasetIndices,
      layers[0].id,
      0,
      1,
    )).toEqual([{ datasetIndex: 1, index: 1 }]);
  });

  it('still refuses polarAreaWithErrorBars, and says so', () => {
    // The plugin's fourth controller draws wedges with radial whiskers, and
    // `RadarTrace` reads a spoke as `{x: angle, y: radius}` with nowhere to
    // put a bound. Reading it as a polar area would announce the estimate and
    // drop the uncertainty the chart was drawn for, so it keeps the explicit
    // refusal rather than gaining a lossy reading.
    const chart = errorBarChart(
      [[{ y: 10 }, { y: 20 }]],
      { type: 'polarAreaWithErrorBars', labels: ['N', 'E'] },
    );

    expect(() => extractChartData(chart)).toThrow(/polarAreaWithErrorBars/);
  });
});
