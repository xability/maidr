import type { ChartJsChart, ChartJsData, ChartJsOptions } from '@adapters/chartjs/types';
import type { TraceState } from '@type/state';
import { extractChartData } from '@adapters/chartjs/extractor';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A trace type is only reached if the core can build a trace from what the
 * adapter emitted, and a payload of the wrong shape fails there rather than in
 * extraction — at the moment a reader opens the chart. These build the trace
 * the factory builds and read the state a first arrow key would announce,
 * which is what exercises the audio, braille and text channels.
 */

function createChart(
  type: string,
  data: ChartJsData,
  options: ChartJsOptions = {},
): ChartJsChart {
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options,
    config: { type },
    getDatasetMeta: () => ({ data: [], type }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The state the chart's single layer announces at the given position. */
function stateAt(chart: ChartJsChart, row: number, col: number): TraceState {
  const layer = extractChartData(chart).maidr.subplots[0][0].layers[0];
  return TraceFactory.create(layer).getStateAt(row, col);
}

describe('chart.js payloads the core can build a trace from', () => {
  it('builds a radar trace', () => {
    const chart = createChart('radar', {
      labels: ['Speed', 'Power', 'Range'],
      datasets: [
        { label: 'A', data: [10, 20, 30] },
        { label: 'B', data: [15, 5, 25] },
      ],
    });

    const state = stateAt(chart, 1, 2);

    expect(state.empty).toBe(false);
    if (state.empty)
      return;
    expect(state.traceType).toBe(TraceType.RADAR);
    expect(state.text.main).toEqual({ label: 'Category', value: 'Range' });
    expect(state.text.cross).toEqual({ label: 'Value', value: 25 });
  });

  it('builds a polar area trace', () => {
    const chart = createChart('polarArea', {
      labels: ['Speed', 'Power', 'Range'],
      datasets: [{ label: 'Share', data: [10, 20, 30] }],
    });

    const state = stateAt(chart, 0, 1);

    expect(state.empty).toBe(false);
    if (state.empty)
      return;
    expect(state.traceType).toBe(TraceType.POLAR_AREA);
    expect(state.text.cross.value).toBe(20);
  });

  it('builds a gantt trace, empty lane and all', () => {
    const chart = createChart('bar', {
      labels: ['Design', 'Idle', 'Ship'],
      datasets: [{ label: 'Phase', data: [[0, 5], null, [12, 14]] }],
    }, { indexAxis: 'y' });

    const state = stateAt(chart, 2, 0);

    expect(state.empty).toBe(false);
    if (state.empty)
      return;
    expect(state.traceType).toBe(TraceType.GANTT);
    // The span, not a magnitude: a gantt announces both ends of the interval.
    expect(state.text.crossRange).toEqual({ min: 12, max: 14 });
    expect(state.text.z).toEqual({ label: 'Length', value: 2 });

    // The lane a reader can navigate onto and be told nothing about is the
    // row the nested payload exists to express.
    const idle = stateAt(chart, 1, 0);
    expect(idle.empty).toBe(false);
    if (idle.empty)
      return;
    expect(idle.text.main.value).toBe('Idle');
  });

  it('builds a waterfall trace', () => {
    const chart = createChart('bar', {
      labels: ['Open', 'Sales', 'Costs', 'Close'],
      datasets: [{ data: [[0, 100], [100, 150], [150, 120], [0, 120]] }],
    });

    const state = stateAt(chart, 0, 2);

    expect(state.empty).toBe(false);
    if (state.empty)
      return;
    expect(state.traceType).toBe(TraceType.WATERFALL);
    // The contribution is what a waterfall step is read for.
    expect(state.audio.freq.raw).toBe(-30);
  });

  it('builds a diverging bar trace', () => {
    const chart = createChart('bar', {
      labels: ['0-14', '15-64', '65+'],
      datasets: [
        { label: 'Men', data: [-30, -50, -20] },
        { label: 'Women', data: [28, 52, 26] },
      ],
    }, { indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } } });

    const state = stateAt(chart, 0, 1);

    expect(state.empty).toBe(false);
    if (state.empty)
      return;
    expect(state.traceType).toBe(TraceType.DIVERGING);
    // The pitch takes the magnitude; the sign is announced as a side rather
    // than sounding like the smallest bar on the chart.
    expect(state.audio.freq.raw).toBe(50);
  });

  it('builds a normalized area trace', () => {
    const chart = createChart('line', {
      labels: ['Q1', 'Q2', 'Q3'],
      datasets: [
        { label: 'Mobile', data: [60, 55, 50], fill: 'origin' },
        { label: 'Desktop', data: [40, 45, 50], fill: 'origin' },
      ],
    }, { scales: { x: {}, y: { stacked: true } } });

    const state = stateAt(chart, 1, 2);

    expect(state.empty).toBe(false);
    if (state.empty)
      return;
    expect(state.traceType).toBe(TraceType.NORMALIZED_AREA);
    expect(state.text.cross.value).toBe(50);
  });

  it('builds a bump trace', () => {
    const chart = createChart('line', {
      labels: ['Q1', 'Q2', 'Q3'],
      datasets: [
        { label: 'Arsenal', data: [1, 2, 2] },
        { label: 'Chelsea', data: [2, 1, 3] },
        { label: 'Spurs', data: [3, 3, 1] },
      ],
    }, { scales: { x: {}, y: { reverse: true } } });

    const state = stateAt(chart, 2, 2);

    expect(state.empty).toBe(false);
    if (state.empty)
      return;
    expect(state.traceType).toBe(TraceType.BUMP);
    // Rank 1 is the best position, so the pitch is handed over inverted.
    expect(state.audio.freq.raw).toBe(1);
    expect(state.audio.freq.min).toBeGreaterThan(state.audio.freq.max);
  });
});
