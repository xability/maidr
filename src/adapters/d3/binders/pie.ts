/**
 * D3 binder for pie, doughnut and polar area charts.
 *
 * Extracts data from D3.js-rendered wedges and generates the MAIDR JSON
 * schema for accessible slice-by-slice interaction. A polar area (coxcomb,
 * rose) is drawn from the same `d3.arc()` wedges and unwrapped the same way —
 * it gives every category an equal angle and varies the radius instead — so it
 * shares this file's arc handling and differs in what it emits.
 */

import type { LinePoint, MaidrLayer, PiePoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3PieConfig, D3PolarAreaConfig, DataAccessor } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/**
 * The object `d3.pie()` emits for one slice: the caller's own datum under
 * `data`, the magnitude the layout read from it under `value`, and the
 * geometry `d3.arc()` turns into a `<path>`.
 *
 * A doughnut is the same layout drawn with an inner radius, so nothing here
 * distinguishes the two — and nothing needs to.
 */
interface D3PieArc {
  data: unknown;
  value: number;
  startAngle: number;
  endAngle: number;
}

/**
 * Whether a bound datum is a `d3.pie()` arc rather than the user's own datum.
 *
 * `d3.pie()` is a plain function returning object literals, so there is no
 * constructor to test against — the arc is recognised by the shape the layout
 * documents. Worth detecting: without it every accessor would have to address
 * the layout's wrapper (`d.data.fruit`) rather than what the user wrote
 * (`fruit`), and the automatic key inference would have nothing to look at.
 *
 * @param datum - The element's D3-bound datum
 * @returns True when the datum is a pie layout arc
 */
function isPieArc(datum: unknown): datum is D3PieArc {
  if (typeof datum !== 'object' || datum === null) {
    return false;
  }
  return 'data' in datum && 'value' in datum && 'startAngle' in datum && 'endAngle' in datum;
}

/**
 * Reads one slice's label.
 *
 * `d3.pie()` accepts a bare array of numbers as readily as an array of
 * objects, in which case the arc's `data` is the number itself. A string
 * accessor cannot address a primitive — the `in` check inside
 * {@link resolveAccessor} throws a `TypeError` that names neither the slice
 * nor the fix — so a primitive labels its own slice. A function accessor is
 * always invoked: it may be index-based and never touch the datum at all.
 *
 * @param slice - The user's datum for this slice (the arc already unwrapped)
 * @param accessor - The resolved label accessor
 * @param index - Position of the slice in the selection
 * @returns The slice label
 */
function resolveSliceLabel(
  slice: unknown,
  accessor: DataAccessor<string | number>,
  index: number,
): string | number {
  if (typeof accessor === 'string' && (slice === null || typeof slice !== 'object')) {
    return typeof slice === 'number' ? slice : String(slice);
  }
  return resolveAccessor<string | number>(slice, accessor, index);
}

/**
 * Coerces a resolved magnitude to the number {@link PiePoint.y} requires,
 * keeping a gap distinguishable from a zero.
 *
 * `Number(null)` is `0`, and a slice nobody measured must not be sonified and
 * totalled as a real zero. `NaN` is how the pie model spells an absent
 * measurement, and it survives the trip through `maidr-data`: `JSON.stringify`
 * writes it as `null`, which the model reads back as a gap.
 *
 * @param raw - The value the accessor produced
 * @returns The magnitude, or `NaN` when the slice is a gap
 */
function toSliceValue(raw: unknown): number {
  if (raw === null || raw === undefined) {
    return Number.NaN;
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return Number.NaN;
  }
  return Number(raw);
}

/**
 * Binds a D3.js pie or doughnut chart to MAIDR, generating the accessible
 * data representation.
 *
 * Extracts data from the wedge `<path>` elements produced by the canonical
 * `d3.pie()` + `d3.arc()` pair and produces a complete {@link Maidr} data
 * structure for sonification, text descriptions, braille output, and keyboard
 * navigation. A pie is one row of slices: left and right move between them.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`. When the marks were joined to `d3.pie()`
 * output — the usual case — the slice magnitude is taken from the arc's
 * `value`, which is what the layout itself drew the angle from, so only the
 * label accessor is normally needed. Calling the binder before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …" or "Property '…' not found on datum".
 *
 * Typical call sites:
 * - **Vanilla JS:** right after your `selectAll(...).data(...).join(...)` chain.
 * - **React:** inside `useEffect`, never during render. Prefer
 *   {@link MaidrD3} / {@link useD3Adapter} from `maidr/react`, which
 *   handle the post-render timing for you.
 * - **Async data:** inside the `.then(...)` of your fetch, after drawing.
 *
 * **Slice order.** `d3.pie()` returns its arcs in the input data order even
 * when it sorts them by value for drawing, so the wedges a single
 * `.data(pie(data)).join('path')` produces are already in the order MAIDR
 * needs: matched element k is data point k.
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element (or container) containing the D3 pie chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // svg.selectAll('path.slice').data(d3.pie().value(d => d.units)(data))
 * const result = bindD3Pie(svgElement, {
 *   selector: 'path.slice',
 *   title: 'Fruit sales',
 *   axes: { x: 'Fruit', y: 'Units' },
 *   x: 'fruit',   // property name on YOUR datum, not on the arc
 * });
 * ```
 */
