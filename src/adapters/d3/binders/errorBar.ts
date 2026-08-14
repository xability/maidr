/**
 * D3 binder for error-bar (point-range) charts.
 *
 * Extracts data from D3.js-rendered estimate groups — the `<line>` plus marker
 * a confidence interval is drawn from — and generates the MAIDR JSON schema
 * for accessible interaction.
 */

import type { ErrorBarPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3ErrorBarConfig, DataAccessor } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * Reads an interval bound, keeping only a usable number.
 *
 * The bounds are optional and independently so — a one-sided interval is a
 * real chart, and a datum that carries no bound at all is an estimate drawn
 * without one. Anything that is not a finite number is therefore dropped
 * rather than emitted: a `NaN` bound would be announced as a bound, and the
 * reader has no way to tell it from a measured one.
 *
 * @param datum - The datum bound to the estimate's element.
 * @param accessor - The bound's accessor.
 * @param index - The estimate's index, for accessor functions.
 * @returns The bound, or undefined when the chart does not draw one.
 */
function readBound(
  datum: unknown,
  accessor: DataAccessor<number>,
  index: number,
): number | undefined {
  const value = resolveAccessorOptional<number>(datum, accessor, index);
  const numeric = Number(value);
  return value === undefined || value === null || Number.isNaN(numeric)
    ? undefined
    : numeric;
}

/**
 * Binds a D3.js error-bar chart to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at one element per estimate — the canonical D3 idiom is a
 * `<g>` holding the interval's `<line>` and the estimate's marker, and that
 * group is what the reader's cursor should highlight.
 *
 * **The bounds are absolute positions on the value axis, not half-widths.**
 * Producers disagree about which they hand out, so the grammar fixes one and
 * each adapter converts. The binder cannot tell an offset from a bound by
 * looking at it, so a datum carrying `±se` needs a function accessor:
 * `yMin: d => d.mean - 1.96 * d.se`.
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
 * @param svg - The SVG element containing the D3 error-bar chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3ErrorBar(svgElement, {
 *   selector: 'g.estimate',
 *   title: 'Mean Response by Dose',
 *   axes: { x: 'Group', y: 'Response' },
 *   x: 'group',
 *   y: 'mean',
 *   yMin: 'ciLow',
 *   yMax: 'ciHigh',
 * });
 * ```
 */
export function bindD3ErrorBar(svg: Element, config: D3ErrorBarConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildErrorBarLayer(svg, config));
}

/**
 * Pure extraction core for error-bar charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildErrorBarLayer(root: Element, config: D3ErrorBarConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    orientation = Orientation.VERTICAL,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'error-bar estimate');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string | number>(
    config,
    'x',
    'x',
    ['category', 'label', 'name', 'key', 'group'],
    firstDatum,
  );
  const yAccessor = inferAccessor<number>(
    config,
    'y',
    'y',
    ['value', 'mean', 'estimate', 'median'],
    firstDatum,
  );
  const yMinAccessor = inferAccessor<number>(
    config,
    'yMin',
    'yMin',
    ['lower', 'ciLow', 'ci_low', 'low', 'min'],
    firstDatum,
  );
  const yMaxAccessor = inferAccessor<number>(
    config,
    'yMax',
    'yMax',
    ['upper', 'ciHigh', 'ci_high', 'high', 'max'],
    firstDatum,
  );

  const data: ErrorBarPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    const point: ErrorBarPoint = {
      x: resolveAccessor<string | number>(datum, xAccessor, index),
      y: resolveAccessor<number>(datum, yAccessor, index),
    };
    const yMin = readBound(datum, yMinAccessor, index);
    if (yMin !== undefined) {
      point.yMin = yMin;
    }
    const yMax = readBound(datum, yMaxAccessor, index);
    if (yMax !== undefined) {
      point.yMax = yMax;
    }
    return point;
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.ERROR_BAR,
    title,
    // One scoped selector matching every estimate group: the trace maps them
    // one-to-one onto the samples and highlights the same group at each of the
    // three sections a column is read through.
    selectors: scopeSelector(root, selector, panel),
    orientation,
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
