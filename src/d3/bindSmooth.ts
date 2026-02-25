/**
 * D3 binder for smooth/regression curves.
 *
 * Extracts data from D3.js-rendered smooth curve SVG elements and generates
 * the MAIDR JSON schema for accessible smooth plot interaction.
 */

import type { Maidr, MaidrLayer, SmoothPoint } from '../type/grammar';
import type { D3BinderResult, D3SmoothConfig } from './types';
import { TraceType } from '../type/grammar';
import { generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Binds a D3.js smooth/regression curve to MAIDR.
 *
 * Smooth plots represent fitted curves (e.g., LOESS, regression lines).
 * The data includes both the data-space coordinates (x, y) and SVG-space
 * coordinates (svg_x, svg_y) for each point along the curve.
 *
 * @param svg - The SVG element containing the D3 smooth curve.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Smooth(svgElement, {
 *   selector: 'circle.smooth-point',
 *   title: 'LOESS Regression',
 *   axes: { x: 'X', y: 'Y (predicted)' },
 *   x: 'x',
 *   y: 'yPredicted',
 *   svgX: 'screenX',
 *   svgY: 'screenY',
 * });
 * ```
 */
export function bindD3Smooth(svg: Element, config: D3SmoothConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    x: xAccessor = 'x',
    y: yAccessor = 'y',
    svgX: svgXAccessor = 'svg_x',
    svgY: svgYAccessor = 'svg_y',
  } = config;

  const elements = queryD3Elements(svg, selector);

  // Extract points - group into a single series (2D array with one row)
  const points: SmoothPoint[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }
    return {
      x: resolveAccessor<number>(datum, xAccessor, index),
      y: resolveAccessor<number>(datum, yAccessor, index),
      svg_x: resolveAccessor<number>(datum, svgXAccessor, index),
      svg_y: resolveAccessor<number>(datum, svgYAccessor, index),
    };
  });

  const data: SmoothPoint[][] = [points];

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.SMOOTH,
    title,
    selectors: scopeSelector(svg, selector),
    axes: axes
      ? {
          ...axes,
          ...(format ? { format } : {}),
        }
      : undefined,
    data,
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{ layers: [layer] }]],
  };

  return { maidr, layer };
}
