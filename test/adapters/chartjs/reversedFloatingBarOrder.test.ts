/**
 * The floating-bar readings turn round with the bars (#1015).
 *
 * A gantt, a waterfall and a dumbbell are all drawn by Chart.js's bar
 * controller from a `[start, end]` datum, on the same category axis, so
 * `scales.<axis>.reverse` moves them exactly as it moves an ordinary bar --
 * measured on Chart.js 4.5.1 in Chromium:
 *
 *   floating bar, plain     left→right: alpha, bravo, charlie
 *   floating bar, x reverse left→right: charlie, bravo, alpha
 *
 * `GanttTrace`, `WaterfallTrace` and `DumbbellTrace` all announce `layer.data`
 * as it arrives, so the emitted order is the announced order here too.
 *
 * The gantt is the one with a second thing to keep in step: `GanttData.lanes`
 * names the lanes `points` holds, position for position.
 */
import type { ChartJsChart, MaidrPluginOptions } from '@adapters/chartjs/types';
import type { DumbbellData, GanttData, WaterfallPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/** The categories in the order they are written. */
const LISTED = ['alpha', 'bravo', 'charlie'];
/** The same categories in the order a reversed axis draws them. */
const DRAWN = ['charlie', 'bravo', 'alpha'];

/**
 * A floating-bar chart as Chart.js leaves its options after construction.
 * @param datasets - The datasets, carrying `[start, end]` pairs
 * @param reverse - Whether the category axis is reversed
 * @param indexAxis - Which axis carries the categories
 * @returns The chart
 */
function chartFor(
  datasets: { label?: string; data: unknown[] }[],
  reverse: boolean,
  indexAxis: 'x' | 'y' = 'x',
): ChartJsChart {
  const categoryScale = { reverse };
  return {
    canvas: { id: 'floating' },
    config: { type: 'bar' },
    data: { labels: LISTED, datasets },
    options: {
      indexAxis,
      scales: indexAxis === 'y' ? { y: categoryScale } : { x: categoryScale },
    },
  } as unknown as ChartJsChart;
}

/** The declaration that makes a floating bar chart a paired comparison. */
const DUMBBELL: MaidrPluginOptions = { traceType: TraceType.DUMBBELL };

/**
 * The single layer a chart converts to.
 * @param chart - The chart to read
 * @param pluginOptions - What the page declares the chart to be, if anything
 * @returns The emitted layer
 */
function layerOf(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): { type: string; data: unknown } {
  const layer = extractChartData(chart, pluginOptions).maidr.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer as unknown as { type: string; data: unknown };
}

/** Intervals that do not chain, so the chart reads as a schedule. */
const SPANS = [[0, 2], [5, 7], [9, 12]];
/** Steps that chain into a running total, so the chart reads as a waterfall. */
const STEPS = [[0, 4], [4, 6], [6, 10]];

describe('a chart.js gantt on a reversed category axis', () => {
  it('leads with the lane drawn first', () => {
    const { type, data } = layerOf(chartFor([{ label: 'r', data: SPANS }], true, 'y'));

    expect(type).toBe('gantt');
    expect((data as GanttData).lanes).toEqual(DRAWN);
  });

  it('keeps every lane under its own name', () => {
    // The hazard the gantt has and the others do not: `lanes` and `points` are
    // two arrays indexed alike, so turning one over alone would announce every
    // lane under its neighbour's name.
    const { data } = layerOf(chartFor([{ label: 'r', data: SPANS }], true, 'y'));
    const { lanes, points } = data as GanttData;
    // `lanes` is optional in the grammar, and a gantt without it would leave
    // every assertion below reading position 0 rather than failing.
    const named = lanes ?? [];

    expect(named).toHaveLength(3);
    expect(points[named.indexOf('alpha')][0].start).toBe(0);
    expect(points[named.indexOf('bravo')][0].start).toBe(5);
    expect(points[named.indexOf('charlie')][0].start).toBe(9);
  });

  it('leaves an ordinary gantt alone', () => {
    const { data } = layerOf(chartFor([{ label: 'r', data: SPANS }], false, 'y'));

    expect((data as GanttData).lanes).toEqual(LISTED);
  });
});

describe('a chart.js waterfall on a reversed category axis', () => {
  it('reads the steps in the order they are drawn', () => {
    const { type, data } = layerOf(chartFor([{ label: 'w', data: STEPS }], true));

    expect(type).toBe('waterfall');
    expect((data as WaterfallPoint[]).map(p => p.x)).toEqual(DRAWN);
  });

  it('leaves a step to its own arithmetic', () => {
    // `delta` and `kind` are properties of a step, not of its neighbours, so
    // walking the chain backwards must not change what any step says it did.
    const { data } = layerOf(chartFor([{ label: 'w', data: STEPS }], true));
    const points = data as WaterfallPoint[];
    const charlie = points.find(p => p.x === 'charlie');

    expect(charlie?.start).toBe(6);
    expect(charlie?.end).toBe(10);
    expect(charlie?.delta).toBe(4);
    expect(charlie?.kind).toBe('increase');
  });

  it('is still recognised as a waterfall at all', () => {
    // The chaining that identifies one lives in the written order, and
    // `isWaterfallSequence` runs before any reordering. Reversing first would
    // have made every waterfall read as a gantt.
    expect(layerOf(chartFor([{ label: 'w', data: STEPS }], true)).type).toBe('waterfall');
  });

  it('leaves an ordinary waterfall alone', () => {
    const { data } = layerOf(chartFor([{ label: 'w', data: STEPS }], false));

    expect((data as WaterfallPoint[]).map(p => p.x)).toEqual(LISTED);
  });
});

describe('a chart.js dumbbell on a reversed category axis', () => {
  it('leads with the row drawn first', () => {
    const { type, data } = layerOf(chartFor([{ label: 'd', data: SPANS }], true, 'y'), DUMBBELL);

    expect(type).toBe('dumbbell');
    expect((data as DumbbellData).points.map(p => p.x)).toEqual(DRAWN);
  });

  it('keeps each pair on its own row', () => {
    const { data } = layerOf(chartFor([{ label: 'd', data: SPANS }], true, 'y'), DUMBBELL);
    const { points } = data as DumbbellData;

    expect(points.find(p => p.x === 'alpha')?.start).toBe(0);
    expect(points.find(p => p.x === 'charlie')?.end).toBe(12);
  });

  it('leaves an ordinary dumbbell alone', () => {
    const { data } = layerOf(chartFor([{ label: 'd', data: SPANS }], false, 'y'), DUMBBELL);

    expect((data as DumbbellData).points.map(p => p.x)).toEqual(LISTED);
  });
});
