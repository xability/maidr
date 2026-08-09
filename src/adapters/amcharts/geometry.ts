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

/** Cardinal directions, where a circle reaches its extreme in x or y. */
const CARDINALS = [0, 90, 180, 270];

function numberSetting(slice: AmSprite, key: string): number | null {
  const value = slice.get?.(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The box a sprite reports, when it reports one with area.
 *
 * The area test is what makes this safe as a fallback: a slice that reports a
 * point rather than a box is rejected here rather than believed. Kept for any
 * build whose slices do report a real box but no radius to measure instead.
 */
function reportedBox(slice: AmSprite): AmBounds | null {
  const box = slice.globalBounds?.();
  if (!box || ![box.left, box.right, box.top, box.bottom].every(Number.isFinite)) {
    return null;
  }
  const hasArea = box.left !== box.right && box.top !== box.bottom;
  return hasArea ? box : null;
}

/**
 * The extent of one pie wedge: its own geometry, or the box it reports.
 *
 * Prefers {@link wedgeBounds} so a real amCharts slice is measured rather than
 * believed, and falls back to a reported box with area for a sprite that
 * carries no radius to measure.
 */
export function sliceExtent(slice: AmSprite): AmBounds | null {
  return wedgeBounds(slice) ?? reportedBox(slice);
}

/**
 * The bounding box of one pie wedge, computed from what a `Slice` reports.
 *
 * A `Slice` paints through a draw callback rather than through primitives that
 * feed amCharts' bounds accumulator, so `globalBounds()` answers a *degenerate
 * box at the wedge's own centre* — `left === right`, `top === bottom`, and
 * `width()`/`height()` both zero. Verified against amcharts5 5.20.1: measured
 * after `datavalidated`, again after a resize, always a point. Every highlight
 * derived from it collapsed and the overlay drew nothing at all (#774).
 *
 * The centre it reports is correct, though, and the wedge's extent is in its
 * settings, so the box is recoverable: walk the wedge's corners — both arc
 * ends at each radius — and add every cardinal angle the sweep crosses, which
 * is where the arc, not its endpoints, reaches furthest out. A wedge with no
 * inner radius includes its centre, which the inner-radius corners supply at
 * radius zero.
 *
 * @param slice - The `Slice` sprite behind one pie data item
 * @returns Its box in root-relative CSS px, or `null` when the sprite reports
 *   no usable centre or radius (an XY chart's sprites, or a pie asked before
 *   its first layout).
 */
export function wedgeBounds(slice: AmSprite): AmBounds | null {
  const box = slice.globalBounds?.();
  if (!box || ![box.left, box.right, box.top, box.bottom].every(Number.isFinite)) {
    return null;
  }
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;

  const radius = numberSetting(slice, 'radius');
  if (radius === null || radius <= 0) {
    return null;
  }
  const inner = Math.max(numberSetting(slice, 'innerRadius') ?? 0, 0);
  const start = numberSetting(slice, 'startAngle') ?? 0;
  const arc = numberSetting(slice, 'arc') ?? 360;

  // A full circle needs no angular reasoning, and asking for it would make
  // every cardinal a candidate anyway.
  if (Math.abs(arc) >= 360) {
    return { left: cx - radius, top: cy - radius, right: cx + radius, bottom: cy + radius };
  }

  const lo = Math.min(start, start + arc);
  const hi = Math.max(start, start + arc);

  const angles = [lo, hi];
  // Cardinals inside the sweep. The sweep can start anywhere, so test each
  // cardinal across the turns the sweep spans rather than only in [0, 360).
  const firstTurn = Math.floor(lo / 360) * 360;
  for (let turn = firstTurn; turn <= hi; turn += 360) {
    for (const cardinal of CARDINALS) {
      const angle = turn + cardinal;
      if (angle >= lo && angle <= hi) {
        angles.push(angle);
      }
    }
  }

  // Both radii at the arc ends, but only the outer radius at a cardinal in
  // between. A cardinal is where cos or sin is at a critical point, so it is
  // the angle that governs one extreme of the box — and there the larger
  // radius always reaches further in that direction. Sampling the inner
  // radius at an interior cardinal could therefore only ever repeat a bound
  // the outer one already set. At the sweep's two ends there is no such
  // critical point, so the inner corners are their own extremes and do need
  // sampling: that is what keeps a donut wedge from swallowing the centre.
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (angle: number, r: number): void => {
    const rad = (angle * Math.PI) / 180;
    xs.push(cx + r * Math.cos(rad));
    ys.push(cy + r * Math.sin(rad));
  };
  for (const angle of angles) {
    add(angle, radius);
  }
  add(lo, inner);
  add(hi, inner);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/**
 * Read a pie panel's bounds as the union of its wedges' boxes.
 *
 * An am5percent `PieChart` has no `plotContainer` — it has no plot area, which
 * is why {@link AmChart.plotContainer} is optional — so {@link readPlotBounds}
 * reports nothing for it and the binder, which suppresses a highlight it cannot
 * clip to a panel, would leave every pie in a multi-panel root unhighlighted.
 * The union of the wedges' boxes is the rectangle the pie occupies: the panel
 * rectangle the overlay needs, in the same root-relative CSS px
 * `readPlotBounds` returns.
 *
 * Each wedge is measured with {@link wedgeBounds} rather than by its reported
 * `globalBounds()`, which is a degenerate point (#774). Unioning those points
 * produced a zero-area panel rectangle — non-null, so the binder's
 * suppression never fired, and every highlight was instead clipped away to
 * nothing.
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
        const bounds = slice ? sliceExtent(slice) : undefined;
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
