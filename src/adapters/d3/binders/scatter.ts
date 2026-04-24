/**
 * D3 binder for scatter plots.
 *
 * Extracts data from D3.js-rendered scatter plot SVG elements and generates
 * the MAIDR JSON schema for accessible scatter plot interaction.
 */

import type { Maidr, MaidrLayer, ScatterPoint } from '../../../type/grammar';
import type { D3BinderResult, D3ScatterConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { applyMaidrData, buildAxes, buildNoDatumError, buildNoElementsError, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/**
 * Binds a D3.js scatter plot to MAIDR, generating the accessible data representation.
 *
 * Extracts x/y data from D3-bound SVG point elements (`<circle>`, `<use>`, etc.)
 * and produces a complete {@link Maidr} data structure.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: the numeric x/y bound to each point element.
 * Calling it before `.data().join()` has run (or before the SVG is mounted)
 * throws "No elements found for selector …" or "Property '…' not found on
 * datum".
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
    autoApply,
  } = config;

  const elements = queryD3Elements(svg, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(svg, selector, 'scatter point');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const configRecord = config as unknown as Record<string, unknown>;
  const xAccessor = inferAccessor<number>(
    configRecord,
    'x',
    'x',
    ['xVal', 'xValue', 'x_val', 'xCoord'],
    firstDatum,
  );
  const yAccessor = inferAccessor<number>(
    configRecord,
    'y',
    'y',
    ['yVal', 'yValue', 'y_val', 'yCoord', 'value'],
    firstDatum,
  );

  const data: ScatterPoint[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw buildNoDatumError(selector, index);
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
    selectors: scopeSelector(svg, selector),
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
