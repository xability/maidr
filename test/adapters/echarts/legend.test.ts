import type { EChartsComponentGroup, EChartsInstance, EChartsSeriesModel } from '@adapters/echarts/types';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';

/**
 * A legend's icons are not marks (#1315).
 *
 * ECharts paints a legend icon exactly as the series it stands for and draws
 * it after the series, so the paint-and-order search in `selectors.ts` took
 * it for one more mark. Measured on echarts 6.1.0 in Chromium, SVG renderer,
 * with the legend shown -- which is its default in echarts4r and in any
 * option that declares `legend: {}`:
 *
 *     five bars      expected 5, found 6
 *     one line       expected 1, found 3
 *     32 points      expected 32, found 33
 *
 * and each chart lost its highlighting to the mismatch. The icons are told
 * apart by where they are: inside the box the legend's view drew.
 *
 * jsdom lays nothing out, so every element here is given the box Chromium
 * measured for its counterpart: a 600x400 chart, five bars in the plot, and a
 * legend at the bottom, drawn by a group translated to (281.66, 359.32) with a
 * local bounding rect of (-5, -5, 46.67, 30.68).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const VALUES = [20, 14, 23, 25, 22];

interface Box { x: number; y: number; width: number; height: number }

function place(element: Element, box: Box): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      x: box.x,
      y: box.y,
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      right: box.x + box.width,
      bottom: box.y + box.height,
    }),
  });
}

/** The measured drawing: gridline, five bars, then the legend's three pieces. */
function drawnChart(): { container: HTMLElement; legendIcon: Element } {
  const dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  place(svg, { x: 0, y: 0, width: 600, height: 400 });

  const add = (attributes: Record<string, string>, box: Box): Element => {
    const path = doc.createElementNS(SVG_NS, 'path');
    Object.entries(attributes).forEach(([key, value]) => path.setAttribute(key, value));
    place(path, box);
    svg.appendChild(path);
    return path;
  };

  add({ fill: 'none', stroke: '#dbdee4' }, { x: 90, y: 321, width: 450, height: 0 });
  VALUES.forEach((_, index) =>
    add({ fill: '#5070dd' }, { x: 104 + 90 * index, y: 100, width: 62, height: 200 }));
  // The legend's background, its icon in the series colour, and its hit area.
  add({ 'fill': 'rgb(0,0,0)', 'stroke': '#b7b9be', 'stroke-width': '0' }, { x: 277, y: 354, width: 47, height: 31 });
  const legendIcon = add({ fill: '#5070dd' }, { x: 282, y: 363, width: 25, height: 14 });
  add({ fill: 'none' }, { x: 282, y: 359, width: 37, height: 21 });

  container.appendChild(svg);
  doc.body.appendChild(container);
  return { container, legendIcon };
}

function barSeries(): EChartsSeriesModel {
  return {
    subType: 'bar',
    name: 'n',
    getData: () => ({
      dimensions: ['x', 'y'],
      count: () => VALUES.length,
      getName: index => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][index],
      get: (dimension, index) => (dimension === 'y' ? VALUES[index] : index),
    }),
    get: key => (key === 'name' ? 'n' : undefined),
  };
}

const LEGEND_GROUP: EChartsComponentGroup = {
  getBoundingRect: () => ({ x: -5, y: -5, width: 46.67, height: 30.68 }),
  getComputedTransform: () => [1, 0, 0, 1, 281.66, 359.32],
};

function chartWith(legend: EChartsComponentGroup | null): EChartsInstance {
  const components: Record<string, Record<string, unknown>[]> = {
    xAxis: [{ type: 'category' }],
    yAxis: [{ type: 'value' }],
    legend: legend ? [{}] : [],
  };
  return {
    getModel: () => ({
      eachSeries: callback => callback(barSeries(), 0),
      eachComponent: (query, callback) => {
        (components[query.mainType] ?? []).forEach((options, index) =>
          callback({ get: key => options[key] }, index));
      },
    }),
    ...(legend ? { getViewOfComponentModel: () => ({ group: legend }) } : {}),
  };
}

function barSelectors(chart: EChartsInstance, container: HTMLElement): string[] | undefined {
  const layer = createMaidrFromEChart(chart, container).subplots[0][0].layers[0];
  return layer.selectors as string[] | undefined;
}

describe('an ECharts legend', () => {
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('is not counted as a mark, so the bars keep their highlighting', () => {
    const { container, legendIcon } = drawnChart();

    const selectors = barSelectors(chartWith(LEGEND_GROUP), container);

    expect(warn).not.toHaveBeenCalled();
    expect(selectors).toHaveLength(VALUES.length);
    const marks = (selectors ?? []).map(selector =>
      container.ownerDocument.querySelector(selector));
    expect(marks.every(mark => mark !== null && mark !== legendIcon)).toBe(true);
    expect(legendIcon.hasAttribute('data-maidr-echart-legend')).toBe(true);
  });

  it('is counted as before when the instance cannot say where it drew', () => {
    const { container } = drawnChart();

    const selectors = barSelectors(chartWith(null), container);

    expect(selectors).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expected 5, found 6'));
  });

  it('that is hidden sets nothing aside', () => {
    const { container, legendIcon } = drawnChart();
    const hidden: EChartsComponentGroup = {
      getBoundingRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    };

    barSelectors(chartWith(hidden), container);

    expect(legendIcon.hasAttribute('data-maidr-echart-legend')).toBe(false);
  });

  it('is found where it is now when the chart is read again', () => {
    const { container, legendIcon } = drawnChart();
    barSelectors(chartWith(LEGEND_GROUP), container);

    // Moved to the top-left corner, clear of the icon measured at the bottom.
    const moved: EChartsComponentGroup = {
      getBoundingRect: () => ({ x: -5, y: -5, width: 46.67, height: 30.68 }),
      x: 10,
      y: 10,
    };
    barSelectors(chartWith(moved), container);

    expect(legendIcon.hasAttribute('data-maidr-echart-legend')).toBe(false);
  });
});
