import type { MaidrLayer } from '@type/grammar';
import { TraceType } from '@type/grammar';
import { SmoothTrace } from './smooth';
import { SmoothTraceSvgXY } from './smoothSvgXY';
import { ViolinKdeTrace } from './violinKde';

/**
 * Type guard to check if a point contains svg_x and svg_y numeric coordinates.
 * @param pt - The point object to check (unknown type for type safety)
 * @returns True if the point has valid svg_x and svg_y properties
 */
function isSmoothPoint(pt: unknown): pt is { svg_x: number; svg_y: number } {
  return (
    typeof pt === 'object'
    && pt !== null
    && 'svg_x' in pt
    && 'svg_y' in pt
    && typeof (pt as { svg_x: unknown }).svg_x === 'number'
    && typeof (pt as { svg_y: unknown }).svg_y === 'number'
  );
}

/**
 * Factory function to create the appropriate SmoothTrace instance based on layer data and context.
 *
 * Violin plot detection is performed upstream (in `Subplot`) using a two-tier approach:
 * 1. **Explicit metadata** (preferred): The Python backend sets `violinLayer` on layers
 *    that are part of a violin plot ('kde' for SMOOTH layers, 'mpl_violin'/'sns_violin' for BOX).
 * 2. **Structural fallback**: If no metadata is present (older backends), detection falls back
 *    to checking if both BOX and SMOOTH layers exist in the same subplot.
 *
 * This library-agnostic approach works for both Matplotlib and Seaborn violin plots,
 * and gracefully handles edge cases where a subplot might combine independent box and
 * regression plots (the explicit metadata ensures correct identification).
 *
 * @param layer - The MAIDR layer data for the smooth trace
 * @param isViolinPlot - Hint that this subplot is a violin plot (detected upstream via
 *                       explicit violinLayer metadata or structural fallback).
 * @returns A SmoothTrace instance:
 *          - ViolinKdeTrace if this is a violin plot KDE layer
 *          - SmoothTraceSvgXY if the data contains svg_x/svg_y coordinates
 *          - SmoothTrace otherwise (standard smooth/regression line)
 */
export function createSmoothTrace(
  layer: MaidrLayer,
  isViolinPlot: boolean = false,
): SmoothTrace | SmoothTraceSvgXY | ViolinKdeTrace {
  // Structural detection: BOX + SMOOTH in same subplot = violin plot.
  // The actual detection is performed by the caller; we only react to the hint.
  const isViolinKde = isViolinPlot && layer.type === TraceType.SMOOTH;

  if (isViolinKde) {
    return new ViolinKdeTrace(layer);
  }

  // If the data has svg_x/svg_y, use the special class
  const hasSvgXY = Array.isArray(layer.data)
    && layer.data.length > 0
    && Array.isArray(layer.data[0])
    && isSmoothPoint(layer.data[0][0]);

  if (hasSvgXY) {
    return new SmoothTraceSvgXY(layer);
  }
  return new SmoothTrace(layer);
}
