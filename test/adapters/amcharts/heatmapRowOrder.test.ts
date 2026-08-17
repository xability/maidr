/**
 * An amCharts heatmap has to be emitted top row first (#981).
 *
 * `HeatmapData` runs top-first and `Heatmap` turns it over so its own row 0 is
 * the bottom of the drawn grid, which is what makes ArrowUp move visually up.
 * `extractHeatmapData` took its rows from `series.dataItems` order and never
 * consulted the axis, so an ordinary heatmap arrived bottom-first and was
 * navigated upside down.
 *
 * Measured on amCharts 5 bundled with esbuild and rendered in Chromium, reading
 * each drawn column's own vertical position — amCharts' y grows downward, so a
 * larger number is lower on screen — for categories
 * `['first', 'second', 'third']` with the renderer left at its default:
 *
 *   first  (category index 0)  y = 437.8   <- bottom
 *   second                     y = 289.8
 *   third                      y = 141.8   <- top
 *
 * and `yRenderer.get('inversed')` reads `false`.
 *
 * The fix is one-sided, unlike plotly (#972) and Highcharts (#975): amCharts
 * paints to canvas, so `buildHeatmapLayer` emits no selectors and there is no
 * highlight index keyed to the row order.
 */
import type { HeatmapData } from '@type/grammar';
import { extractHeatmapData } from '@adapters/amcharts/extractor';
import { describe, expect, it } from '@jest/globals';

/** Rows in the order amCharts lays its data items out: category index 0 first. */
const LAID_OUT = ['first', 'second', 'third'];
/** The same rows in the order they are drawn, top first. */
const DRAWN = ['third', 'second', 'first'];

/**
 * A heatmap series whose data items arrive in amCharts' own order.
 * @param inversed - Whether the y renderer is inversed
 * @returns The fake series
 */
function heatmapSeries(inversed: boolean): Parameters<typeof extractHeatmapData>[0] {
  const dataItems = [];
  for (const row of LAID_OUT) {
    for (const col of ['c1', 'c2']) {
      const values: Record<string, unknown> = {
        categoryY: row,
        categoryX: col,
        value: LAID_OUT.indexOf(row) * 2 + (col === 'c1' ? 1 : 2),
      };
      dataItems.push({ get: (key: string) => values[key] });
    }
  }

  const renderer = { get: (key: string) => (key === 'inversed' ? inversed : undefined) };
  const yAxis = { get: (key: string) => (key === 'renderer' ? renderer : undefined) };
  return {
    dataItems,
    get: (key: string) => (key === 'yAxis' ? yAxis : undefined),
  } as unknown as Parameters<typeof extractHeatmapData>[0];
}

/**
 * The heatmap data a series converts to.
 * @param inversed - Whether the y renderer is inversed
 * @returns The emitted data
 */
function dataFor(inversed: boolean): HeatmapData {
  const data = extractHeatmapData(heatmapSeries(inversed));
  if (!data)
    throw new Error('no data emitted');
  return data;
}

describe('an ordinary amcharts heatmap', () => {
  it('is emitted top row first', () => {
    // 'third' is the row drawn at the top, so the layer leads with it.
    // Before the fix this was ['first', 'second', 'third'].
    expect(dataFor(false).y).toEqual(DRAWN);
  });

  it('turns the values over with their labels', () => {
    expect(dataFor(false).points).toEqual([[5, 6], [3, 4], [1, 2]]);
  });

  it('leaves the columns alone', () => {
    expect(dataFor(false).x).toEqual(['c1', 'c2']);
  });
});

describe('an amcharts heatmap on an inversed renderer', () => {
  it('is left as amCharts laid it out', () => {
    // An inversed renderer already counts from the top, which is the order the
    // grammar asks for. Reversing would stand it back on its head.
    expect(dataFor(true).y).toEqual(LAID_OUT);
    expect(dataFor(true).points).toEqual([[1, 2], [3, 4], [5, 6]]);
  });
});

describe('either way round', () => {
  it('keeps every value on its own label', () => {
    // The pairing survived the bug too — both arrays travel together — so it
    // is the part a fix must not break rather than the part it fixes.
    for (const inversed of [false, true]) {
      const { y, points } = dataFor(inversed);

      expect(points[y.indexOf('first')]).toEqual([1, 2]);
      expect(points[y.indexOf('second')]).toEqual([3, 4]);
      expect(points[y.indexOf('third')]).toEqual([5, 6]);
    }
  });
});
