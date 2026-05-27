/**
 * D3 binder for smooth/regression curves.
 *
 * Extracts data from D3.js-rendered smooth curve SVG elements and generates
 * the MAIDR JSON schema for accessible smooth plot interaction.
 */

import type { Maidr, MaidrLayer, SmoothPoint } from '../../../type/grammar';
import type { D3BinderResult, D3SmoothConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { applyMaidrData, buildAxes, buildNoDatumError, buildNoElementsError, generateId, queryD3Elements, resolveAccessor } from '../util';

/**
 * Binds a D3.js smooth/regression curve to MAIDR.
 *
 * Smooth plots represent fitted curves (e.g., LOESS, regression lines).
 * The data includes both the data-space coordinates (x, y) and SVG-space
 * coordinates (svg_x, svg_y) for each point along the curve.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: both the data-space (`x`/`y`) and SVG-space
 * (`svg_x`/`svg_y`) coords bound to each curve point. Calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No
 * elements found for selector …" or "Property '…' not found on datum".
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
    autoApply,
  } = config;

  const elements = queryD3Elements(svg, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(svg, selector, 'smooth curve point');
  }

  // Guard: smooth curves need SVG-space coords so MAIDR can highlight points
  // on-screen. If neither the user nor the datum provides them, throw an
  // actionable error instead of the generic "Property 'svg_x' not found".
  const firstDatum = elements[0].datum;
  const configRecord = config as unknown as Record<string, unknown>;
  const userSetSvgX = configRecord.svgX !== undefined;
  const userSetSvgY = configRecord.svgY !== undefined;
  if (
    firstDatum
    && typeof firstDatum === 'object'
    && !userSetSvgX
    && !userSetSvgY
  ) {
    const record = firstDatum as Record<string, unknown>;
    if (!('svg_x' in record) || !('svg_y' in record)) {
      throw new Error(
        `Smooth curve datum at "${selector}" lacks \`svg_x\` / \`svg_y\` `
        + `SVG-space coordinates, which MAIDR uses to position highlights `
        + `on the curve. Either bind data with \`svg_x\` / \`svg_y\` keys, `
        + `or pass \`svgX\` / \`svgY\` accessor functions that compute the `
        + `SVG-space coords from your D3 scales, e.g. `
        + `\`svgX: d => xScale(d.x), svgY: d => yScale(d.yHat)\`. `
        + `Available keys on the datum: ${Object.keys(record).join(', ') || '(none)'}.`,
      );
    }
  }

  // Extract points - group into a single series (2D array with one row)
  const points: SmoothPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
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
    // Wrap in an array so the per-line length check inside
    // `mapToSvgElements` compares array length to line count (1). A bare
    // string would compare character count to 1 and always fail.
    selectors: [scopeSelector(svg, selector)],
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
