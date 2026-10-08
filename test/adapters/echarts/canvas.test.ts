/**
 * @jest-environment jsdom
 */

/**
 * A chart ECharts drew to a canvas, given marks to point at (#1304).
 *
 * ECharts' default renderer is a canvas, and Apache Superset registers no
 * other, so every Superset chart read correctly and highlighted nothing. The
 * model knows where each mark is -- `getItemLayout` -- so an SVG of them is
 * laid over the canvas and the SVG path finds them there. These cases check
 * that the overlay agrees with what the readings count, and that it leaves an
 * SVG chart alone.
 *
 * The layouts are the shapes measured on echarts 6.1.0; see `canvas.ts`.
 */

import type { EChartsInstance, EChartsList, EChartsSeriesModel, EChartsTreeNode } from '@adapters/echarts/types';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

interface FakeSeries {
  type: string;
  values: (number | null)[];
  layouts?: unknown[];
  points?: (number | null)[];
  options?: Record<string, unknown>;
  tree?: EChartsTreeNode;
}

function fakeList(series: FakeSeries): EChartsList {
  return {
    dimensions: series.type === 'pie' || series.type === 'funnel' ? ['value'] : ['x', 'y'],
    count: () => series.values.length,
    getName: index => `c${index}`,
    get: (dimension, index) =>
      (dimension === 'x' ? index : series.values[index]),
    getItemLayout: index => series.layouts?.[index],
    getLayout: key => (key === 'points' ? series.points : undefined),
    getItemVisual: (_, key) => (key === 'style' ? { fill: '#5070dd' } : 10),
    getVisual: () => ({ fill: '#5070dd' }),
    ...(series.tree ? { tree: { root: series.tree } } : {}),
  };
}

function fakeInstance(series: FakeSeries[]): EChartsInstance {
  return {
    getModel: () => ({
      eachSeries: (callback) => {
        series.forEach((one, index) => callback({
          subType: one.type,
          name: `series${index}`,
          getData: () => fakeList(one),
          get: key => one.options?.[key],
        } as EChartsSeriesModel, index));
      },
      eachComponent: (query, callback) => {
        const components: Record<string, Record<string, unknown>[]> = {
          xAxis: [{ type: 'category' }],
          yAxis: [{ type: 'value' }],
        };
        (components[query.mainType] ?? []).forEach((options, index) =>
          callback({ get: key => options[key] }, index));
      },
    }),
  };
}

/** The document ECharts leaves behind for a canvas chart. */
function canvasChart(): HTMLElement {
  document.body.innerHTML
    = '<div id="host"><div style="position: relative"><canvas width="600" height="400"></canvas></div></div>';
  return document.querySelector('#host > div') as HTMLElement;
}

const BAR = { x: 10, y: 300, width: 40, height: -100 };

