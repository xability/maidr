/**
 * A Chart.js bar chart on a reversed category axis has to be emitted in the
 * order it is drawn (#1015).
 *
 * `BarTrace` and `SegmentedTrace` announce `layer.data` exactly as it arrives,
 * so the emitted order *is* the announced order. Both bar builders indexed
 * `chart.data.labels` directly and never looked at the scale, so a chart with
 * `scales.x.reverse: true` was read as the mirror image of what it draws.
 *
 * Measured on real Chart.js 4.5.1 in Chromium, reading each bar's own resolved
 * position off `getDatasetMeta(0).data[i].x` (or `.y` for a horizontal chart),
 * for `labels: ['alpha', 'bravo', 'charlie']`:
 *
 *   vertical, plain            left→right: alpha, bravo, charlie
 *   vertical, x reverse        left→right: charlie, bravo, alpha
 *   horizontal (indexAxis y)   top→bottom: alpha, bravo, charlie
 *   horizontal, y reverse      top→bottom: charlie, bravo, alpha
 *
 * with `chart.data.labels` unchanged at `['alpha','bravo','charlie']` in all
 * four, and `chart.options.scales.<axis>.reverse` resolving to a readable
 * `false`/`true` — the same signal #1011 reads for the matrix chart.
 *
 * The dodged, stacked and dot readings were measured to flip identically. Only
 * the *relative* order is asserted here: which end of a horizontal bar list
 * MAIDR reads first is a separate convention, and this fix does not touch the
 * plain case that establishes it.
 */