export function bindD3Pie(svg: Element, config: D3PieConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildPieLayer(svg, config));
}

/**
 * Reads one label and one magnitude off every wedge matched by the config's
 * selector, unwrapping `d3.pie()` arcs on the way.
 *
 * Shared by the pie and polar area binders: the wedges are drawn by the same
 * `d3.arc()` and carry the same datum, and the two charts differ only in what
 * the wedge encodes (an angle against a radius) and therefore in what the
 * layer says about them.
 *
 * @param root - The extraction root (the SVG, or a panel element)
 * @param config - The user's binder config
 * @param elementKind - What to call the wedges in the "no elements" error
 * @returns One `{ x, y }` per wedge, in DOM order
 */
function extractWedges(
  root: Element,
  config: D3PieConfig,
  elementKind: string,
): PiePoint[] {
  const { selector, y: yOverride } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, elementKind);
  }

  // Infer accessors from the USER's first datum, not from the arc wrapping
  // it: the keys worth guessing (`label`, `value`, …) are the ones the caller
  // wrote, and every arc carries the same four layout keys regardless.
  const firstDatum = elements[0].datum;
  const firstSlice = isPieArc(firstDatum) ? firstDatum.data : firstDatum;
  const xAccessor = inferAccessor<string | number>(
    config,
    'x',
    'x',
    ['label', 'name', 'category', 'key'],
    firstSlice,
  );
  const yAccessor = inferAccessor<number>(
    config,
    'y',
    'y',
    ['value', 'count', 'amount', 'total'],
    firstSlice,
  );

  return elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    const arc = isPieArc(datum) ? datum : null;
    const slice = arc ? arc.data : datum;

    return {
      x: resolveSliceLabel(slice, xAccessor, index),
      // The layout has already applied the caller's own `.value(...)` to each
      // datum and stored the result on the arc, so reading it back keeps the
      // sonified magnitude identical to the angle drawn on screen. An
      // explicit `y` still wins — it is what binds a pie drawn by hand.
      y: arc && yOverride === undefined
        ? toSliceValue(arc.value)
        : toSliceValue(resolveAccessor<number>(slice, yAccessor, index)),
    };
  });
}

/**
 * Pure extraction core for pie charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildPieLayer(root: Element, config: D3PieConfig, panel?: D3PanelScope): D3BuiltLayer {
  const { title, axes, format, selector } = config;

  const data = extractWedges(root, config, 'pie slice');

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.PIE,
    title,
    selectors: scopeSelector(root, selector, panel),
    // No `orientation`: a pie's slices are arranged around a circle, not
    // along an axis. No `z` either — the percentage the model announces is
    // derived from the values, so there is nothing for a fill axis to label.
    axes: buildAxes({ x: axes?.x, y: axes?.y }, format),
    data,
  };

  return { layer };
}

/**
 * Binds a D3.js polar area (coxcomb, rose) chart to MAIDR, generating the
 * accessible data representation.
 *
 * Point `selector` at the wedge `<path>` elements, exactly as for
 * {@link bindD3Pie} — including when they were joined to `d3.pie()` output,
 * which the binder unwraps for you. The difference is in the reading: a polar
 * area gives every category the same angle and encodes its value as the
 * wedge's **radius**, so the values are a series around the spokes rather than
 * shares of a whole, and the trace announces them as such (with no
 * percentages) while panning each spoke to where it is drawn on the dial.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** Like every D3 binder, this reads
 * each matched element's D3-bound `__data__`; calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …" or "Property '…' not found on datum".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 polar area chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // svg.selectAll('path.wedge').data(d3.pie().value(d => d.deaths)(rows))
 * const result = bindD3PolarArea(svgElement, {
 *   selector: 'path.wedge',
 *   title: 'Causes of Mortality',
 *   axes: { x: 'Month', y: 'Deaths' },
 *   x: 'month',   // property name on YOUR datum, not on the arc
 * });
 * ```
 */
export function bindD3PolarArea(svg: Element, config: D3PolarAreaConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildPolarAreaLayer(svg, config));
}

/**
 * Pure extraction core for polar area charts. See {@link buildBarLayer} for
 * the single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildPolarAreaLayer(
  root: Element,
  config: D3PolarAreaConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const { title, axes, format, selector } = config;

  // One row: a polar area draws a single series of wedges around the dial, and
  // the payload is the multi-line grid {@link RadarTrace} navigates — the same
  // trace a radar uses, which is what makes the two read alike.
  const data: LinePoint[][] = [extractWedges(root, config, 'polar area wedge')];

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.POLAR_AREA,
    title,
    // One scoped selector matching every wedge: with a single row, the trace
    // resolves the matches straight onto the spokes, and withdraws
    // highlighting if the count does not line up rather than guessing.
    selectors: scopeSelector(root, selector, panel),
    // No `z` axis: one series of wedges has no fill dimension to name, the
    // same reason a pie has none.
    axes: buildAxes({ x: axes?.x, y: axes?.y }, format),
    data,
  };

  return { layer };
}