const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('a chart drawn to a canvas', () => {
  it('points each bar at a mark in an overlay laid over the canvas', () => {
    const root = canvasChart();
    const chart = fakeInstance([{
      type: 'bar',
      values: [1, 2],
      layouts: [BAR, { ...BAR, x: 60, height: -200 }],
    }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    const overlay = root.querySelector('svg[data-maidr-echart-overlay]');
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    const marks = (layer.selectors as string[]).map(selector => document.querySelector(selector));
    expect(marks.every(mark => mark?.parentElement === overlay)).toBe(true);
    // Upright, with ECharts' signed height made positive.
    expect(marks[1]?.getAttribute('y')).toBe('100');
    expect(marks[1]?.getAttribute('height')).toBe('200');
    // Invisible until MAIDR outlines it.
    expect(marks[0]?.getAttribute('fill-opacity')).toBe('0');
  });

  it('draws nothing for a datum with no value, so the counts agree', () => {
    const root = canvasChart();
    const chart = fakeInstance([{
      type: 'bar',
      values: [1, null, 3],
      layouts: [BAR, { ...BAR, height: null }, BAR],
    }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    expect(warnSpy).not.toHaveBeenCalled();
    expect(layer.selectors).toHaveLength(2);
  });

  it('strokes a line through its points, lifting the pen over a gap', () => {
    const root = canvasChart();
    const chart = fakeInstance([{
      type: 'line',
      values: [1, null, 3],
      points: [10, 20, 30, null, 50, 60],
    }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    const line = document.querySelector(layer.selectors as string);
    expect(line?.getAttribute('d')).toBe('M 10 20 M 50 60');
    expect(line?.getAttribute('stroke-width')).toBe('2');
  });

  it('draws a bar on a polar grid as the sector it is laid out as', () => {
    const root = canvasChart();
    const sector = { cx: 100, cy: 100, r0: 0, r: 50, startAngle: 0, endAngle: 1 };
    const chart = fakeInstance([{ type: 'bar', values: [1, 2], layouts: [sector, { ...sector, r: 80 }] }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    expect(warnSpy).not.toHaveBeenCalled();
    expect(document.querySelector((layer.selectors as string[])[1])?.tagName).toBe('path');
  });

  it('draws a pie slice as a wedge', () => {
    const root = canvasChart();
    const slice = { cx: 100, cy: 100, r0: 0, r: 50, startAngle: 0, endAngle: Math.PI / 2 };
    const chart = fakeInstance([{
      type: 'pie',
      values: [1, 3],
      layouts: [slice, { ...slice, startAngle: Math.PI / 2, endAngle: 2 * Math.PI }],
    }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    expect(document.querySelectorAll(layer.selectors as string)).toHaveLength(2);
    const first = document.querySelector(`${layer.selectors as string}`);
    expect(first?.getAttribute('d')).toMatch(/^M 150 100 A 50 50 0 0 1 .* L 100 100 Z$/);
  });

  it('draws a sunburst in the order its tree is walked, not its data', () => {
    const root = canvasChart();
    const wedge = (startAngle: number): unknown =>
      ({ cx: 0, cy: 0, r0: 10, r: 20, startAngle, endAngle: startAngle + 1 });
    const node = (name: string, value: number, layout: unknown, children?: EChartsTreeNode[]): EChartsTreeNode =>
      ({ name, getValue: () => value, getLayout: () => layout, ...(children ? { children } : {}) });
    const tree = node('', 3, undefined, [
      node('A', 2, wedge(0), [node('A1', 2, wedge(0.5))]),
      node('B', 1, wedge(2)),
    ]);
    const chart = fakeInstance([{ type: 'sunburst', values: [3, 2, 2, 1], tree }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    const drawn = (layer.selectors as string[]).map(selector =>
      document.querySelector(selector)?.getAttribute('d')?.split(' ').slice(1, 3).join(' '));
    // A, then its child A1, then B: each slice's first point is on the outer
    // ring at its own start angle.
    expect(drawn).toEqual([
      `${20 * Math.cos(0)} ${20 * Math.sin(0)}`,
      `${20 * Math.cos(0.5)} ${20 * Math.sin(0.5)}`,
      `${20 * Math.cos(2)} ${20 * Math.sin(2)}`,
    ]);
  });

  it('draws a funnel stage from its corners', () => {
    const root = canvasChart();
    const stage = { points: [[80, 60], [520, 60], [432, 197.5], [168, 197.5]] };
    const chart = fakeInstance([{ type: 'funnel', values: [100, 60], layouts: [stage, stage] }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    expect(warnSpy).not.toHaveBeenCalled();
    expect(document.querySelector((layer.selectors as string[])[0])?.getAttribute('d'))
      .toBe('M 80 60 L 520 60 L 432 197.5 L 168 197.5 Z');
  });

  it('draws a candle\'s body from its brush rectangle', () => {
    const root = canvasChart();
    const candle = { sign: 1, brushRect: { x: 146, y: 269, width: 112, height: -204 } };
    const chart = fakeInstance([{ type: 'candlestick', values: [1], layouts: [candle] }]);
    const prices: Record<string, number> = { open: 10, close: 20, lowest: 5, highest: 25 };
    const list = chart.getModel();
    const withPrices: EChartsInstance = {
      getModel: () => ({
        ...list,
        eachSeries: (callback) => {
          list.eachSeries((seriesModel, index) => {
            const data = seriesModel.getData();
            callback({
              ...seriesModel,
              getData: () => ({ ...data, dimensions: ['base', 'open', 'close', 'lowest', 'highest'], get: dimension => prices[dimension] ?? 0 }),
            }, index);
          });
        },
      }),
    };

    const [layer] = createMaidrFromEChart(withPrices, root).subplots[0][0].layers;

    expect(warnSpy).not.toHaveBeenCalled();
    const body = document.querySelector(((layer.selectors as { body: string[] }).body)[0]);
    expect([body?.getAttribute('y'), body?.getAttribute('height')]).toEqual(['65', '204']);
  });

  it('strokes a radar datum\'s polygon, one per datum', () => {
    const root = canvasChart();
    const polygon = [[300, 190], [282, 210], [326, 215], [300, 190]];
    const chart = fakeInstance([{ type: 'radar', values: [1, 2], layouts: [polygon, polygon] }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    expect(warnSpy).not.toHaveBeenCalled();
    const outline = document.querySelector((layer.selectors as string[])[1]);
    expect(outline?.getAttribute('stroke-width')).toBe('2');
    expect(outline?.getAttribute('d')).toMatch(/^M 300 190 L .* Z$/);
  });

  it('places a heatmap cell through its grid, a heatmap keeping no layout', () => {
    const root = canvasChart();
    const cells = [[0, 0, 1], [1, 0, 5], [0, 1, 2], [1, 1, null]];
    const chart: EChartsInstance = {
      getModel: () => ({
        eachSeries: (callback) => {
          callback({
            subType: 'heatmap',
            name: 'series0',
            get: () => undefined,
            coordinateSystem: {
              dataToPoint: ([column, row]) => [100 + column * 50, 300 - row * 40],
              getAxis: dimension => ({ getBandWidth: () => (dimension === 'x' ? 50 : 40) }),
            },
            getData: () => ({
              dimensions: ['x', 'y', 'value'],
              count: () => cells.length,
              getName: () => '',
              get: (dimension, index) => cells[index][['x', 'y', 'value'].indexOf(dimension)],
              getItemLayout: () => undefined,
            }),
          } as EChartsSeriesModel, 0);
        },
        eachComponent: (query, callback) => {
          const data: Record<string, string[]> = { xAxis: ['a', 'b'], yAxis: ['p', 'q'] };
          if (data[query.mainType]) {
            callback({ get: key => (key === 'data' ? data[query.mainType] : 'category') }, 0);
          }
        },
      }),
    };

    createMaidrFromEChart(chart, root);

    expect(warnSpy).not.toHaveBeenCalled();
    // Three cells with a value, each centred on its category pair.
    const drawn = Array.from(root.querySelectorAll('svg[data-maidr-echart-overlay] rect'))
      .map(rect => `${rect.getAttribute('x')},${rect.getAttribute('y')}`);
    expect(drawn).toEqual(['75,280', '125,280', '75,240']);
  });

  it('draws a directed graph s nodes through its view, after its arrowheads, and names them', () => {
    // A graph is laid out in its own view, which a fitted graph scales and
    // moves: measured, `[300, 250]` is drawn at `(350, 270)`. Each link draws
    // its arrowhead before any node is drawn, as the SVG renderer paints them.
    const root = canvasChart();
    const toView = ([x, y]: number[]): number[] => [x * 1.2 - 10, y * 1.2 - 30];
    const node = (dataIndex: number, id: string): { dataIndex: number; id: string } => ({ dataIndex, id });
    const nodes = [node(0, 'output'), node(1, 'input')];
    const layouts = [[300, 250], [50, 50]];
    const chart: EChartsInstance = {
      getModel: () => ({
        eachSeries: (callback) => {
          callback({
            subType: 'graph',
            name: 'series0',
            get: () => undefined,
            coordinateSystem: { dataToPoint: toView },
            getData: () => ({
              dimensions: ['value'],
              count: () => 2,
              getName: index => nodes[index].id,
              get: () => null,
              getItemLayout: index => layouts[index],
              getItemVisual: (_, key) => (key === 'style' ? { fill: '#5070dd' } : key === 'symbol' ? 'circle' : 10),
              graph: {
                nodes,
                edges: [{
                  node1: nodes[1],
                  node2: nodes[0],
                  getValue: () => null,
                  getLayout: () => [[50, 50], [296.875, 246.875]],
                  getVisual: (key: string) => ({
                    fromSymbol: 'none',
                    toSymbol: 'arrow',
                    toSymbolSize: 10,
                    style: { stroke: '#86878c' },
                  } as Record<string, unknown>)[key],
                }],
              },
            }),
          } as EChartsSeriesModel, 0);
        },
        eachComponent: () => {},
      }),
    };

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    expect(warnSpy).not.toHaveBeenCalled();
    const drawn = Array.from(root.querySelectorAll('svg[data-maidr-echart-overlay] circle'))
      .map(circle => `${circle.getAttribute('fill')}@${circle.getAttribute('cx')},${circle.getAttribute('cy')}`);
    expect(drawn).toEqual(['#86878c@346.25,266.25', '#5070dd@350,270', '#5070dd@50,30']);
    const named = (layer.selectors as string[]).map(selector =>
      document.querySelector(selector)?.getAttribute('cx'));
    expect(named).toEqual(['350', '50']);
  });

  it('keeps the same overlay when a later reading would draw the same marks', () => {
    const root = canvasChart();
    const chart = fakeInstance([{ type: 'bar', values: [1], layouts: [BAR] }]);

    createMaidrFromEChart(chart, root);
    const first = root.querySelector('svg[data-maidr-echart-overlay] rect');
    createMaidrFromEChart(chart, root);

    expect(root.querySelector('svg[data-maidr-echart-overlay] rect')).toBe(first);
    expect(root.querySelectorAll('svg[data-maidr-echart-overlay]')).toHaveLength(1);
  });

  it('replaces the overlay when the chart was drawn again elsewhere', () => {
    const root = canvasChart();
    const layouts = [BAR];
    const chart = fakeInstance([{ type: 'bar', values: [1], layouts }]);

    createMaidrFromEChart(chart, root);
    layouts[0] = { ...BAR, x: 200 };
    createMaidrFromEChart(chart, root);

    const overlays = root.querySelectorAll('svg[data-maidr-echart-overlay]');
    expect(overlays).toHaveLength(1);
    expect(overlays[0].querySelector('rect')?.getAttribute('x')).toBe('200');
  });

  it('loses its outline, as before, for a series the overlay cannot draw', () => {
    const root = canvasChart();
    const chart = fakeInstance([
      { type: 'bar', values: [1], layouts: [BAR] },
      { type: 'candlestick', values: [1], layouts: [{}] },
    ]);

    const layers = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    expect(warnSpy).toHaveBeenCalled();
    expect(layers.every(layer => layer.selectors === undefined)).toBe(true);
  });
});

describe('a chart drawn as SVG', () => {
  it('is given no overlay', () => {
    document.body.innerHTML
      = '<div id="host"><div><svg><path fill="#5070dd" d="M0 0"></path></svg></div></div>';
    const root = document.querySelector('#host > div') as HTMLElement;
    const chart = fakeInstance([{ type: 'bar', values: [1], layouts: [BAR] }]);

    const [layer] = createMaidrFromEChart(chart, root).subplots[0][0].layers;

    expect(root.querySelector('svg[data-maidr-echart-overlay]')).toBeNull();
    expect(document.querySelector((layer.selectors as string[])[0])?.tagName).toBe('path');
  });
});
