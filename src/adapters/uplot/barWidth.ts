/**
 * Measures how wide uPlot drew a bar, by reading the canvas.
 *
 * uPlot's bar builder takes its width from options closed over inside the
 * `paths` function (`size`, `gap`, `align`), and keeps no record of the
 * rectangles it drew, so nothing on the instance says how wide a bar is. The
 * canvas does: across the middle of a bar, the bar's own color runs from one
 * edge to the other. Where the canvas cannot be read, the caller falls back to
 * uPlot's default width.
 */

import type { UPlotInstance } from './types';

/** Per-channel difference still counted as the bar's color (antialiasing). */
const COLOR_TOLERANCE = 24;

/** Pixels of another color a run may cross -- a grid line seen through a translucent fill. */
const MAX_INTERRUPTION = 2;

/** How far either side of the centre the bar's color is sampled, in pixels. */
const SAMPLE_RADIUS = 3;

/** The color of pixel `i` of an RGBA row, packed for comparing. */
function pixelAt(row: ArrayLike<number>, i: number): [number, number, number, number] {
  const o = i * 4;
  return [row[o], row[o + 1], row[o + 2], row[o + 3]];
}

function sameColor(a: readonly number[], b: readonly number[]): boolean {
  return a.every((channel, c) => Math.abs(channel - b[c]) <= COLOR_TOLERANCE);
}

/** Limits on a run; see {@link colorRunAround}. */
export interface RunLimits {
  /**
   * How far the run may reach either side of the centre, in pixels: half the
   * bar's column, so touching bars of one color -- a histogram -- are not
   * read as one.
   */
  reach?: number;
  /**
   * Opaque pixels of any color the run takes in past its ends: the bar's
   * outline, which is drawn in the stroke color around the fill.
   */
  outline?: number;
}

/**
 * The span of the run of one color through `center` in a row of RGBA pixels.
 *
 * The color is the one most common within a few pixels of the centre, so a
 * vertical grid line drawn through the middle of a translucent bar is not
 * mistaken for the bar. The run may cross a pixel or two of another color for
 * the same reason.
 *
 * @param row - RGBA bytes, four per pixel
 * @param width - Pixels in the row
 * @param center - The pixel at the bar's centre
 * @param limits - How far the run may reach, and the outline it takes in
 * @returns The first and last pixel of the run, and whether it reached its
 *   limit on both sides (the bar fills its column), or `null` when the centre
 *   is transparent (nothing is drawn there)
 */
export function colorRunAround(
  row: ArrayLike<number>,
  width: number,
  center: number,
  limits: RunLimits = {},
): { start: number; end: number; filled: boolean } | null {
  if (center < 0 || center >= width) {
    return null;
  }
  const samples: [number, number, number, number][] = [];
  for (let i = Math.max(0, center - SAMPLE_RADIUS); i <= Math.min(width - 1, center + SAMPLE_RADIUS); i++) {
    samples.push(pixelAt(row, i));
  }
  let color = samples[0];
  let best = 0;
  for (const candidate of samples) {
    const count = samples.filter(sample => sameColor(sample, candidate)).length;
    if (count > best) {
      best = count;
      color = candidate;
    }
  }
  if (color[3] === 0) {
    return null;
  }

  const reach = limits.reach ?? Number.POSITIVE_INFINITY;
  const outline = limits.outline ?? 0;
  const inReach = (i: number): boolean => i >= 0 && i < width && Math.abs(i - center) <= reach;
  const extend = (step: 1 | -1): { edge: number; limited: boolean } => {
    let edge = center;
    let missed = 0;
    for (let i = center + step; ; i += step) {
      if (!inReach(i)) {
        // The run filled its column only when it was still going at the
        // column's edge -- not when it had already stopped short of it, and
        // not when the plot's edge cut it off.
        return { edge, limited: missed === 0 && i >= 0 && i < width };
      }
      if (sameColor(pixelAt(row, i), color)) {
        edge = i;
        missed = 0;
      } else if (++missed > MAX_INTERRUPTION) {
        break;
      }
    }
    // The outline: opaque pixels right after the fill.
    for (let taken = 0, i = edge + step; taken < outline && inReach(i) && pixelAt(row, i)[3] > 0; taken++, i += step) {
      edge = i;
    }
    return { edge, limited: false };
  };
  const left = extend(-1);
  const right = extend(1);
  return { start: left.edge, end: right.edge, filled: left.limited && right.limited };
}

/** Where and how to measure one bar; CSS pixels in the plotting area. */
export interface BarToMeasure {
  /** Position of the bar's centre across its width. */
  center: number;
  /** Positions of the bar's two ends along its length. */
  from: number;
  to: number;
  /** The bar's column: the most it can be wide. */
  column: number;
  /** The series' stroke width, drawn around the fill. */
  outline: number;
  /** Whether the bars lie along the x axis (`ori: 1`). */
  horizontal: boolean;
}

/**
 * Charts whose canvas cannot be read back. A canvas tainted by a cross-origin
 * image stays tainted, so it is tried -- and reported -- once.
 */
const unreadable = new WeakSet<UPlotInstance>();

/**
 * How wide a bar is drawn, in CSS pixels, or `null` when it cannot be read
 * off the canvas.
 *
 * @param u - The instance
 * @param bar - The bar
 * @returns The width, or `null`
 */
export function measuredBarWidth(u: UPlotInstance, bar: BarToMeasure): number | null {
  const ctx = u.ctx;
  const bbox = u.bbox;
  const plotWidth = u.over.clientWidth;
  const plotHeight = u.over.clientHeight;
  if (
    unreadable.has(u) || !ctx || !bbox || plotWidth <= 0 || plotHeight <= 0
    || typeof ctx.getImageData !== 'function'
  ) {
    return null;
  }
  // Measure across the part of the bar that is on screen: a bar zoomed past
  // the edge of the plot has its middle off the canvas.
  const extent = bar.horizontal ? plotWidth : plotHeight;
  const low = Math.max(0, Math.min(bar.from, bar.to));
  const high = Math.min(extent, Math.max(bar.from, bar.to));
  if (low > high) {
    return null;
  }
  const across = (low + high) / 2;
  // bbox is in device pixels; the plotting area in CSS pixels.
  const ratio = bar.horizontal ? bbox.height / plotHeight : bbox.width / plotWidth;
  const limits: RunLimits = {
    reach: (bar.column * ratio) / 2,
    outline: Math.round(bar.outline * ratio),
  };
  try {
    const image = bar.horizontal
      ? ctx.getImageData(Math.round(bbox.left + across * (bbox.width / plotWidth)), Math.round(bbox.top), 1, Math.round(bbox.height))
      : ctx.getImageData(Math.round(bbox.left), Math.round(bbox.top + across * (bbox.height / plotHeight)), Math.round(bbox.width), 1);
    const length = bar.horizontal ? image.height : image.width;
    const run = colorRunAround(image.data, length, Math.round(bar.center * ratio), limits);
    if (run === null) {
      return null;
    }
    // A bar that fills its column -- touching its neighbours -- is as wide
    // as the column.
    return run.filled ? bar.column : (run.end - run.start + 1) / ratio;
  } catch (error) {
    unreadable.add(u);
    console.warn('[maidr/uplot] Could not read the bar width off the canvas; using uPlot\'s default width:', error);
    return null;
  }
}
