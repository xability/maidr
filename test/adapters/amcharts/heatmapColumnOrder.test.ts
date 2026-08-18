/**
 * Which end of an inversed x renderer an amCharts heatmap's first column sits
 * at (#1012).
 *
 * #981 turned the rows over to match the y renderer and never asked the x
 * renderer anything, so a chart with `AxisRendererX({ inversed: true })` was
 * announced left to right while it was drawn right to left.
 *
 * Measured on amCharts 5 bundled with esbuild and rendered in Chromium, a
 * three by two `ColumnSeries` grid on two `CategoryAxis`, reading each drawn
 * column's own global x:
 *
 *   x inversed=false   renderer setting=false   columns left→right: c0, c1, c2
 *   x inversed=true    renderer setting=true    columns left→right: c2, c1, c0
 *   data item order                             c0, c1, c2  — both times
 *
 * The items arrive in the axis' own order either way. Only the drawing moves,
 * which is why the answer has to come from the renderer.
 *
 * The two axes take opposite answers to the same question, and that is not an
 * inconsistency: amCharts counts a y axis from the bottom and an x axis from
 * the left, so an unreversed y has to be turned over and an unreversed x does
 * not.
 *
 * One-sided, like #982: amCharts paints to canvas, `buildHeatmapLayer` emits
 * no selectors, and there is no highlight index keyed to the column order.
 */
import type { HeatmapData } from '@type/grammar';
import { extractHeatmapData } from '@adapters/amcharts/extractor';
import { describe, expect, it } from '@jest/globals';

/** Columns in the order amCharts hands its data items over. */
const LAID_OUT = ['c0', 'c1', 'c2'];

/**
 * A heatmap series whose data items arrive in amCharts' own order.
 * @param xInversed - Whether the x renderer is inversed
 * @param yInversed - Whether the y renderer is inversed
 * @returns The fake series
 */
function heatmapSeries(
  xInversed: boolean,
  yInversed: boolean,
): Parameters<typeof extractHeatmapData>[0] {
  const dataItems = [];
  for (const row of ['r0', 'r1']) {
    for (const col of LAID_OUT) {
      const values: Record<string, unknown> = {
        categoryY: row,
        categoryX: col,
        // r0 holds 1..3 and r1 holds 4..6, both running up the columns, so
        // every cell is distinct and a transposition cannot hide.
        value: (row === 'r0' ? 0 : 3) + LAID_OUT.indexOf(col) + 1,
      };
      dataItems.push({ get: (key: string) => values[key] });
    }
  }

  const axisFor = (inversed: boolean): unknown => {
    const renderer = { get: (key: string) => (key === 'inversed' ? inversed : undefined) };
    return { get: (key: string) => (key === 'renderer' ? renderer : undefined) };
  };
  const xAxis = axisFor(xInversed);
  const yAxis = axisFor(yInversed);

  return {
    dataItems,
    get: (key: string) => (key === 'xAxis' ? xAxis : key === 'yAxis' ? yAxis : undefined),
  } as unknown as Parameters<typeof extractHeatmapData>[0];
}

/**
 * The heatmap data a series converts to.
 * @param xInversed - Whether the x renderer is inversed
 * @param yInversed - Whether the y renderer is inversed
 * @returns The emitted data
 */
function dataFor(xInversed: boolean, yInversed = false): HeatmapData {
  const data = extractHeatmapData(heatmapSeries(xInversed, yInversed));
  if (!data) {
    throw new Error('no data emitted');
  }
  return data;
}

describe('which way an amcharts heatmap\'s columns are read', () => {
  it('leaves an ordinary x renderer in the order the items arrived', () => {
    // An unreversed x already draws its first category at the left, which is
    // the end `HeatmapData` lists from — so unlike the rows, nothing moves.
    expect(dataFor(false).x).toEqual(['c0', 'c1', 'c2']);
  });

  it('turns an inversed x renderer over', () => {
    expect(dataFor(true).x).toEqual(['c2', 'c1', 'c0']);
  });

  it('carries every value across with its own column', () => {
    const plain = dataFor(false);
    const inversed = dataFor(true);

    const columnOf = (data: HeatmapData, label: string): number[] => {
      const index = data.x.indexOf(label);
      return data.points.map(row => row[index]);
    };

    expect(columnOf(inversed, 'c0')).toEqual(columnOf(plain, 'c0'));
    expect(columnOf(inversed, 'c2')).toEqual(columnOf(plain, 'c2'));
  });

  it('still turns the rows over for an ordinary y renderer', () => {
    // #981's half has to survive the columns moving. `r1` is drawn above `r0`
    // on an unreversed y, so the layer leads with it.
    expect(dataFor(true).y).toEqual(['r1', 'r0']);
  });

  it('turns the two axes over independently', () => {
    // Both inversed: the columns flip, and the rows are left alone because an
    // inversed y already counts from the top.
    const data = dataFor(true, true);

    expect(data.x).toEqual(['c2', 'c1', 'c0']);
    expect(data.y).toEqual(['r0', 'r1']);
    expect(data.points).toEqual([[3, 2, 1], [6, 5, 4]]);
  });
});
