/**
 * D3 binder for bar charts.
 *
 * Extracts data from D3.js-rendered bar chart SVG elements and generates
 * the MAIDR JSON schema for accessible bar chart interaction.
 */

import type { BarPoint, Maidr, MaidrLayer } from '../type/grammar';
import type { D3BarConfig, D3BinderResult } from './types';
import { Orientation, TraceType } from '../type/grammar';
import { buildAxes, generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Binds a D3.js bar chart to MAIDR, generating the accessible data representation.
 *
 * Extracts data from D3-bound SVG elements (`<rect>`, `<path>`, etc.) and
 * produces a complete {@link Maidr} data structure for sonification, text
 * descriptions, braille output, and keyboard navigation.
 *
 * @param svg - The SVG element (or container) containing the D3 bar chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // D3 bar chart with data bound to <rect> elements
 * const result = bindD3Bar(svgElement, {
 *   selector: 'rect.bar',
 *   title: 'Sales by Quarter',
 *   axes: { x: 'Quarter', y: 'Revenue' },
 *   x: 'quarter',     // property name on the bound datum
 *   y: 'revenue',     // property name on the bound datum
 * });
 *
 * // Use with maidr-data attribute
 * svgElement.setAttribute('maidr-data', JSON.stringify(result.maidr));
 *
 * // Or use with React
 * <Maidr data={result.maidr}><svg>...</svg></Maidr>
 * ```
 */
export function bindD3Bar(svg: Element, config: D3BarConfig): D3BinderResult {
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
    orientation = Orientation.VERTICAL,
  } = config;

  const elements = queryD3Elements(svg, selector);

  const data: BarPoint[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }
    return {
      x: resolveAccessor<string | number>(datum, xAccessor, index) as string | number,
      y: resolveAccessor<number | string>(datum, yAccessor, index) as number | string,
    };
  });

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.BAR,
    title,
    selectors: scopeSelector(svg, selector),
    orientation,
    axes: buildAxes(axes, format),
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
