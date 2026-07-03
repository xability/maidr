/**
 * Chart geometry helpers for the amCharts 5 adapter.
 *
 * amCharts renders every chart of one `Root` into shared canvases, so the only
 * way to know where a panel sits is to ask its sprites for pixel geometry.
 * These helpers read a chart's plot-area bounds (used to clip highlight boxes
 * to the owning panel) and cluster multiple charts into a row-major grid that
 * mirrors their on-screen arrangement (vertical/horizontal/Grid layouts).
 */

import type { AmBounds, AmXYChart } from './types';

/**
 * Read the plot-area bounds (CSS px, root-relative) used to clip highlights.
 * Tries `globalBounds()`, then `toGlobal()` + `width()/height()`; returns
 * `null` if neither is available (the overlay's `overflow:hidden` still clips
 * to the chart box).
 */
export function readPlotBounds(chart: AmXYChart): AmBounds | null {
  const pc = chart.plotContainer;
  if (!pc) {
    return null;
  }
  try {
    const bounds = pc.globalBounds?.();
    if (bounds && Number.isFinite(bounds.left) && Number.isFinite(bounds.bottom)) {
      return bounds;
    }
    if (pc.toGlobal && pc.width && pc.height) {
      const tl = pc.toGlobal({ x: 0, y: 0 });
      return { left: tl.x, top: tl.y, right: tl.x + pc.width(), bottom: tl.y + pc.height() };
    }
  } catch {
    // Fall through; overlay overflow:hidden still clips to the chart box.
  }
  return null;
}

/** A chart paired with the normalized geometry used for grid clustering. */
interface ChartCell {
  chart: AmXYChart;
  top: number;
  left: number;
  height: number;
}

/**
 * Cluster charts into a row-major grid matching their visual arrangement.
 *
 * Charts are grouped into rows by root-relative top coordinate (tolerance:
 * half the smaller chart height, so slight offsets from titles or legends do
 * not split a row) and sorted left-to-right within each row — visual reading
 * order, top-left first. Handles vertical, horizontal, and Grid layouts
 * uniformly without depending on layout internals.
 *
 * Falls back to a single row in insertion order when any chart's geometry is
 * unavailable (e.g. before layout, on the JSON `fromAmCharts` path).
 */
export function computeChartGrid(charts: AmXYChart[]): AmXYChart[][] {
  if (charts.length <= 1) {
    return [charts];
  }

  const cells: ChartCell[] = [];
  for (const chart of charts) {
    const bounds = readPlotBounds(chart);
    const height = bounds ? Math.abs(bounds.bottom - bounds.top) : 0;
    if (!bounds || height <= 0) {
      return [charts];
    }
    cells.push({
      chart,
      top: Math.min(bounds.top, bounds.bottom),
      left: Math.min(bounds.left, bounds.right),
      height,
    });
  }

  cells.sort((a, b) => a.top - b.top);

  const rows: ChartCell[][] = [];
  let currentRow: ChartCell[] = [cells[0]];
  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i];
    const rowRef = currentRow[0];
    const tolerance = Math.min(cell.height, rowRef.height) / 2;
    if (cell.top - rowRef.top < tolerance) {
      currentRow.push(cell);
    } else {
      rows.push(currentRow);
      currentRow = [cell];
    }
  }
  rows.push(currentRow);

  return rows.map(row =>
    [...row].sort((a, b) => a.left - b.left).map(cell => cell.chart),
  );
}
