/**
 * A Highcharts heatmap cell the series never mentions (#1191).
 *
 * The adapter built its grid `Array.from(… () => 0)` and filled what the
 * series named, so a rectangle the data does not fill came out as zeros.
 * Measured on real Highcharts 13.0.1 in jsdom, a 3x2 heatmap omitting `[1, 1]`
 * and the same heatmap stating it as `0`:
 *
 *   one cell absent   points = [[2,0,4],[5,7,9]]   drawn series points = 5
 *   that cell zero    points = [[2,0,4],[5,7,9]]   drawn series points = 6
 *
 * Byte-identical payloads for two different charts — one of which draws five
 * cells while MAIDR announces six.
 */
import type { HighchartsPoint } from '@adapters/highcharts/types';
import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = dom.window.document;
  g.SVGElement = dom.window.SVGElement;
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.SVGElement;
});

/** One Highcharts heatmap point, as the adapter reads them. */
function cell(x: number, y: number, value: number): Partial<HighchartsPoint> {
  return { x, y, options: { value } } as Partial<HighchartsPoint>;
}

/**
 * The grid a 3x2 heatmap converts to.
 * @param data - The points the series carries
 * @returns The emitted `points` grid
 */
function gridFor(data: Partial<HighchartsPoint>[]): (number | null)[][] {
  const yAxis = fakeAxis({ categories: ['AM', 'PM'] } as never);
  const xAxis = fakeAxis({ categories: ['Mon', 'Tue', 'Wed'] } as never);
  const series = fakeSeries({ index: 0, type: 'heatmap', name: 'H', xAxis, yAxis, data });
  const chart = fakeChart({ type: 'heatmap', series: [series], xAxis: [xAxis], yAxis: [yAxis] });
  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0] as MaidrLayer;
  return (layer.data as HeatmapData).points;
}

const WITHOUT = [
  cell(0, 0, 5),
  cell(1, 0, 7),
  cell(2, 0, 9),
  cell(0, 1, 2),
  // [1, 1] deliberately absent — Highcharts draws no cell there at all.
  cell(2, 1, 4),
];

const WITH_ZERO = [...WITHOUT.slice(0, 4), cell(1, 1, 0), WITHOUT[4]];

describe('a heatmap whose series does not fill the grid', () => {
  it('leaves the cell absent rather than reading it as zero', () => {
    const grid = gridFor(WITHOUT);

    // Rows arrive top-first, and Highcharts numbers its y axis from the
    // bottom, so the `PM` row (y index 1) is emitted first.
    expect(grid).toEqual([[2, null, 4], [5, 7, 9]]);
  });

  it('is no longer indistinguishable from one stating a zero', () => {
    expect(gridFor(WITH_ZERO)).toEqual([[2, 0, 4], [5, 7, 9]]);
    expect(gridFor(WITHOUT)).not.toEqual(gridFor(WITH_ZERO));
  });

  it('keeps a point whose colour metric is missing as a hole too', () => {
    // A drawn cell whose `value` the series never set has no reading either,
    // and the old fallback made it a zero the same way.
    const bare = { x: 1, y: 1, options: {} } as Partial<HighchartsPoint>;
    const grid = gridFor([...WITHOUT.slice(0, 4), bare, WITHOUT[4]]);

    expect(grid[0][1]).toBeNull();
  });
});