import type { ChartJsChart } from '@adapters/chartjs/types';
import type { BarPoint, SegmentedPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';

/** The categories in the order they are written. */
const LISTED = ['alpha', 'bravo', 'charlie'];
/** The same categories in the order a reversed axis draws them. */
const DRAWN = ['charlie', 'bravo', 'alpha'];

interface ChartSpec {
  datasets: { label?: string; data: unknown[]; showLine?: boolean }[];
  scales?: Record<string, unknown>;
  indexAxis?: 'x' | 'y';
  type?: string;
  stacked?: boolean;
}

/**
 * A chart as Chart.js leaves its options after construction.
 * @param spec - What the chart is
 * @returns The chart
 */
function chartFor(spec: ChartSpec): ChartJsChart {
  const scales: Record<string, unknown> = { ...(spec.scales ?? {}) };
  if (spec.stacked) {
    scales.x = { ...(scales.x as object), stacked: true };
    scales.y = { ...(scales.y as object), stacked: true };
  }
  return {
    canvas: { id: 'reversed-bar' },
    config: { type: spec.type ?? 'bar' },
    data: { labels: LISTED, datasets: spec.datasets },
    options: { ...(spec.indexAxis ? { indexAxis: spec.indexAxis } : {}), scales },
  } as unknown as ChartJsChart;
}

/**
 * The single layer a chart converts to.
 * @param spec - What the chart is
 * @returns The emitted layer
 */
function layerFor(spec: ChartSpec): { type: string; data: unknown } {
  const layer = extractChartData(chartFor(spec)).maidr.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer as unknown as { type: string; data: unknown };
}

/** One dataset: a plain bar chart. */
const ONE = [{ label: 's', data: [1, 2, 3] }];
/** Two datasets, so the segmented builder runs. */
const TWO = [{ label: 'p', data: [1, 2, 3] }, { label: 'q', data: [4, 5, 6] }];

describe('a chart.js bar chart on a reversed category axis', () => {
  it('leads with the category drawn leftmost', () => {
    // Before the fix this was ['alpha', 'bravo', 'charlie'] — the exact
    // reverse of what the chart draws.
    const { data } = layerFor({ datasets: ONE, scales: { x: { reverse: true } } });

    expect((data as BarPoint[]).map(p => p.x)).toEqual(DRAWN);
  });

  it('carries each value with its own category', () => {
    // The pairing survived the bug too — the label and the value were read off
    // the same index — so it is the part the fix must not break.
    const { data } = layerFor({ datasets: ONE, scales: { x: { reverse: true } } });
    const points = data as BarPoint[];

    expect(points.find(p => p.x === 'alpha')?.y).toBe(1);
    expect(points.find(p => p.x === 'bravo')?.y).toBe(2);
    expect(points.find(p => p.x === 'charlie')?.y).toBe(3);
  });

  it('leaves an ordinary chart alone', () => {
    const { data } = layerFor({ datasets: ONE, scales: { x: { reverse: false } } });

    expect((data as BarPoint[]).map(p => p.x)).toEqual(LISTED);
  });

  it('leaves a chart that declares no scale at all alone', () => {
    // `reverse` undeclared has to read as not reversed, not as absent-and-
    // therefore-unknown: nearly every bar chart is written without it.
    const { data } = layerFor({ datasets: ONE });

    expect((data as BarPoint[]).map(p => p.x)).toEqual(LISTED);
  });

  it('ignores a reversed value axis', () => {
    // Reversing y on a vertical chart turns the *magnitudes* upside down and
    // moves no category, so the reading is unchanged. Asking the wrong axis
    // would reorder a chart that did not move.
    const { data } = layerFor({ datasets: ONE, scales: { y: { reverse: true } } });

    expect((data as BarPoint[]).map(p => p.x)).toEqual(LISTED);
  });

  it('skips a gap without dragging the rest out of step', () => {
    // A `null` is not announced, and the categories that remain still have to
    // come out in drawn order rather than shifted by the omission.
    const { data } = layerFor({
      datasets: [{ label: 's', data: [1, null, 3] }],
      scales: { x: { reverse: true } },
    });

    expect((data as BarPoint[]).map(p => p.x)).toEqual(['charlie', 'alpha']);
    expect((data as BarPoint[]).map(p => p.y)).toEqual([3, 1]);
  });
});

describe('a horizontal chart.js bar chart', () => {
  it('asks the axis its categories are on', () => {
    // `indexAxis: 'y'` puts the categories on y, so that is the scale whose
    // `reverse` moves them. Reading `x` here would miss the flip entirely.
    const { data } = layerFor({ datasets: ONE, indexAxis: 'y', scales: { y: { reverse: true } } });

    expect((data as BarPoint[]).map(p => p.y)).toEqual(DRAWN);
  });

  it('is unmoved by a reversed x, which is its value axis', () => {
    const { data } = layerFor({ datasets: ONE, indexAxis: 'y', scales: { x: { reverse: true } } });

    expect((data as BarPoint[]).map(p => p.y)).toEqual(LISTED);
  });
});

describe('a segmented chart.js bar chart', () => {
  it('turns a dodged chart round', () => {
    const { type, data } = layerFor({ datasets: TWO, scales: { x: { reverse: true } } });
    const groups = data as SegmentedPoint[][];

    expect(type).toBe('dodged_bar');
    expect(groups[0].map(p => p.x)).toEqual(DRAWN);
  });

  it('turns a stacked chart round', () => {
    const { type, data } = layerFor({ datasets: TWO, stacked: true, scales: { x: { reverse: true } } });
    const groups = data as SegmentedPoint[][];

    expect(type).toBe('stacked_bar');
    expect(groups[0].map(p => p.x)).toEqual(DRAWN);
  });

  it('turns every group round together', () => {
    // The groups are the z axis and do not move; what must stay true is that
    // each group's categories line up with every other group's, since the
    // model's stacked summary sums across them by position.
    const { data } = layerFor({ datasets: TWO, stacked: true, scales: { x: { reverse: true } } });
    const groups = data as SegmentedPoint[][];

    expect(groups.map(g => g.map(p => p.x))).toEqual([DRAWN, DRAWN]);
    expect(groups[0].map(p => p.y)).toEqual([3, 2, 1]);
    expect(groups[1].map(p => p.y)).toEqual([6, 5, 4]);
  });

  it('leaves an ordinary segmented chart alone', () => {
    const { data } = layerFor({ datasets: TWO, scales: { x: { reverse: false } } });

    expect((data as SegmentedPoint[][])[0].map(p => p.x)).toEqual(LISTED);
  });
});

describe('a chart.js dot plot', () => {
  it('turns round with the bars, because it is built by the same code', () => {
    // `extractDotLayers` calls `singleDatasetToBarLayer`, so a Cleveland dot
    // plot is fixed by the bar fix rather than separately — pinned so that
    // stops being an accident.
    const { type, data } = layerFor({
      type: 'line',
      datasets: [{ label: 's', data: [1, 2, 3], showLine: false }],
      scales: { x: { reverse: true } },
    });

    expect(type).toBe('dot');
    expect((data as BarPoint[]).map(p => p.x)).toEqual(DRAWN);
  });
});
