/**
 * D3 binder for waterfall (bridge) charts.
 *
 * Extracts data from the floating bar each step is drawn as and generates the
 * MAIDR JSON schema for accessible interaction. A waterfall bar is drawn
 * between two running totals, so those two numbers are what the binder reads;
 * the contribution the bar's height represents is derived from them.
 */

import type { MaidrLayer, WaterfallKind, WaterfallPoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3WaterfallConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * Binds a D3.js waterfall chart to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at one element per step — the floating `<rect>` the bar is
 * drawn as, or a `<g>` wrapping it and its label. The step's two running
 * totals are read from the datum: `start` is where the bar's base sits and
 * `end` where its top does, which is what a waterfall's `y` scale is already
 * called with.
 *
 * **Mark the totals.** An opening, closing or subtotal bar is drawn exactly
 * like a step but contributes nothing, and no amount of looking at the numbers
 * reveals which bars those are — so pass a `kind` accessor for them. Without
 * one they are announced as ordinary increases, and the chart's count of
 * increases and decreases includes bars that changed nothing.
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
 * @param svg - The SVG element containing the D3 waterfall chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Waterfall(svgElement, {
 *   selector: 'rect.step',
 *   title: 'Quarterly Budget Bridge',
 *   axes: { x: 'Step', y: 'Amount (thousands)' },
 *   x: 'label',
 *   kind: d => (d.isTotal ? 'total' : undefined),
 * });
 * ```
 */
export function bindD3Waterfall(svg: Element, config: D3WaterfallConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildWaterfallLayer(svg, config));
}

/**
 * Pure extraction core for waterfall charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildWaterfallLayer(root: Element, config: D3WaterfallConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    kind: kindAccessor,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'waterfall step');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string | number>(
    config,
    'x',
    'x',
    ['category', 'label', 'name', 'key', 'step'],
    firstDatum,
  );
  const startAccessor = inferAccessor<number>(
    config,
    'start',
    'start',
    ['from', 'y0', 'base'],
    firstDatum,
  );
  const endAccessor = inferAccessor<number>(
    config,
    'end',
    'end',
    ['to', 'y1', 'cumulative'],
    firstDatum,
  );

  const data: WaterfallPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    const start = Number(resolveAccessor<number>(datum, startAccessor, index));
    const end = Number(resolveAccessor<number>(datum, endAccessor, index));
    // Carried rather than left to the trace, because the two totals are what
    // the bar was drawn from and their difference is what its height means.
    const delta = end - start;

    return {
      x: resolveAccessor<string | number>(datum, xAccessor, index),
      start,
      end,
      delta,
      kind: resolveKind(datum, index, delta, kindAccessor),
    };
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.WATERFALL,
    title,
    // One scoped selector matching every step: the trace maps them one-to-one
    // onto the columns it navigates.
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}

/**
 * Classifies a step: what the caller said it was, else what its contribution
 * says.
 *
 * The sign answers it for every ordinary step, and for nothing else: a total
 * is drawn like a step and contributes like one, so only the author can say
 * which bars restate the running total rather than moving it. An accessor that
 * returns `undefined` therefore falls back to the sign, which is what lets
 * `d => (d.isTotal ? 'total' : undefined)` mark the totals alone.
 *
 * A step that moved nothing is called an increase of zero rather than a total,
 * because "total" is a claim about the bar's role in the chart and a zero
 * contribution is not evidence for it.
 *
 * @param datum - The datum bound to the step's element.
 * @param index - The step's index, for accessor functions.
 * @param delta - The step's signed contribution.
 * @param accessor - The caller's `kind` accessor, when they gave one.
 * @returns The step's kind.
 */
function resolveKind(
  datum: unknown,
  index: number,
  delta: number,
  accessor: D3WaterfallConfig['kind'],
): WaterfallKind {
  const declared = accessor === undefined
    ? undefined
    : resolveAccessorOptional<WaterfallKind | undefined>(datum, accessor, index);

  return declared ?? (delta < 0 ? 'decrease' : 'increase');
}
