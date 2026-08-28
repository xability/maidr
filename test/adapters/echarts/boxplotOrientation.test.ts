import type {
  EChartsInstance,
  EChartsList,
  EChartsSeriesModel,
} from '@adapters/echarts/types';
import type { MaidrLayer } from '@type/grammar';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * An ECharts box plot drawn on its side was read as an upright one.
 *
 * ECharts has no "horizontal" option: a chart is turned on its side by making
 * the **y** axis the categorical one, which `axisNames` has read for the bar
 * family since the adapter existed — `bar`, `stacked_bar` and `dodged_bar` all
 * come out `horz` from it. `boxplotLayer` was never handed the answer, so a
 * distribution turned the same way came out declaring nothing, which resolves
 * to `vert`.
 *
 * Measured in Chromium on echarts 5, the same three summaries once each way,
 * through `createMaidrFromEChart`:
 *
 *   axes                                    bar        boxplot
 *   xAxis category, yAxis value             vert       (none) = vert
 *   yAxis category, xAxis value             horz       (none) = vert   <- wrong
 *
 * The summary itself does not move — a `BoxPoint` carries no `x`/`y` pair to
 * exchange — and neither do the axis titles, which ECharts writes beside the
 * axes as drawn. What the key changes is the reading: `BoxTrace` takes the
 * group off `axes.y` and the measurement off `axes.x` when the layer is
 * horizontal, and walks the sections of one distribution with the left and
 * right arrows rather than walking across the distributions.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One box: a category and its five numbers. */
interface Box {
  name: string;
  values: number[];
}

const DIMENSIONS = ['base', 'min', 'Q1', 'median', 'Q3', 'max'];

const TWO: Box[] = [
  { name: 'alpha', values: [0, 1, 2, 3, 4, 5] },
  { name: 'bravo', values: [1, 2, 3, 4, 5, 6] },
];

/**
 * A drawn box plot, upright or on its side.
 *
 * @param horizontal - Whether the categories were put on the y axis
 * @returns The chart instance
 */
function boxplotChart(horizontal: boolean): EChartsInstance {
  const list: EChartsList = {
    dimensions: DIMENSIONS,
    count: () => TWO.length,
    getName: index => TWO[index].name,
    get: (dimension, index) => TWO[index].values[DIMENSIONS.indexOf(dimension)],
  };

  const series: EChartsSeriesModel = {
    subType: 'boxplot',
    name: 'Samples',
    getData: () => list,
    get: key => (key === 'name' ? 'Samples' : undefined),
  };

  // Whichever axis carries the categories is titled `Group`, and the other
  // `Value` -- ECharts writes each title beside the axis as drawn.
  const category = { name: 'Group', type: 'category' };
  const value = { name: 'Value', type: 'value' };
  const components: Record<string, Record<string, unknown>[]> = {
    xAxis: [horizontal ? value : category],
    yAxis: [horizontal ? category : value],
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

/** A drawn box plot: one filled path per box, plus the gridlines. */
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
  for (let index = 0; index < boxes; index++) {
    add({ fill: '#5070dd', stroke: '#5070dd' });
  }

  container.appendChild(svg);
  return container;
}

/**
 * The layer one box plot converts to.
 * @param horizontal - Whether the categories were put on the y axis
 * @returns The emitted layer
 */
function layerFor(horizontal: boolean): MaidrLayer {
  return createMaidrFromEChart(
    boxplotChart(horizontal),
    drawnBoxplot(TWO.length),
  ).subplots[0][0].layers[0];
}

describe('an upright ECharts box plot', () => {
  it('says nothing about orientation, which is `vert`', () => {
    const layer = layerFor(false);

    expect(layer.type).toBe(TraceType.BOX);
    expect(layer.orientation).toBeUndefined();
  });
});

describe('an ECharts box plot with its categories on the y axis', () => {
  it('says it is drawn sideways', () => {
    expect(layerFor(true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('keeps the axis titles as ECharts wrote them', () => {
    // No swap: ECharts titles each axis where it is drawn, so the category
    // axis is already `axes.y` on a sideways chart -- which is where
    // `BoxTrace` looks for the group.
    expect(layerFor(true).axes).toEqual({
      x: { label: 'Value' },
      y: { label: 'Group' },
    });
  });

  it('leaves the five numbers exactly where they were', () => {
    expect(layerFor(true).data).toEqual(layerFor(false).data);
  });
});
