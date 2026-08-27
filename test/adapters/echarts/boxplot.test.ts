import type {
  EChartsInstance,
  EChartsList,
  EChartsSeriesModel,
} from '@adapters/echarts/types';
import type { BoxPoint } from '@type/grammar';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * A box plot was refused by name, and unlike `radar` the reason recorded for
 * it was right — but it was the reason to withhold the *outline*, not the
 * reason to withhold the *reading*.
 *
 * ECharts hands the five-number summary over outright, as
 * `['base', 'min', 'Q1', 'median', 'Q3', 'max']`, so the values need no
 * deriving. What cannot be had is the highlight: `BoxSelector` wants a
 * selector per part and ECharts draws box and both whiskers as one path.
 * Colour-tagged, a two-box chart yields exactly two filled paths, each `d`
 * running box-rectangle, `Z`, then whiskers:
 *
 *     M177.5 234.59 L227.5 234.59 L227.5 150.41 L177.5 150.41 Z M202.5 27…
 *
 * So it is read without an outline, which is what `gauge`, `sankey`, `graph`,
 * `parallel` and `themeRiver` already do.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One box: a category and its five numbers, any of which may be missing. */
interface Box {
  name: string;
  values: (number | null)[];
}

const DIMENSIONS = ['base', 'min', 'Q1', 'median', 'Q3', 'max'];

function boxplotChart(
  boxes: Box[],
  options: { seriesName?: string; xName?: string; yName?: string } = {},
): EChartsInstance {
  const list: EChartsList = {
    dimensions: DIMENSIONS,
    count: () => boxes.length,
    getName: index => boxes[index].name,
    get: (dimension, index) =>
      boxes[index].values[DIMENSIONS.indexOf(dimension)],
  };

  const series: EChartsSeriesModel = {
    subType: 'boxplot',
    name: options.seriesName ?? 'series 0',
    getData: () => list,
    get: key => (key === 'name' ? options.seriesName : undefined),
  };

  const components: Record<string, Record<string, unknown>[]> = {
    xAxis: [{ name: options.xName, type: 'category' }],
    yAxis: [{ name: options.yName, type: 'value' }],
    title: [],
  };

  return {
    getModel: () => ({
      eachSeries: callback => callback(series, 0),
      eachComponent: (query, callback) => {
        (components[query.mainType] ?? []).forEach((opts, index) =>
          callback({ get: key => opts[key] }, index));
      },
    }),
  };
}

/** A drawn box plot: `boxes` filled paths, plus the gridlines around them. */
function drawnBoxplot(boxes: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');

  const add = (attributes: Record<string, string>): void => {
    const path = doc.createElementNS(SVG_NS, 'path');
    Object.entries(attributes).forEach(([key, value]) =>
      path.setAttribute(key, value));
    svg.appendChild(path);
  };

  add({ fill: 'none', stroke: '#dbdee4' });
  add({ fill: 'none', stroke: '#54555a' });
  // One filled path per box — box AND whiskers together.
  for (let index = 0; index < boxes; index++) {
    add({ fill: '#5070dd', stroke: '#5070dd' });
  }

  container.appendChild(svg);
  return container;
}

function layersOf(chart: EChartsInstance, container: HTMLElement) {
  return createMaidrFromEChart(chart, container).subplots[0][0].layers;
}

const TWO: Box[] = [
  { name: 'A', values: [0, 1, 2, 3, 4, 5] },
  { name: 'B', values: [1, 2, 3, 4, 5, 6] },
];

