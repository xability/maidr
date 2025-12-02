import type { MaidrLayer } from '@type/grammar';
import { SmoothTrace } from './smooth';
import { SmoothTraceSvgXY } from './smoothSvgXY';

/**
 * Type guard to check if a point contains svg_x and svg_y numeric coordinates.
 * @param pt - The point object to check
 * @returns True if the point has valid svg_x and svg_y properties
 */
function isSmoothPoint(pt: any): pt is { svg_x: number; svg_y: number } {
  return typeof pt?.svg_x === 'number' && typeof pt?.svg_y === 'number';
}

/**
 * Factory function that creates the appropriate smooth trace instance based on data structure.
 * @param layer - The MAIDR layer containing smooth trace data
 * @returns SmoothTraceSvgXY if data contains svg_x/svg_y coordinates, otherwise SmoothTrace
 */
export function createSmoothTrace(layer: MaidrLayer): SmoothTrace | SmoothTraceSvgXY {
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
