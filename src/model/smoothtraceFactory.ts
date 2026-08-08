import type { MaidrLayer } from '@type/grammar';
import { SmoothTrace } from './smooth';
import { SmoothTraceSvgXY } from './smoothSvgXY';

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
 * Factory function to create the appropriate SmoothTrace instance based on layer data.
 *
 * Violin KDE traces are no longer created here — they use TraceType.VIOLIN_KDE
 * and are handled directly by TraceFactory.
 *
 * @param layer - The MAIDR layer data for the smooth trace
 * @returns A SmoothTrace instance:
 *          - SmoothTraceSvgXY if the data contains svg_x/svg_y coordinates
 *          - SmoothTrace otherwise (standard smooth/regression line)
 */
export function createSmoothTrace(
  layer: MaidrLayer,
): SmoothTrace | SmoothTraceSvgXY {
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
