import type { EChartsAdapterOptions } from '@adapters/echarts/converters';
import type { EChartsInstance } from '@adapters/echarts/types';
import type { MaidrLayer, PercentileBandPoint } from '@type/grammar';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import * as echarts from 'echarts';
import { JSDOM } from 'jsdom';
import { withPageDocument } from '../d3/pageDocument';

/**
 * A fan chart as ECharts draws one: each band a `line` with `areaStyle`
 * stacked on an invisible `line` holding its lower edge, and the median a
 * plain `line`. Every case is drawn by the real echarts 6.1.0 renderer,
 * server-side into an SVG string.
 */

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

beforeEach(() => {
  warn.mockClear();
});

const STEPS = ['0', '1', '2'];
const MEDIAN = [0, 1, 2];

/** A band of the given half-width around the median, as its base and width series. */
function band(name: string, halfWidth: number, extra: object = {}): object[] {
  const stack = `stack-${name}`;
  return [
    {
      type: 'line',
      name: `${name} base`,
      stack,
      stackStrategy: 'all',
      data: MEDIAN.map(m => m - halfWidth),
      lineStyle: { opacity: 0 },
      symbol: 'none',
    },
    {
      type: 'line',
      name,
      stack,
      stackStrategy: 'all',
      data: MEDIAN.map(() => 2 * halfWidth),
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0.3 },
      symbol: 'none',
      ...extra,
    },
  ];
}

const FAN = [
  ...band('p5-p95', 2),
  ...band('p25-p75', 1),
  { type: 'line', name: 'Median', data: MEDIAN },
];

const BANDS: EChartsAdapterOptions['percentileBands'] = [{
  median: 'Median',
  bands: [
    { series: 'p25-p75', lower: 0.25, upper: 0.75 },
    { series: 'p5-p95', lower: 0.05, upper: 0.95 },
  ],
}];

function render(series: object[], options: EChartsAdapterOptions) {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 400, height: 300 });
  chart.setOption({
    animation: false,
    xAxis: { type: 'category', data: STEPS, name: 'Step' },
    yAxis: { type: 'value', name: 'Value' },
    series,
  });
  const dom = new JSDOM(`<!doctype html><body><div id="fan">${chart.renderToSVGString()}</div></body>`);
  const container = dom.window.document.getElementById('fan') as HTMLElement;
  const maidr = createMaidrFromEChart(chart as unknown as EChartsInstance, container, options);
  chart.dispose();
  return { maidr, container };
}

/** The vertical extent of a path, from the y of each of its vertices. */
function heightOf(path: Element | null): number {
  const ys = [...(path?.getAttribute('d') ?? '').matchAll(/[ML]\s*[-\d.]+[ ,]([-\d.]+)/g)].map(m => Number(m[1]));
  return Math.max(...ys) - Math.min(...ys);
}

function layersOf(series: object[], options: EChartsAdapterOptions): MaidrLayer[] {
  return render(series, options).maidr.subplots[0][0].layers;
}

describe('echarts percentile band', () => {
  it('reads a declared fan as one layer, each band\'s edges taken from its stack', () => {
    const layers = layersOf(FAN, { percentileBands: BANDS });

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PERCENTILE_BAND);
    expect(layers[0].title).toBe('Median');
    expect((layers[0].data as PercentileBandPoint[])[1]).toEqual({
      x: '1',
      quantiles: [
        { level: 0.05, value: -1 },
        { level: 0.25, value: 0 },
        { level: 0.5, value: 1 },
        { level: 0.75, value: 2 },
        { level: 0.95, value: 3 },
      ],
    });
  });

  it('outlines each band\'s area, outermost first, then the median', () => {
    const { maidr, container } = render(FAN, { percentileBands: BANDS });
    const layer = maidr.subplots[0][0].layers[0];

    expect(layer.selectors).toHaveLength(3);
    withPageDocument(container, () => {
      const figure = new Figure(maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));
      const trace = figure.subplots[0][0].traces[0][0] as unknown as {
        highlightValues: SVGElement[][][] | null;
      };
      const outlined = trace.highlightValues?.map(row => (row[0] as unknown as SVGElement[])[0]);
      const [outer, inner, median] = (layer.selectors as string[])
        .map(selector => container.ownerDocument.querySelector(selector));

      // Levels 0.05, 0.25, 0.5, 0.75 and 0.95.
      expect(outlined).toEqual([outer, inner, median, inner, outer]);
      // The outer band's area spans more of the y axis than the inner one's.
      expect(heightOf(outer)).toBeGreaterThan(heightOf(inner));
      expect(median?.getAttribute('fill')).toBe('none');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('reads the series as before when no fan is declared', () => {
    const types = layersOf(FAN, {}).map(layer => layer.type);

    expect(types).toEqual([TraceType.AREA, TraceType.AREA, TraceType.LINE]);
  });

  it('leaves out a band that is not stacked on an edge, and says so', () => {
    const series = [
      ...band('p5-p95', 2),
      { type: 'line', name: 'loose', data: [1, 1, 1], areaStyle: {} },
      { type: 'line', name: 'Median', data: MEDIAN },
    ];

    const layers = layersOf(series, {
      percentileBands: [{
        median: 'Median',
        bands: [
          { series: 'p5-p95', lower: 0.05, upper: 0.95 },
          { series: 'loose', lower: 0.25, upper: 0.75 },
        ],
      }],
    });

    const fan = layers.find(layer => layer.type === TraceType.PERCENTILE_BAND);
    expect((fan?.data as PercentileBandPoint[])[0].quantiles.map(q => q.level)).toEqual([0.05, 0.5, 0.95]);
    expect(layers.map(layer => layer.type)).toContain(TraceType.AREA);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"loose" as a band of "Median", which is stacked on no other series'));
  });

  it('refuses levels written as percentages, reading the series as before', () => {
    const layers = layersOf(FAN, {
      percentileBands: [{ median: 'Median', bands: [{ series: 'p5-p95', lower: 5, upper: 95 }] }],
    });

    expect(layers.map(layer => layer.type)).not.toContain(TraceType.PERCENTILE_BAND);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[MAIDR ECharts]'));
  });

  it('reads a median it cannot find as the undeclared chart', () => {
    const layers = layersOf(FAN, {
      percentileBands: [{ median: 'Mean', bands: [{ series: 'p5-p95', lower: 0.05, upper: 0.95 }] }],
    });

    expect(layers.map(layer => layer.type)).not.toContain(TraceType.PERCENTILE_BAND);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "Mean" as the median'));
  });
});
