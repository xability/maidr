/**
 * D3 binder for dumbbell (connected-dot) charts.
 *
 * Extracts data from the connector each row is drawn with and generates the
 * MAIDR JSON schema for accessible interaction. Unlike every other D3 binder,
 * the emitted `data` is a single object rather than an array: the names of the
 * two ends belong to the chart and not to any one row.
 */

import type { DumbbellData, DumbbellPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3DumbbellConfig } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/**
 * Binds a D3.js dumbbell chart to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the **connectors** — one `<line>` per row — rather than
 * at the dots. A dumbbell draws one segment and two dots per row, so the
 * connectors are the elements that map one-to-one onto the data; a selector
 * matching the dots would produce twice as many elements as rows and the trace
 * would withdraw highlighting rather than pair them wrongly.
 *
 * Name the two ends with `startLabel` / `endLabel`. They are what the chart's
 * legend gives a sighted reader for free: without them a chart of life
 * expectancy in 1990 against 2020 tells the reader they are on the "start"
 * dot, which is the one thing they already knew.
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
 * @param svg - The SVG element containing the D3 dumbbell chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Dumbbell(svgElement, {
 *   selector: 'line.connector',
 *   title: 'Life Expectancy, 1990 against 2020',
 *   orientation: Orientation.HORIZONTAL,
 *   axes: { x: 'Years', y: 'Country' },
 *   x: 'country',
 *   start: 'y1990',
 *   end: 'y2020',
 *   startLabel: '1990',
 *   endLabel: '2020',
 * });
 * ```
 */
export function bindD3Dumbbell(svg: Element, config: D3DumbbellConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildDumbbellLayer(svg, config));
}

/**
 * Pure extraction core for dumbbell charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildDumbbellLayer(root: Element, config: D3DumbbellConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    startLabel,
    endLabel,
    orientation = Orientation.VERTICAL,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'dumbbell connector');
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
  const startAccessor = inferAccessor<number>(
    config,
    'start',
    'start',
    ['from', 'before', 'y0'],
    firstDatum,
  );
  const endAccessor = inferAccessor<number>(
    config,
    'end',
    'end',
    ['to', 'after', 'y1'],
    firstDatum,
  );

  const points: DumbbellPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    return {
      x: resolveAccessor<string | number>(datum, xAccessor, index),
      start: resolveAccessor<number>(datum, startAccessor, index),
      end: resolveAccessor<number>(datum, endAccessor, index),
    };
  });

  // The object payload, not an array: the end labels describe the chart, and
  // repeating them on every row would let the rows disagree about what is
  // being compared. Each is omitted when unnamed, so the trace falls back to
  // "start" and "end" rather than being handed an empty label.
  const data: DumbbellData = {
    points,
    ...(startLabel !== undefined ? { startLabel } : {}),
    ...(endLabel !== undefined ? { endLabel } : {}),
  };

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.DUMBBELL,
    title,
    // One scoped selector matching every connector: the trace maps them
    // one-to-one onto the rows and highlights the same segment at both ends,
    // which is what the chart drew.
    selectors: scopeSelector(root, selector, panel),
    orientation,
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
