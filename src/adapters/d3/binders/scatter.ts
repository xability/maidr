/**
 * D3 binder for scatter plots.
 *
 * Extracts data from D3.js-rendered scatter plot SVG elements and generates
 * the MAIDR JSON schema for accessible scatter plot interaction.
 */

import type { MaidrLayer, ScatterPoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3ScatterConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

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
  return finalizeSingleChart(svg, config, buildScatterLayer(svg, config));
}

/**
 * Pure extraction core for scatter plots. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildScatterLayer(root: Element, config: D3ScatterConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'scatter point');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<number>(
    config,
    'x',
    'x',
    ['xVal', 'xValue', 'x_val', 'xCoord'],
    firstDatum,
  );
  const yAccessor = inferAccessor<number>(
    config,
    'y',
    'y',
    ['yVal', 'yValue', 'y_val', 'yCoord', 'value'],
    firstDatum,
  );

  const data: ScatterPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    return {
      x: resolveAccessor<number>(datum, xAccessor, index),
      y: resolveAccessor<number>(datum, yAccessor, index),
    };
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.SCATTER,
    title,
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
