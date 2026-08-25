/**
 * The Chart.js adapter refused funnels, though `funnel` has existed since
 * #791 (#1178).
 *
 * `chartjs-chart-funnel` is one of three plugin families the adapter still
 * threw on. An identical funnel drawn in amCharts, AnyChart, Google Charts or
 * Highcharts was navigable; only a Chart.js one raised.
 *
 * Measured against a running chart -- `chart.js@4.5` with
 * `chartjs-chart-funnel@4`, driven headlessly through Chart.js's own
 * `BasicPlatform` -- and the reading is the bar family's own walk:
 *
 *     plain           parsed [{x:0, y:100}, {x:1, y:40}, {x:2, y:10}]
 *     indexAxis: 'y'  parsed [{y:0, x:100}, {y:1, x:40}, {y:2, x:10}]
 *     object data     [{x, y}] rows parse to the same thing
 *     a null stage    parses to `y: null`
 *     two datasets    each parses independently, three elements each
 *
 * Three things follow, and each is a fact about the plugin rather than a
 * choice:
 *
 *   - the **raw** rows are what is read, not the parse. Both spellings --
 *     plain numbers and `{x, y}` -- are what `toFiniteNumber` already takes,
 *     and unlike the error-bar controllers the horizontal case needs nothing
 *     extra: `indexAxis: 'y'` leaves `dataset.data` untouched and moves only
 *     the parse.
 *
 *   - `funnel` is in the bar family the grammar's `orientation` table names,
 *     so `horz` exchanges `x` and `y` in the payload -- which
 *     `singleDatasetToBarLayer` already does.
 *
 *   - **two datasets are two funnels.** A funnel is one population shrinking
 *     across ordered stages, so a second series is a second population rather
 *     than a second segment of the first -- the reading the amCharts adapter
 *     gives its own funnel series.
 */
import type { ChartJsChart, ChartJsDataset, ChartJsDataValue } from '@adapters/chartjs/types';
import type { BarPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';

interface FunnelOptions {
  labels?: (string | number)[];
  indexAxis?: 'x' | 'y';
  reverse?: boolean;
}

/**
 * A funnel chart as Chart.js leaves it after `update()`.
 *
 * @param datasets - One entry per drawn funnel, its rows as the caller wrote them
 * @param options - The stage names and the axis settings
 * @returns The chart
 */
function funnelChart(
  datasets: ChartJsDataValue[][],
  options: FunnelOptions = {},
): ChartJsChart {
  const { labels = ['visit', 'cart', 'buy'], indexAxis, reverse } = options;
  const categoryAxis = indexAxis === 'y' ? 'y' : 'x';
  return {
    canvas: {} as HTMLCanvasElement,
    data: {
      labels,
      datasets: datasets.map((data, index) => ({
        label: `F${index + 1}`,
        data,
      })) as unknown as ChartJsDataset[],
    },
    options: {
      plugins: {},
      ...(indexAxis ? { indexAxis } : {}),
      scales: {
        x: { title: { text: 'Stage' } },
        y: { title: { text: 'Users' } },
        ...(reverse ? { [categoryAxis]: { reverse: true } } : {}),
      },
    },
    config: { type: 'funnel' },
    getDatasetMeta: () => ({ data: [], type: 'funnel' }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** Every layer of a funnel chart, as `(type, points)`. */
function funnelLayers(chart: ChartJsChart): { layer: any; points: BarPoint[] }[] {
  return extractChartData(chart).maidr.subplots[0][0].layers.map(layer => ({
    layer,
    points: layer.data as BarPoint[],
  }));
}

describe('chart.js funnel', () => {
  it('reads a funnel as a funnel rather than raising', () => {
    // The reproduction. Before this the dispatcher's default threw, naming
    // every supported type and not this one.
    const [{ layer, points }] = funnelLayers(funnelChart([[100, 40, 10]]));

    expect(layer.type).toBe(TraceType.FUNNEL);
    expect(points).toEqual([
      { x: 'visit', y: 100 },
      { x: 'cart', y: 40 },
      { x: 'buy', y: 10 },
    ]);
  });

  it('names the axes from the chart rather than the generic pair', () => {
    const [{ layer }] = funnelLayers(funnelChart([[100, 40, 10]]));

    expect(layer.axes).toEqual({
      x: { label: 'Stage' },
      y: { label: 'Users' },
    });
  });

  it('reads rows written as objects the same way', () => {
    // The plugin takes both spellings, and `toFiniteNumber` reads `.y` off
    // the object form -- so nothing here has to know which was written.
    const rows = [{ x: 0, y: 100 }, { x: 1, y: 40 }, { x: 2, y: 10 }];
    const [{ points }] = funnelLayers(funnelChart([rows as ChartJsDataValue[]]));

    expect(points.map(point => point.y)).toEqual([100, 40, 10]);
  });

  it('exchanges the payload on a sideways funnel and says it is horizontal', () => {
    // `funnel` is in the bar family, which is the half of the `orientation`
    // table that swaps `x` and `y`: `x` becomes the magnitude and `y` the
    // stage. Getting this wrong puts a stage name where the trace expects a
    // number and the chart sounds with no magnitude at all.
    const [{ layer, points }] = funnelLayers(
      funnelChart([[100, 40, 10]], { indexAxis: 'y' }),
    );

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(points).toEqual([
      { x: 100, y: 'visit' },
      { x: 40, y: 'cart' },
      { x: 10, y: 'buy' },
    ]);
  });

  it('skips a stage with no value rather than announcing a zero', () => {
    // Measured, a `null` row parses to `y: null`. Announcing it as 0 would
    // sonify a stage the chart draws nothing for.
    const [{ points }] = funnelLayers(funnelChart([[100, null, 10]]));

    expect(points).toEqual([
      { x: 'visit', y: 100 },
      { x: 'buy', y: 10 },
    ]);
  });

  it('reads two datasets as two funnels', () => {
    // Not a segmented bar: a funnel is one population shrinking across
    // ordered stages, so a second series is a second population.
    const layers = funnelLayers(funnelChart([[100, 40, 10], [80, 30, 5]]));

    expect(layers).toHaveLength(2);
    expect(layers.every(({ layer }) => layer.type === TraceType.FUNNEL)).toBe(true);
    expect(layers[0].points.map(point => point.y)).toEqual([100, 40, 10]);
    expect(layers[1].points.map(point => point.y)).toEqual([80, 30, 5]);
  });

  it('reads a reversed stage axis in the order it is drawn', () => {
    // The family of bugs #1024 closed: `chart.data.labels` and the dataset
    // stay in the written order while the axis is drawn from the far end.
    const [{ points }] = funnelLayers(funnelChart([[100, 40, 10]], { reverse: true }));

    expect(points.map(point => point.x)).toEqual(['buy', 'cart', 'visit']);
    expect(points.map(point => point.y)).toEqual([10, 40, 100]);
  });

  it('outlines the stage the payload announces, in that same drawn order', () => {
    const chart = funnelChart([[100, 40, 10]], { reverse: true });
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

  it('outlines each funnel in its own dataset', () => {
    // The per-type default is "every dataset, in order", which hands both
    // layers the same first dataset -- so the second funnel would outline the
    // first one's stages. The extractor records the mapping instead.
    const chart = funnelChart([[100, 40, 10], [80, 30, 5]]);
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
    const second = resolveActiveTargets(
      layers,
      maps,
      extraction.layerDatasetIndices,
      layers[1].id,
      0,
      1,
    );

    expect(first).toEqual([{ datasetIndex: 0, index: 1 }]);
    expect(second).toEqual([{ datasetIndex: 1, index: 1 }]);
  });
});
