import type { EChartsInstance } from '@adapters/echarts/types';
import type { PrCurvePoint } from '@type/grammar';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import * as echarts from 'echarts';
import { JSDOM } from 'jsdom';

/**
 * A precision-recall curve redrawn in ECharts is a `line` over two value
 * axes, and the axis names are the only thing that says what it is -- the
 * reading the Vega-Lite adapter gives the same chart. Each case is drawn by
 * the real echarts 6.1.0 renderer, server-side into an SVG string.
 */

const CURVE = [[0, 1], [0.5, 0.8], [1, 0.4]];

function layerOf(xName: string, yName: string, data: number[][] = CURVE, extra: object = {}) {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 400, height: 300 });
  chart.setOption({
    animation: false,
    xAxis: { type: 'value', name: xName },
    yAxis: { type: 'value', name: yName },
    series: [{ type: 'line', name: 'Logistic', data, ...extra }],
  });
  const dom = new JSDOM(`<!doctype html><body><div id="pr">${chart.renderToSVGString()}</div></body>`);
  const container = dom.window.document.getElementById('pr') as HTMLElement;
  const layer = createMaidrFromEChart(chart as unknown as EChartsInstance, container).subplots[0][0].layers[0];
  chart.dispose();
  return layer;
}

describe('echarts precision-recall curve', () => {
  it('reads a line of precision against recall as a curve', () => {
    const layer = layerOf('Recall', 'Precision');

    expect(layer.type).toBe(TraceType.PR_CURVE);
    expect(layer.data as PrCurvePoint[][]).toEqual([[
      { x: 0, y: 1 },
      { x: 0.5, y: 0.8 },
      { x: 1, y: 0.4 },
    ]]);
  });

  it('reads a stepped curve as a curve, announcing no step convention', () => {
    const layer = layerOf('recall', 'precision', CURVE, { step: 'end' });

    expect(layer.type).toBe(TraceType.PR_CURVE);
    expect(layer.stepDirection).toBeUndefined();
  });

  it('stays a line when the axes name something else', () => {
    expect(layerOf('Recall at k', 'Precision').type).toBe(TraceType.LINE);
    expect(layerOf('Precision', 'Recall').type).toBe(TraceType.LINE);
  });

  it('stays a line when the rates are written as percentages', () => {
    expect(layerOf('Recall', 'Precision', [[0, 100], [50, 80], [100, 40]]).type).toBe(TraceType.LINE);
  });
});
