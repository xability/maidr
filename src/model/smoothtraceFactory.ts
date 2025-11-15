import type { MaidrLayer } from '@type/grammar';
import { SmoothTrace } from './smooth';
import { SmoothTraceSvgXY } from './smoothSvgXY';
import { ViolinTrace } from './violin';

function isSmoothPoint(pt: any): pt is { svg_x: number; svg_y: number } {
  return typeof pt?.svg_x === 'number' && typeof pt?.svg_y === 'number';
}

/**
 * Type guard to check if a point is a violin plot point by detecting the presence of a density property.
 * Violin plots use density values to represent the kernel density estimation (KDE) curve width.
 *
 * @param pt - The point to check, can be any type
 * @returns true if pt is an object with a 'density' property, false otherwise.
 *          When true, TypeScript narrows the type to { density?: number }
 */
function isViolinPoint(pt: any): pt is { density?: number } {
  return pt && typeof pt === 'object' && 'density' in pt;
}

export function createSmoothTrace(layer: MaidrLayer, allLayers?: MaidrLayer[]): SmoothTrace | SmoothTraceSvgXY | ViolinTrace {
  // Check if this is a violin plot (has density data)
  // First ensure we have the right data structure for smooth plots
  const isSmoothData = Array.isArray(layer.data) && layer.data.length > 0;
  let isViolinPlot = false;
  let firstPoint: any = null;

  if (isSmoothData) {
    const firstRow = (layer.data as any[])[0];
    if (Array.isArray(firstRow) && firstRow.length > 0) {
      firstPoint = firstRow[0];
      isViolinPlot = isViolinPoint(firstPoint);
    }
  }

  if (isViolinPlot) {
    return new ViolinTrace(layer, allLayers);
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