describe('an eCharts box plot', () => {
  it('is read as a box rather than refused', () => {
    // The reproduction: before this, `createMaidrFromEChart` threw
    // "Unsupported ECharts series type(s): boxplot".
    const layers = layersOf(boxplotChart(TWO, { seriesName: 'B' }), drawnBoxplot(2));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.BOX);
    expect(layers[0].name).toBe('B');
  });

  it('transcribes the five numbers it was handed', () => {
    // Nothing is derived from the drawing: the summary is already computed,
    // and `min`/`Q1`/`median`/`Q3`/`max` map straight onto the trace.
    const data = layersOf(boxplotChart(TWO), drawnBoxplot(2))[0].data as BoxPoint[];

    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({
      z: 'A',
      lowerOutliers: [],
      min: 1,
      q1: 2,
      q2: 3,
      q3: 4,
      max: 5,
      upperOutliers: [],
    });
  });

  it('names each box by its category', () => {
    const data = layersOf(boxplotChart(TWO), drawnBoxplot(2))[0].data as BoxPoint[];

    expect(data.map(box => box.z)).toEqual(['A', 'B']);
  });

  it('names an unnamed box by position rather than not at all', () => {
    const data = layersOf(
      boxplotChart([{ name: '', values: [0, 1, 2, 3, 4, 5] }]),
      drawnBoxplot(1),
    )[0].data as BoxPoint[];

    expect(data[0].z).toBe('1');
  });

  it('carries no outliers, because the series holds none', () => {
    // ECharts draws outliers as a SEPARATE scatter series by its own
    // convention, so a boxplot series has no dimension holding them.
    // Inventing any would announce marks this series never drew.
    const data = layersOf(boxplotChart(TWO), drawnBoxplot(2))[0].data as BoxPoint[];

    expect(data.every(box => box.lowerOutliers.length === 0)).toBe(true);
    expect(data.every(box => box.upperOutliers.length === 0)).toBe(true);
  });

  it('drops a box short of one of its five numbers', () => {
    // Half a summary is not a box: announcing it would put a `null` where a
    // quartile belongs and read as a value.
    const data = layersOf(
      boxplotChart([
        { name: 'whole', values: [0, 1, 2, 3, 4, 5] },
        { name: 'partial', values: [1, 2, null, 4, 5, 6] },
      ]),
      drawnBoxplot(2),
    )[0].data as BoxPoint[];

    expect(data.map(box => box.z)).toEqual(['whole']);
  });

  it('is read without an outline', () => {
    // Measured: box and both whiskers are one path, so there is nothing to
    // give `BoxSelector` its per-part selectors. The fixture draws exactly
    // that — one filled path per box — and the reading still declines it.
    expect(layersOf(boxplotChart(TWO), drawnBoxplot(2))[0].selectors)
      .toBeUndefined();
  });

  it('does not consume a mark slot from a series drawn beside it', () => {
    // The failure this guards: a boxplot's one-path-per-box would otherwise
    // be counted into the per-datum mark pool, spending slots and shifting
    // every later series' selectors onto the wrong elements.
    const chart: EChartsInstance = {
      getModel: () => ({
        eachSeries: (callback) => {
          const boxes: EChartsList = {
            dimensions: DIMENSIONS,
            count: () => 2,
            getName: index => TWO[index].name,
            get: (dimension, index) =>
              TWO[index].values[DIMENSIONS.indexOf(dimension)],
          };
          callback({
            subType: 'boxplot',
            name: 'boxes',
            getData: () => boxes,
            get: () => undefined,
          }, 0);

          const bars: EChartsList = {
            dimensions: ['x', 'y'],
            count: () => 3,
            getName: index => ['p', 'q', 'r'][index],
            get: (dimension, index) => (dimension === 'y' ? [7, 8, 9][index] : index),
          };
          callback({
            subType: 'bar',
            name: 'bars',
            getData: () => bars,
            get: () => undefined,
          }, 1);
        },
        eachComponent: (query, callback) => {
          const components: Record<string, Record<string, unknown>[]> = {
            xAxis: [{ type: 'category' }],
            yAxis: [{ type: 'value' }],
            title: [],
          };
          (components[query.mainType] ?? []).forEach((opts, index) =>
            callback({ get: key => opts[key] }, index));
        },
      }),
    };

    // Three bar marks drawn, and nothing else the pool should see.
    const layers = layersOf(chart, drawnBoxplot(3));
    const bar = layers.find(layer => layer.type === TraceType.BAR);

    expect(bar).toBeDefined();
    expect(bar?.selectors).toHaveLength(3);
  });
});
