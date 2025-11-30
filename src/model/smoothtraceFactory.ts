import type { MaidrLayer } from '@type/grammar';
import { TraceType } from '@type/grammar';
import { SmoothTrace } from './smooth';
import { SmoothTraceSvgXY } from './smoothSvgXY';
import { ViolinKdeTrace } from './violinKde';

function isSmoothPoint(pt: any): pt is { svg_x: number; svg_y: number } {
  return typeof pt?.svg_x === 'number' && typeof pt?.svg_y === 'number';
}

/**
 * Factory function to create the appropriate SmoothTrace instance based on layer data and context.
 * 
 * Uses structural detection to identify violin plot KDE layers: if a SMOOTH layer is in the same
 * subplot as a BOX layer, it creates a ViolinKdeTrace. Otherwise, creates a SmoothTrace or
 * SmoothTraceSvgXY based on the data format.
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
 * @param allLayers - Optional array of all layers in the same subplot. Used for structural
 *                    detection of violin plots (BOX + SMOOTH in same subplot).
 * @returns A SmoothTrace instance:
 *          - ViolinKdeTrace if this is a violin plot KDE layer (BOX + SMOOTH detected)
 *          - SmoothTraceSvgXY if the data contains svg_x/svg_y coordinates
 *          - SmoothTrace otherwise (standard smooth/regression line)
 */
export function createSmoothTrace(layer: MaidrLayer, allLayers?: MaidrLayer[]): SmoothTrace | SmoothTraceSvgXY | ViolinKdeTrace {
  // Structural detection: BOX + SMOOTH in same subplot = violin plot
  // This avoids plot-specific metadata while maintaining architectural cleanliness
  const isViolinKde = allLayers !== undefined
    && allLayers.some(l => l.type === TraceType.BOX)
    && layer.type === TraceType.SMOOTH;

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
