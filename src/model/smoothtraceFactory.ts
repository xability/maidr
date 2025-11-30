import type { MaidrLayer } from '@type/grammar';
import { TraceType } from '@type/grammar';
import { SmoothTrace } from './smooth';
import { SmoothTraceSvgXY } from './smoothSvgXY';
import { ViolinKdeTrace } from './violinKde';

function isSmoothPoint(pt: any): pt is { svg_x: number; svg_y: number } {
  return typeof pt?.svg_x === 'number' && typeof pt?.svg_y === 'number';
}

export function createSmoothTrace(layer: MaidrLayer, allLayers?: MaidrLayer[]): SmoothTrace | SmoothTraceSvgXY | ViolinKdeTrace {
  // Structural detection: BOX + SMOOTH in same subplot = violin plot
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
