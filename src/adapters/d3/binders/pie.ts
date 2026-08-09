/**
 * D3 binder for pie and doughnut charts.
 *
 * Extracts data from D3.js-rendered wedges and generates the MAIDR JSON
 * schema for accessible slice-by-slice interaction.
 */

import type { MaidrLayer, PiePoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3PieConfig, DataAccessor } from '../types';
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
 * Pure extraction core for pie charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildPieLayer(root: Element, config: D3PieConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    y: yOverride,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'pie slice');
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

  const data: PiePoint[] = elements.map(({ datum, index }) => {
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
