import type { MaidrLayer } from '@type/grammar';
import { TraceType } from '@type/grammar';
import { SmoothTrace } from './smooth';
import { SmoothTraceSvgXY } from './smoothSvgXY';
import { ViolinKdeTrace } from './violinKde';

/**
 * Type guard to check if a point contains svg_x and svg_y numeric coordinates.
 * @param pt - The point object to check
 * @returns True if the point has valid svg_x and svg_y properties
 */
function isSmoothPoint(pt: any): pt is { svg_x: number; svg_y: number } {
  return typeof pt?.svg_x === 'number' && typeof pt?.svg_y === 'number';
}

/**
 * Factory function to create the appropriate SmoothTrace instance based on layer data and context.
 *
 * Uses structural detection (performed upstream) to identify violin plot KDE layers:
 * if the subplot contains both BOX and SMOOTH layers, callers pass `isViolinPlot=true`
 * and this factory creates a ViolinKdeTrace for SMOOTH layers. Otherwise, it creates a
 * SmoothTrace or SmoothTraceSvgXY based on the data format.
 *
 * Note: Structural detection (BOX + SMOOTH in same subplot) is used to avoid plot-specific
 * metadata in the general MaidrLayer interface. This approach works well in practice because:
 * - Regular box plots only contain BOX layers
 * - Regular smooth plots (regression lines) only contain SMOOTH layers
 * - Violin plots are the only plot type that combines both in the same subplot
 *
 * Edge case: If a subplot intentionally combines an independent box plot and regression line,
 * this detection would incorrectly identify it as a violin plot. This is rare in practice.
 *
 * @param layer - The MAIDR layer data for the smooth trace
 * @param isViolinPlot - Optional hint that this subplot is a violin plot
 *                       (BOX + SMOOTH present in the same subplot).
 * @returns A SmoothTrace instance:
 *          - ViolinKdeTrace if this is a violin plot KDE layer (BOX + SMOOTH detected upstream)
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
