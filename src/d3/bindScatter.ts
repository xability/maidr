/**
 * D3 binder for scatter plots.
 *
 * Extracts data from D3.js-rendered scatter plot SVG elements and generates
 * the MAIDR JSON schema for accessible scatter plot interaction.
 */

import type { Maidr, MaidrLayer, ScatterPoint } from '../type/grammar';
import type { D3BinderResult, D3ScatterConfig } from './types';
import { TraceType } from '../type/grammar';
import { generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Binds a D3.js scatter plot to MAIDR, generating the accessible data representation.
 *
 * Extracts x/y data from D3-bound SVG point elements (`<circle>`, `<use>`, etc.)
 * and produces a complete {@link Maidr} data structure.
 *
 * @param svg - The SVG element containing the D3 scatter plot.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Scatter(svgElement, {
 *   selector: 'circle.dot',
 *   title: 'Height vs Weight',
 *   axes: { x: 'Height (cm)', y: 'Weight (kg)' },
 *   x: 'height',
 *   y: 'weight',
 * });
 * ```
 */
export function bindD3Scatter(svg: Element, config: D3ScatterConfig): D3BinderResult {
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
  } = config;

  const elements = queryD3Elements(svg, selector);

  const data: ScatterPoint[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }
    return {
      x: resolveAccessor<number>(datum, xAccessor, index),
      y: resolveAccessor<number>(datum, yAccessor, index),
    };
  });

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.SCATTER,
    title,
    selectors: [scopeSelector(svg, selector)],
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
