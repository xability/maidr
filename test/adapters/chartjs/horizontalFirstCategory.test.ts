/**
 * Chart.js draws a horizontal chart's first category at the top, on a canvas
 * MAIDR cannot measure (#1482).
 *
 * Up and Down move between a sideways chart's categories as they are drawn,
 * which MAIDR reads from the marks the highlight resolves. A Chart.js layer
 * has none, so without a word from the adapter the first category was taken
 * to be at the bottom: Up walked down the chart and Down said there was no
 * more data.
 */

import type { ChartJsChart, ChartJsData, ChartJsOptions } from '@adapters/chartjs/types';
import type { AbstractTrace } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

function createChart(data: ChartJsData, options: ChartJsOptions): ChartJsChart {
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options,
    config: { type: 'bar' },
    getDatasetMeta: () => ({ data: [], type: 'bar' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

function layerOf(data: ChartJsData, options: ChartJsOptions, traceType?: TraceType): MaidrLayer {
  const { maidr } = extractChartData(createChart(data, options), traceType ? { traceType } : undefined);
  return maidr.subplots[0][0].layers[0];
}

/**
 * The category the cursor is on.
 * @param trace - The trace
 * @returns Its name
 */
function category(trace: AbstractTrace): unknown {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return state.text.main.value;
}

const SALES: ChartJsData = { labels: ['North', 'South', 'East'], datasets: [{ label: 'Sales', data: [5, 9, 7] }] };

describe('a Chart.js chart drawn with indexAxis: \'y\'', () => {
  it('says its first category is drawn at the top', () => {
    expect(layerOf(SALES, { indexAxis: 'y' }).firstCategory).toBe('top');
  });

  it('says so of every sideways layer of categories it emits', () => {
    const twoSeries: ChartJsData = {
      labels: ['North', 'South'],
      datasets: [{ label: 'Sales', data: [5, 9] }, { label: 'Costs', data: [3, 4] }],
    };
    const pairs: ChartJsData = { labels: ['Japan', 'Spain'], datasets: [{ label: 'Age', data: [[79, 84], [77, 83]] }] };

    expect(layerOf(twoSeries, { indexAxis: 'y' }).firstCategory).toBe('top');
    expect(layerOf(pairs, { indexAxis: 'y' }, TraceType.DUMBBELL).firstCategory).toBe('top');
  });

  it('says it of a reversed axis too, whose categories it lists from the top', () => {
    const layer = layerOf(SALES, { indexAxis: 'y', scales: { y: { reverse: true } } });

    expect(layer.firstCategory).toBe('top');
    expect((layer.data as { y: string }[]).map(point => point.y)).toEqual(['East', 'South', 'North']);
  });

  it('is walked down the page with Down, and Up from the top is the edge', () => {
    const trace = TraceFactory.create(layerOf(SALES, { indexAxis: 'y' })) as AbstractTrace;
    trace.moveOnce('DOWNWARD');
    expect(category(trace)).toBe('North');

    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(category(trace)).toBe('South');
    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(category(trace)).toBe('East');
  });

  it('an upright chart says nothing of it', () => {
    expect(layerOf(SALES, {}).firstCategory).toBeUndefined();
  });
});
