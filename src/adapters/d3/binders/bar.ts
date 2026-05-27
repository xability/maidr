/**
 * D3 binder for bar charts.
 *
 * Extracts data from D3.js-rendered bar chart SVG elements and generates
 * the MAIDR JSON schema for accessible bar chart interaction.
 */

import type { BarPoint, Maidr, MaidrLayer } from '../../../type/grammar';
import type { D3BarConfig, D3BinderResult } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { applyMaidrData, buildAxes, buildNoDatumError, buildNoElementsError, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/**
 * Binds a D3.js bar chart to MAIDR, generating the accessible data representation.
 *
 * Extracts data from D3-bound SVG elements (`<rect>`, `<path>`, etc.) and
 * produces a complete {@link Maidr} data structure for sonification, text
 * descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: the x (category) and y (numeric) properties
 * you name via the `x` / `y` accessors. Calling it before `.data().join()`
 * has run (or before the SVG is mounted) throws "No elements found for
 * selector …" or "Property '…' not found on datum".
 *
 * Typical call sites:
 * - **Vanilla JS:** right after your `selectAll(...).data(...).join(...)` chain.
 * - **React:** inside `useEffect`, never during render. Prefer
 *   {@link MaidrD3} / {@link useD3Adapter} from `maidr/react`, which
 *   handle the post-render timing for you.
 * - **Async data:** inside the `.then(...)` of your fetch, after drawing.
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
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
    orientation = Orientation.VERTICAL,
    autoApply,
  } = config;

  const elements = queryD3Elements(svg, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(svg, selector, 'bar');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string | number>(
    config,
    'x',
    'x',
    ['category', 'label', 'name', 'key', 'date'],
    firstDatum,
  );
  const yAccessor = inferAccessor<number | string>(
    config,
    'y',
    'y',
    ['value', 'count', 'amount', 'total'],
    firstDatum,
  );

  const data: BarPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    return {
      x: resolveAccessor<string | number>(datum, xAccessor, index),
      y: resolveAccessor<number | string>(datum, yAccessor, index),
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

  applyMaidrData(svg, maidr, autoApply);
  return { maidr, layer };
}
