/**
 * D3 binder for histograms.
 *
 * Extracts data from D3.js-rendered histogram SVG elements and generates
 * the MAIDR JSON schema for accessible histogram interaction.
 */

import type { HistogramPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3HistogramConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * Binds a D3.js histogram to MAIDR, generating the accessible data representation.
 *
 * D3 histograms are typically created with `d3.bin()` (or `d3.histogram()` in v5),
 * which produces arrays with `x0` and `x1` properties for bin boundaries. This
 * binder extracts bin data from D3-bound rect elements.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: the bin boundaries (`x0`/`x1`) and count
 * bound to each bar — typically produced by `d3.bin()`. Calling it before
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
 * @param svg - The SVG element containing the D3 histogram.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // D3 histogram using d3.bin()
 * const result = bindD3Histogram(svgElement, {
 *   selector: 'rect.bar',
 *   title: 'Age Distribution',
 *   axes: { x: 'Age', y: 'Count' },
 *   x: (d) => `${d.x0}-${d.x1}`,
 *   y: (d) => d.length,
 *   xMin: 'x0',
 *   xMax: 'x1',
 *   yMin: () => 0,
 *   yMax: (d) => d.length,
 * });
 * ```
 */
export function bindD3Histogram(svg: Element, config: D3HistogramConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildHistogramLayer(svg, config));
}

/**
 * The bin edge to use when neither the caller nor the datum states one.
 *
 * A pre-aggregated histogram is read as a zero-width bin at its x value, which
 * works while that value is a number. Bin labels very often are not — a bar
 * bound to `{ label: '0-10', count: 5 }` coerces to `NaN`, and
 * `HistogramPoint` has nowhere to say the edge was never known: `Histogram`
 * puts both bounds straight into the range it announces on every arrow
 * keypress, and repeats them in the bin-range stat and two data-table columns.
 * So the reader is told the bin runs NaN to NaN, on every bin, for as long as
 * the chart exists. Saying so at bind time is the only place the author can
 * still act on it.
 *
 * @param xValue - The bar's x value
 * @param datum - The bar's bound datum, named in the error
 * @param index - The bar's index within the selection
 * @param selector - The user-provided selector, named in the error
 * @returns The x value as a number
 * @throws Error when the x value is not a number a bin could be placed at
 */
function zeroWidthBinEdge(
  xValue: string | number,
  datum: unknown,
  index: number,
  selector: string,
): number {
  const at = Number(xValue);
  if (Number.isFinite(at)) {
    return at;
  }

  const keys = typeof datum === 'object' && datum !== null ? Object.keys(datum) : [];
  throw new Error(
    `Histogram bar ${index} matched by "${selector}" states no bin bounds: its `
    + `datum carries no \`x0\` / \`x1\`, and its x value "${String(xValue)}" is `
    + `not a number the bin could be placed at. Bind \`d3.bin()\` output, which `
    + `carries \`x0\` / \`x1\`, or pass \`xMin\` / \`xMax\` accessors reading the `
    + `bin's own edges, e.g. \`xMin: d => d.from, xMax: d => d.to\`. Without `
    + `them every bin range the reader hears would be NaN. `
    + `Available keys on the datum: ${keys.join(', ') || '(none)'}.`,
  );
}

/**
 * Pure extraction core for histograms. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildHistogramLayer(root: Element, config: D3HistogramConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    x: xAccessor = 'x',
    y: yAccessor = 'y',
    xMin: xMinAccessor = 'x0',
    xMax: xMaxAccessor = 'x1',
    yMin: yMinAccessor = (_d: unknown, _i: number) => 0,
    yMax: yMaxAccessor,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'histogram bar');
  }

  // Fallback: when the user did NOT specify xMin/xMax accessors AND the
  // datum lacks `x0`/`x1` (i.e. the data is not raw d3.bin() output but
  // pre-aggregated bar-like data), treat the bin as a zero-width point at
  // `xValue`. This lets the binder work with `[ { x, count } ]`-shaped data.
  const userSetXMin = (config as unknown as Record<string, unknown>).xMin !== undefined;
  const userSetXMax = (config as unknown as Record<string, unknown>).xMax !== undefined;

  const data: HistogramPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    // For D3 bin data, the datum is typically an array with x0/x1 properties.
    // The "y" value is usually the array length (count of items in the bin).
    const xValue = resolveAccessor<string | number>(datum, xAccessor, index);
    const yValue = resolveAccessor<number | string>(datum, yAccessor, index);

    const xMin = userSetXMin
      ? resolveAccessor<number>(datum, xMinAccessor, index)
      : (resolveAccessorOptional<number>(datum, xMinAccessor, index)
        ?? zeroWidthBinEdge(xValue, datum, index, selector));
    const xMax = userSetXMax
      ? resolveAccessor<number>(datum, xMaxAccessor, index)
      : (resolveAccessorOptional<number>(datum, xMaxAccessor, index)
        ?? zeroWidthBinEdge(xValue, datum, index, selector));

    const yMin = resolveAccessor<number>(datum, yMinAccessor, index);
    const yMax = yMaxAccessor
      ? resolveAccessor<number>(datum, yMaxAccessor, index)
      : Number(yValue);

    return {
      x: xValue,
      y: yValue,
      xMin,
      xMax,
      yMin,
      yMax,
    };
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.HISTOGRAM,
    title,
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
