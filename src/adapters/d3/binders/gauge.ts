/**
 * D3 binder for gauges and bullet charts.
 *
 * A drawn gauge binds one number — the measure the needle or the value arc
 * moves with — so this binder reads that from the DOM and takes the rest of
 * the reading from config. The dial's range, the target marker and the
 * qualitative bands are drawn from numbers the author holds; the SVG records
 * only where they ended up on screen.
 */

import type { GaugePoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3GaugeConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/**
 * Binds a D3.js gauge or bullet chart to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the mark that moves with the value — the needle, the
 * value arc, the bullet's measure bar. Only the first match is read: a gauge
 * draws exactly one measure, which is why its payload is a single object
 * rather than an array of one.
 *
 * `min` and `max` are required because the value alone is not the reading.
 * "73" means nothing without the range it sits in, the target it was aiming
 * at, and the band it lands in — and a sighted reader takes all three from the
 * dial's geometry, which is exactly what a screen reader cannot reach.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** Like every D3 binder, this reads
 * the matched element's D3-bound `__data__`; calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …" or "Property '…' not found on datum".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 gauge.
 * @param config - Configuration specifying the selector, the range and the
 *                 chart's own annotations.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Gauge(svgElement, {
 *   selector: 'rect.measure',
 *   title: 'Conversion Rate against Target',
 *   axes: { x: 'Measure', y: 'Percent' },
 *   label: 'Conversion',
 *   min: 0,
 *   max: 100,
 *   target: 80,
 *   bands: [
 *     { to: 50, label: 'poor' },
 *     { to: 75, label: 'ok' },
 *     { to: 100, label: 'good' },
 *   ],
 * });
 * ```
 */
export function bindD3Gauge(svg: Element, config: D3GaugeConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildGaugeLayer(svg, config));
}

/**
 * Pure extraction core for gauges. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildGaugeLayer(root: Element, config: D3GaugeConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    min,
    max,
    label,
    target,
    bands,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'gauge value');
  }

  // The first match, because a gauge draws one measure. A selector that
  // matched the dial's other arcs as well still reads the right number, since
  // the value mark is the one it is pointed at.
  const { datum } = elements[0];
  if (datum === undefined || datum === null) {
    throw buildNoDatumError(selector, 0);
  }

  // A gauge is routinely joined against the bare number it displays, in which
  // case the datum *is* the measure and there is no key to name.
  const valueAccessor = inferAccessor<number>(
    config,
    'value',
    'value',
    ['y', 'amount', 'measure', 'current', 'actual'],
    datum,
  );
  const value = config.value === undefined && typeof datum === 'number'
    ? datum
    : Number(resolveAccessor<number>(datum, valueAccessor, 0));

  const data: GaugePoint = {
    value,
    min,
    max,
    ...(label !== undefined ? { label } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(bands !== undefined ? { bands } : {}),
  };

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.GAUGE,
    title,
    // Scoped as usual; the trace highlights the first element the selector
    // resolves to, which is the mark the value is drawn as.
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
