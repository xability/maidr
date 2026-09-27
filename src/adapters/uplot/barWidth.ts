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
 * @returns The first and last pixel of the run, or `null` when the centre is
 *   transparent (nothing is drawn there)
 */
export function colorRunAround(
  row: ArrayLike<number>,
  width: number,
  center: number,
): { start: number; end: number } | null {
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

  const extend = (step: 1 | -1): number => {
    let edge = center;
    let missed = 0;
    for (let i = center + step; i >= 0 && i < width; i += step) {
      if (sameColor(pixelAt(row, i), color)) {
        edge = i;
        missed = 0;
      } else if (++missed > MAX_INTERRUPTION) {
        break;
      }
    }
    return edge;
  };
  return { start: extend(-1), end: extend(1) };
}

/**
 * How wide a bar is drawn across its middle, in CSS pixels, or `null` when
 * the canvas cannot be read.
 *
 * @param u - The instance
 * @param center - CSS pixel position of the bar's centre, in the plotting area
 * @param across - CSS pixel position along the bar's length at which to measure
 * @param horizontal - Whether the bars lie along the x axis (`ori: 1`)
 * @returns The width, or `null`
 */
export function measuredBarWidth(
  u: UPlotInstance,
  center: number,
  across: number,
  horizontal: boolean,
): number | null {
  const ctx = u.ctx;
  const bbox = u.bbox;
  const plotWidth = u.over.clientWidth;
  const plotHeight = u.over.clientHeight;
  if (!ctx || !bbox || plotWidth <= 0 || plotHeight <= 0 || typeof ctx.getImageData !== 'function') {
    return null;
  }
  // bbox is in device pixels; the plotting area in CSS pixels.
  const ratio = horizontal ? bbox.height / plotHeight : bbox.width / plotWidth;
  try {
    if (horizontal) {
      const x = Math.round(bbox.left + across * (bbox.width / plotWidth));
      const image = ctx.getImageData(x, Math.round(bbox.top), 1, Math.round(bbox.height));
      const run = colorRunAround(image.data, image.height, Math.round(center * ratio));
      return run === null ? null : (run.end - run.start + 1) / ratio;
    }
    const y = Math.round(bbox.top + across * (bbox.height / plotHeight));
    const image = ctx.getImageData(Math.round(bbox.left), y, Math.round(bbox.width), 1);
    const run = colorRunAround(image.data, image.width, Math.round(center * ratio));
    return run === null ? null : (run.end - run.start + 1) / ratio;
  } catch (error) {
    // A canvas that cannot be read back (tainted by a cross-origin image)
    // keeps uPlot's default width.
    console.warn('[maidr/uplot] Could not measure the bar from the canvas:', error);
    return null;
  }
}
