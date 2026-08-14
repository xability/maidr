/**
 * D3 binder for the bar family: bar charts, Cleveland dot plots, lollipop
 * charts, and funnels.
 *
 * Extracts data from D3.js-rendered SVG elements and generates the MAIDR JSON
 * schema for accessible interaction. All four marks carry one category and one
 * value per element, which is why they share a single extraction core and
 * differ only in the trace type the layer announces.
 */

import type { BarPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { BarMarkTraceType, D3BarConfig, D3BinderResult, D3BuiltLayer } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

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
  return finalizeSingleChart(svg, config, buildBarLayer(svg, config));
}

/**
 * Binds a D3.js Cleveland dot plot to MAIDR.
 *
 * A dot plot is a bar chart drawn with a different mark: one category, one
 * value, navigated the same way. The extraction is therefore identical to
 * {@link bindD3Bar} — point `selector` at the `<circle>` marks so MAIDR
 * highlights the dots themselves — and only the announced chart type differs.
 *
 * Dot plots are usually drawn with the categories down the page. Pass
 * `orientation: Orientation.HORIZONTAL` (with `x` reading the value and `y`
 * the category) so the axes are announced the way the chart was drawn.
 *
 * @param svg - The SVG element (or container) containing the D3 dot plot.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Dot(svgElement, {
 *   selector: 'circle.dot',
 *   title: 'Median Response Time',
 *   orientation: Orientation.HORIZONTAL,
 *   axes: { x: 'Milliseconds', y: 'Endpoint' },
 *   x: 'ms',
 *   y: 'endpoint',
 * });
 * ```
 */
export function bindD3Dot(svg: Element, config: D3BarConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildBarLayer(svg, config, undefined, TraceType.DOT));
}

/**
 * Binds a D3.js lollipop chart to MAIDR.
 *
 * A lollipop is a dot plot with a stem to the baseline: the stem is what the
 * mark looks like, not a second magnitude, so the extraction is again that of
 * {@link bindD3Bar}.
 *
 * Point `selector` at the **heads** (one `<circle>` per category) or at a
 * `<g>` wrapping each head-and-stem pair — one matched element per category.
 * A selector that also matched the `<line>` stems would produce two elements
 * per category, so the data would be doubled and highlighting would land on
 * the wrong mark.
 *
 * @param svg - The SVG element (or container) containing the D3 lollipop chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Lollipop(svgElement, {
 *   selector: 'circle.head',
 *   title: 'Life Expectancy',
 *   orientation: Orientation.HORIZONTAL,
 *   axes: { x: 'Years', y: 'Country' },
 *   x: 'years',
 *   y: 'country',
 * });
 * ```
 */
export function bindD3Lollipop(svg: Element, config: D3BarConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildBarLayer(svg, config, undefined, TraceType.LOLLIPOP));
}

/**
 * Binds a D3.js funnel chart to MAIDR.
 *
 * A funnel is a bar chart whose **order is meaningful**: the trace pitches the
 * retention between adjacent stages rather than the raw counts, because the
 * drop-off is what the chart is drawn for. Stage order therefore comes
 * straight from the DOM — the binder keeps the elements in the order D3 joined
 * them, so draw the stages top-to-bottom (or left-to-right) in funnel order.
 *
 * `selector` matches one element per stage, whichever mark you drew it with:
 * a trapezoid `<path>`, a centred `<rect>`, or a `<g>` per stage.
 *
 * @param svg - The SVG element (or container) containing the D3 funnel chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Funnel(svgElement, {
 *   selector: 'path.stage',
 *   title: 'Checkout Funnel',
 *   axes: { x: 'Stage', y: 'People' },
 *   x: 'stage',
 *   y: 'count',
 * });
 * ```
 */
export function bindD3Funnel(svg: Element, config: D3BarConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildBarLayer(svg, config, undefined, TraceType.FUNNEL));
}

/**
 * Pure extraction core for the bar family: reads D3-bound data under `root`
 * and builds the MAIDR layer, without wrapping it in a figure or touching
 * `maidr-data`. Used by {@link bindD3Bar} (root = the SVG) and by the
 * multi-panel binders in `binders/subplots.ts` (root = one panel element,
 * with `panel` scoping the emitted selectors to that panel).
 *
 * The trailing `type` selects which mark the layer announces itself as; the
 * extraction is the same for all four (see {@link BarMarkTraceType}).
 *
 * @internal
 */
export function buildBarLayer(
  root: Element,
  config: D3BarConfig,
  panel?: D3PanelScope,
  type: BarMarkTraceType = TraceType.BAR,
): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    orientation = Orientation.VERTICAL,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'bar');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  // `stage` is in the list for the funnel's `{ stage, count }` datum, which is
  // the shape that mark is almost always drawn from.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string | number>(
    config,
    'x',
    'x',
    ['category', 'label', 'name', 'key', 'date', 'stage'],
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

  const layer: MaidrLayer = {
    id: generateId(),
    type,
    title,
    selectors: scopeSelector(root, selector, panel),
    orientation,
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
