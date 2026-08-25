/**
 * An AnyChart heat map cell no row names (#1191).
 *
 * `extractHeatmapData` builds both axes from the rows it was given and then
 * fills a rectangle, so a (x, y) pair the data skips is a hole by
 * construction. The grid was `.fill(0)`, which announced a reading for a cell
 * the chart drew nothing in — and made it indistinguishable from one the
 * author genuinely recorded as zero.
 */
import type { AnyChartInstance, AnyChartSeries } from '@adapters/anychart/types';
import type { HeatmapData } from '@type/grammar';
import { anyChartsToMaidr } from '@adapters/anychart/converters';
import { describe, expect, it } from '@jest/globals';

interface Row { x: string; y: string; heat?: number }

/**
 * The heat grid a set of rows converts to.
 * @param dataRows - The rows the chart carries
 * @returns The emitted `points` grid
 */
function gridFor(dataRows: Row[]): (number | null)[][] {
  let cursor = -1;
  const chart = {
    title: () => 'Heat',
    container: () => '',
    getSeriesCount: () => 0,
    getSeriesAt: () => null,
    getType: () => 'heat-map',
    data: () => ({
      getIterator: () => ({
        reset: () => {
          cursor = -1;
        },
        advance: () => {
          cursor += 1;
          return cursor < dataRows.length;
        },
        get: (key: string) => (dataRows[cursor] as unknown as Record<string, unknown>)[key],
      }),
    }),
  } as unknown as AnyChartInstance;

  const result = anyChartsToMaidr([[chart]], { id: 'fig' });
  return (result!.subplots[0][0].layers[0].data as HeatmapData).points;
}

/** Three of the four (x, y) pairs, so the fourth is a hole. */
const SPARSE: Row[] = [
  { x: 'X1', y: 'Y1', heat: 3 },
  { x: 'X2', y: 'Y1', heat: 4 },
  { x: 'X1', y: 'Y2', heat: 5 },
];

const DENSE: Row[] = [...SPARSE, { x: 'X2', y: 'Y2', heat: 0 }];

/**
 * The same grid, read through the **series** builder instead.
 *
 * There are two: `buildHeatmapLayer` reads a heat-map *series*, and
 * `buildHeatmapLayerFromChart` reads a chart that carries its rows directly.
 * They fill their rectangles independently, so both have to be asked.
 * @param dataRows - The rows the series carries
 * @returns The emitted `points` grid
 */
function seriesGridFor(dataRows: Row[]): (number | null)[][] {
  let cursor = -1;
  const series = {
    id: () => 0,
    name: () => 'heatmap',
    // `resolveTraceType` maps 'heatmap' and 'heat'; a chart-level 'heat-map'
    // is matched by substring one layer up, which is the other builder.
    seriesType: () => 'heatmap',
    getIterator: () => ({
      reset: () => {
        cursor = -1;
      },
      advance: () => {
        cursor += 1;
        return cursor < dataRows.length;
      },
      getIndex: () => cursor,
      get: (key: string) => (dataRows[cursor] as unknown as Record<string, unknown>)[key],
    }),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  } as unknown as AnyChartSeries;

  // No chart-level `getType`: that is what routes a chart carrying its own
  // rows to `buildHeatmapLayerFromChart`, and this case is about the series
  // builder instead.
  const chart = {
    title: () => 'Heat',
    container: () => '',
    getSeriesCount: () => 1,
    getSeriesAt: (i: number) => (i === 0 ? series : null),
  } as unknown as AnyChartInstance;

  const result = anyChartsToMaidr([[chart]], { id: 'fig' });
  return (result!.subplots[0][0].layers[0].data as HeatmapData).points;
}

describe('an anychart heat map whose rows do not fill the grid', () => {
  it('leaves the unnamed cell absent rather than reading it as zero', () => {
    expect(gridFor(SPARSE)).toEqual([[3, 4], [5, null]]);
  });

  it('is no longer indistinguishable from one recording a zero', () => {
    expect(gridFor(DENSE)).toEqual([[3, 4], [5, 0]]);
    expect(gridFor(SPARSE)).not.toEqual(gridFor(DENSE));
  });

  it('does the same when the rows arrive on a series', () => {
    expect(seriesGridFor(SPARSE)).toEqual([[3, 4], [5, null]]);
    expect(seriesGridFor(DENSE)).toEqual([[3, 4], [5, 0]]);
  });
});
