import type { MaidrLayer } from '@type/grammar';
import { SmoothTrace } from './smooth';
import { SmoothTraceSvgXY } from './smoothSvgXY';
import { ViolinTrace } from './violin';

function isSmoothPoint(pt: any): pt is { svg_x: number; svg_y: number } {
  return typeof pt?.svg_x === 'number' && typeof pt?.svg_y === 'number';
}

function isViolinPoint(pt: any): pt is { density?: number } {
  return pt && typeof pt === 'object' && 'density' in pt;
}

export function createSmoothTrace(layer: MaidrLayer, allLayers?: MaidrLayer[]): SmoothTrace | SmoothTraceSvgXY | ViolinTrace {
  console.log('========================================');
  console.log('SmoothTraceFactory: createSmoothTrace called with layer:', layer);
  console.log('SmoothTraceFactory: Layer type:', layer.type);
  console.log('SmoothTraceFactory: Layer data:', layer.data);
  console.log('========================================');
  
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

  console.log('SmoothTraceFactory: Checking layer data:', {
    isArray: Array.isArray(layer.data),
    hasData: layer.data && Array.isArray(layer.data) && layer.data.length > 0,
    firstRow: isSmoothData ? (layer.data as any[])[0] : null,
    isViolinPlot,
    firstPoint
  });
  
  console.log('SmoothTraceFactory: First point details:', firstPoint);
  console.log('SmoothTraceFactory: Has density property:', firstPoint && 'density' in firstPoint);
  console.log('SmoothTraceFactory: isViolinPoint check:', isViolinPlot);
  console.log('SmoothTraceFactory: Density value:', firstPoint?.density);

        if (isViolinPlot) {
          console.log('SmoothTraceFactory: Creating ViolinTrace');
          const violinTrace = new ViolinTrace(layer, allLayers);
          console.log('SmoothTraceFactory: ViolinTrace created successfully:', violinTrace);
          return violinTrace;
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
