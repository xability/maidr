import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { TraceType } from '@type/grammar';

/**
 * Build a minimal Chart.js instance for the extractor to read.
 * @param datasets The datasets the chart carries
 * @param options Chart options, for scale stacking and element defaults
 * @returns A chart object shaped the way the extractor expects
 */
function lineChart(
  datasets: ChartJsDataset[],
  options: ChartJsOptions = {},
): ChartJsChart {
  const data: ChartJsData = { labels: ['Jan', 'Feb', 'Mar'], datasets };
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options,
    config: { type: 'line' },
    getDatasetMeta: () => ({ data: [], type: 'line' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The layers a chart produces, in emission order. */
function layersOf(chart: ChartJsChart): MaidrLayer[] {
  return extractChartData(chart).maidr.subplots[0][0].layers;
}

/** A dataset with the given fill setting and three points. */
function series(label: string, fill?: ChartJsDataset['fill']): ChartJsDataset {
  return { label, data: [1, 2, 3], ...(fill === undefined ? {} : { fill }) };
}

describe('chart.js line fill detection', () => {
  it('reads an unfilled line dataset as a line', () => {
    const layers = layersOf(lineChart([series('Revenue')]));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.LINE);
  });

  it('reads fill: false as a line', () => {
    expect(layersOf(lineChart([series('Revenue', false)]))[0].type).toBe(TraceType.LINE);
  });

  it.each([
    ['true', true],
    ['origin', 'origin'],
    ['start', 'start'],
    ['end', 'end'],
    ['relative +1', '+1'],
  ])('reads fill: %s as an area', (_label, fill) => {
    expect(layersOf(lineChart([series('Revenue', fill as ChartJsDataset['fill'])]))[0].type)
      .toBe(TraceType.AREA);
  });

  it('reads fill: 0 as an area', () => {
    // The awkward one: filling to dataset 0 is a legitimate instruction and
    // `0` is falsy, so a truthiness test would read this chart as a line.
    expect(layersOf(lineChart([series('a'), series('b', 0)]))[1].type)
      .toBe(TraceType.AREA);
  });

  it('reads the object form as an area only when it names a target', () => {
    expect(layersOf(lineChart([series('Revenue', { target: 'origin' })]))[0].type)
      .toBe(TraceType.AREA);
    expect(layersOf(lineChart([series('Revenue', { target: false })]))[0].type)
      .toBe(TraceType.LINE);
  });

  it('honours the chart-wide element default', () => {
    const chart = lineChart([series('Revenue')], { elements: { line: { fill: 'origin' } } });

    expect(layersOf(chart)[0].type).toBe(TraceType.AREA);
  });

  it('lets a dataset override the chart-wide default', () => {
    const chart = lineChart([series('Revenue', false)], {
      elements: { line: { fill: 'origin' } },
    });

    expect(layersOf(chart)[0].type).toBe(TraceType.LINE);
  });

  describe('stacking', () => {
    const stackedScales: ChartJsOptions = { scales: { x: {}, y: { stacked: true } } };

    it('reads filled datasets on a stacked scale as a stacked area', () => {
      const chart = lineChart(
        [series('Subscriptions', 'origin'), series('Services', '-1')],
        stackedScales,
      );
      const layers = layersOf(chart);

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.STACKED_AREA);
      expect(layers[0].data).toHaveLength(2);
    });

    it('leaves an unfilled dataset a line even on a stacked scale', () => {
      // Stacking alone does not make a band; without a fill there is nothing
      // drawn between the line and its neighbour to read as one.
      expect(layersOf(lineChart([series('Revenue')], stackedScales))[0].type)
        .toBe(TraceType.LINE);
    });
  });

  describe('grouping', () => {
    it('splits filled and unfilled datasets into separate layers', () => {
      // A band and a line are different trace types, so they cannot share a
      // layer — the layer announces one type for every series in it.
      const layers = layersOf(lineChart([
        series('Line A'),
        series('Band', 'origin'),
        series('Line B'),
      ]));

      expect(layers).toHaveLength(2);
      expect(layers[0].type).toBe(TraceType.LINE);
      expect(layers[0].data).toHaveLength(2);
      expect(layers[1].type).toBe(TraceType.AREA);
      expect(layers[1].data).toHaveLength(1);
    });

    it('keeps the plain line layer first in a mixed chart', () => {
      const layers = layersOf(lineChart([
        series('Band', 'origin'),
        series('Line'),
      ]));

      expect(layers[0].type).toBe(TraceType.LINE);
      expect(layers[1].type).toBe(TraceType.AREA);
    });

    it('splits a stepped band from an interpolated one', () => {
      const layers = layersOf(lineChart([
        { label: 'Band', data: [1, 2, 3], fill: 'origin' },
        { label: 'Stairs', data: [1, 2, 3], fill: 'origin', stepped: 'before' },
      ]));

      expect(layers).toHaveLength(2);
      expect(layers.map(l => l.type).sort()).toEqual([TraceType.AREA, TraceType.STEP].sort());
    });
  });

  describe('stepped bands', () => {
    it('keeps an unstacked stepped band a step plot', () => {
      // Nothing accumulates, so STEP loses nothing an area would preserve and
      // the staircase is the more specific reading.
      const layers = layersOf(lineChart([
        { label: 'Stairs', data: [1, 2, 3], fill: 'origin', stepped: 'before' },
      ]));

      expect(layers[0].type).toBe(TraceType.STEP);
      expect(layers[0].stepDirection).toBe('hv');
    });

    it('prefers the stacked reading when a stepped band also stacks', () => {
      // Losing the staircase costs a nuance; losing the stacking makes the
      // announced number ambiguous, which is the worse failure.
      const layers = layersOf(lineChart(
        [{ label: 'Stairs', data: [1, 2, 3], fill: 'origin', stepped: 'before' }],
        { scales: { x: {}, y: { stacked: true } } },
      ));

      expect(layers[0].type).toBe(TraceType.STACKED_AREA);
      // A layer read as an area has no staircase navigation to announce.
      expect(layers[0].stepDirection).toBeUndefined();
    });
  });
});
