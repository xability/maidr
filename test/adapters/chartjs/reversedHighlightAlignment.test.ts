/**
 * A reversed Chart.js bar chart must highlight the bar it is announcing.
 *
 * #1016 turned the bar family's payload round so a chart drawn from the far
 * end is read the way it looks. Chart.js carries no CSS `selectors` — it
 * paints to canvas — so that looked one-sided. It is not: the plugin
 * highlights by *index*, through `computeTargetMaps`, which walks the datasets
 * in the order they were written. Reversing the payload alone therefore left
 * MAIDR announcing one bar and outlining another (#1024).
 *
 * Measured before the fix, on `labels: ['alpha','bravo','charlie']` with
 * `scales.x.reverse`:
 *
 *   payload  ["charlie", "bravo", "alpha"]
 *   col 0 (charlie) -> Chart.js element 0, which is alpha
 *   col 2 (alpha)   -> Chart.js element 2, which is charlie
 *
 * Every one of these cases asks the same question: does the element the
 * plugin would outline hold the datum the reader was just told about?
 */
import type { ChartJsChart, ChartJsData, ChartJsOptions } from '@adapters/chartjs/types';
import type { BarPoint, GanttData, SegmentedPoint, WaterfallPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';

const LISTED = ['alpha', 'bravo', 'charlie'];
/** Values keyed to position, so an element index names its own datum. */
const VALUES = [10, 20, 30];

/**
 * A drawn chart, as Chart.js leaves it.
 * @param type - The Chart.js chart type
 * @param data - Its data
 * @param options - Its resolved options
 * @returns The chart
 */
function createChart(type: string, data: ChartJsData, options?: ChartJsOptions): ChartJsChart {
  return {
    canvas: { id: 'reversed-highlight' } as unknown as HTMLCanvasElement,
    data,
    options: options ?? {},
    config: { type },
    getDatasetMeta: () => ({ data: [], type }),
    setActiveElements: () => {},
    update: () => {},
  } as unknown as ChartJsChart;
}

/** Everything the plugin's navigation bridge uses, for one chart. */
function setup(chart: ChartJsChart): {
  layer: { id: string; type: string; data: unknown };
  targetOf: (row: number, col: number) => number | undefined;
} {
  const { maidr, layerDatasetIndices } = extractChartData(chart);
  const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
  const maps = computeTargetMaps(chart, layers, layerDatasetIndices);
  const layer = layers[0];
  return {
    layer: layer as unknown as { id: string; type: string; data: unknown },
    targetOf: (row, col) =>
      resolveActiveTargets(layers, maps, layerDatasetIndices, layer.id, row, col)[0]?.index,
  };
}

/** The reversed-axis options every case here is drawn with. */
const REVERSED: ChartJsOptions = { scales: { x: { reverse: true } } } as ChartJsOptions;

describe('a reversed bar chart', () => {
  it('outlines the bar it is announcing', () => {
    const { layer, targetOf } = setup(createChart('bar', {
      labels: LISTED,
      datasets: [{ label: 's', data: VALUES }],
    }, REVERSED));
    const points = layer.data as BarPoint[];

    // Element `i` of the Chart.js dataset holds `VALUES[i]`, so the target's
    // index says which datum would be outlined.
    points.forEach((point, col) => {
      expect(VALUES[targetOf(0, col) as number]).toBe(point.y);
    });
  });

  it('leaves an ordinary chart aligned', () => {
    const { layer, targetOf } = setup(createChart('bar', {
      labels: LISTED,
      datasets: [{ label: 's', data: VALUES }],
    }));
    const points = layer.data as BarPoint[];

    points.forEach((point, col) => {
      expect(VALUES[targetOf(0, col) as number]).toBe(point.y);
    });
  });

  it('stays aligned across a gap', () => {
    // A `null` is skipped in the payload but still occupies a Chart.js
    // element, so the two lists are different lengths and the mapping is the
    // only thing keeping them together.
    const { layer, targetOf } = setup(createChart('bar', {
      labels: LISTED,
      datasets: [{ label: 's', data: [10, null, 30] }],
    }, REVERSED));
    const points = layer.data as BarPoint[];

    expect(points.map(p => p.x)).toEqual(['charlie', 'alpha']);
    expect(targetOf(0, 0)).toBe(2);
    expect(targetOf(0, 1)).toBe(0);
  });
});

describe('a reversed segmented bar chart', () => {
  it('outlines the segment it is announcing', () => {
    const { layer, targetOf } = setup(createChart('bar', {
      labels: LISTED,
      datasets: [
        { label: 'p', data: VALUES },
        { label: 'q', data: [40, 50, 60] },
      ],
    }, { scales: { x: { reverse: true, stacked: true }, y: { stacked: true } } } as ChartJsOptions));
    const groups = layer.data as SegmentedPoint[][];

    groups[0].forEach((point, col) => {
      expect(VALUES[targetOf(0, col) as number]).toBe(point.y);
    });
  });
});

describe('a reversed waterfall', () => {
  it('outlines the step it is announcing', () => {
    const steps: Array<[number, number]> = [[0, 4], [4, 6], [6, 10]];
    const { layer, targetOf } = setup(createChart('bar', {
      labels: LISTED,
      datasets: [{ label: 'w', data: steps }],
    }, REVERSED));
    const points = layer.data as WaterfallPoint[];

    points.forEach((point, col) => {
      expect(steps[targetOf(0, col) as number][1]).toBe(point.end);
    });
  });
});

describe('a reversed gantt', () => {
  it('outlines the lane it is announcing', () => {
    const spans: Array<[number, number]> = [[0, 2], [5, 7], [9, 12]];
    const { layer, targetOf } = setup(createChart('bar', {
      labels: LISTED,
      datasets: [{ label: 'r', data: spans }],
    }, { indexAxis: 'y', scales: { y: { reverse: true } } } as ChartJsOptions));
    const { points } = layer.data as GanttData;

    points.forEach((lane, row) => {
      if (lane.length === 0)
        return;
      expect(spans[targetOf(row, 0) as number][0]).toBe(lane[0].start);
    });
  });
});
