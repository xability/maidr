/**
 * Chart geometry helpers for the amCharts 5 adapter.
 *
 * amCharts renders every chart of one `Root` into shared canvases, so the only
 * way to know where a panel sits is to ask its sprites for pixel geometry.
 * These helpers read a chart's plot-area bounds (used to clip highlight boxes
 * to the owning panel) and cluster multiple charts into a row-major grid that
 * mirrors their on-screen arrangement (vertical/horizontal/Grid layouts).
 */

import type { AmBounds, AmChart, AmSprite } from './types';

/**
 * Read the plot-area bounds (CSS px, root-relative) used to clip highlights.
 * Tries `globalBounds()`, then `toGlobal()` + `width()/height()`; returns
 * `null` if neither is available (the overlay's `overflow:hidden` still clips
 * to the chart box).
 */
export function readPlotBounds(chart: AmChart): AmBounds | null {
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

/**
 * Read a pie panel's bounds as the union of its wedges' global boxes.
 *
 * An am5percent `PieChart` has no `plotContainer` — it has no plot area, which
 * is why {@link AmChart.plotContainer} is optional — so {@link readPlotBounds}
 * reports nothing for it and the binder, which suppresses a highlight it cannot
 * clip to a panel, would leave every pie in a multi-panel root unhighlighted.
 * Each slice is a sprite with `globalBounds()`, and the union of those boxes is
 * the rectangle the pie occupies: the panel rectangle the overlay needs, in the
 * same root-relative CSS px `readPlotBounds` returns.
 *
 * Returns `null` when no wedge reports usable geometry — an XY chart, whose
 * data items carry no `slice` at all, or a pie asked before its first layout.
 * The caller then behaves exactly as it does today, so a chart this cannot
 * measure loses a highlight rather than gaining a misplaced one.
 */
export function readSliceBounds(chart: AmChart): AmBounds | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  try {
    for (const series of chart.series.values) {
      for (const dataItem of series.dataItems) {
        const slice = dataItem.get('slice') as AmSprite | undefined;
        const bounds = slice?.globalBounds?.();
        if (!bounds) {
          continue;
        }
        const { left: l, right: r, top: t, bottom: b } = bounds;
        if (![l, r, t, b].every(Number.isFinite)) {
          continue;
        }
        left = Math.min(left, l, r);
        right = Math.max(right, l, r);
        top = Math.min(top, t, b);
        bottom = Math.max(bottom, t, b);
      }
    }
  } catch {
    // Fall through; a chart mid-teardown reports no panel rectangle.
    return null;
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null;
  }
  return { left, top, right, bottom };
}

/** A chart paired with the normalized geometry used for grid clustering. */
interface ChartCell {
  chart: AmChart;
  top: number;
  left: number;
  height: number;
}

/**
 * Cluster charts into a row-major grid matching their visual arrangement.
 *
 * Charts are grouped into rows by root-relative top coordinate (tolerance:
 * half the smaller chart height, so slight offsets from titles or legends do
 * not split a row) and sorted left-to-right within each row. Handles
 * vertical, horizontal, and Grid layouts uniformly without depending on
 * layout internals.
 *
 * Rows are emitted BOTTOM-first (the grammar's native matplotlib convention:
 * the core's `MovableGrid` maps UPWARD to `row + 1`). amCharts renders to
 * canvas, so the core's DOM layout pass cannot measure panel positions and
 * always takes its no-inversion fallback — emitting the bottom row as data
 * row 0 is the only way to make ArrowUp move visually up. The trade-off is
 * that panel numbering ("Subplot 1") starts at the bottom-left panel.
 *
 * Falls back to a single row in insertion order when any chart's geometry is
 * unavailable (e.g. before layout, on the JSON `fromAmCharts` path).
 */
export function computeChartGrid(charts: AmChart[]): AmChart[][] {
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

  // Bottom row first (see doc comment): reverse the top-sorted row order.
  return rows
    .reverse()
    .map(row => [...row].sort((a, b) => a.left - b.left).map(cell => cell.chart));
}
