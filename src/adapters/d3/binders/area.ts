/**
 * D3 binder for area charts: plain bands, stacked areas / streamgraphs, and
 * 100% stacked areas.
 *
 * An area is a line with the region under it filled, so the extraction is the
 * line binder's — except for the one shape a line never sees. `d3.stack()`
 * binds a whole *series* to each `<path>`: the datum is an array carrying the
 * series' `.key`, whose items are `[y0, y1]` tuples with a `.data`
 * back-reference to the row they came from. This module recognises that shape
 * and unwraps it; everything else falls through to `buildLineLayer`.
 */

import type { LinePoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3AreaConfig, D3BinderResult, D3BuiltLayer } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';
import { buildLineLayer, stampSeriesSelectors } from './line';

/**
 * One `d3.stack()` datum: the `[y0, y1]` pair the band is drawn between, plus
 * a back-reference to the row it was computed from.
 */
interface StackTuple extends Array<number> {
  /** The original row — where the x value (and any other field) still lives. */
  data?: unknown;
}

/**
 * One `d3.stack()` series: the array bound to a stacked area's `<path>`,
 * carrying the key it was stacked under.
 */
interface StackSeries extends Array<StackTuple> {
  /** The series name, set by `d3.stack().keys(...)`. */
  key?: unknown;
}

/**
 * Whether a `<path>`'s datum is a `d3.stack()` series rather than the plain
 * point array a line path carries.
 *
 * Both are arrays, so the discriminator is the item: a stack item is itself a
 * two-number array with a `data` back-reference, which no point array has.
 * Mirrors the shape check `binders/segmented.ts` uses to detect the same
 * output bound to `<rect>` elements.
 *
 * @param datum - The datum bound to a series path.
 * @returns True when the datum is `d3.stack()` output.
 */
function isStackSeries(datum: unknown): datum is StackSeries {
  if (!Array.isArray(datum) || datum.length === 0) {
    return false;
  }
  const first: unknown = datum[0];
  return Array.isArray(first)
    && first.length === 2
    && typeof first[0] === 'number'
    && typeof first[1] === 'number'
    && 'data' in (first as object);
}

/**
 * Reads a `d3.stack()` series' name off its `.key`.
 *
 * @param series - The series array bound to one `<path>`.
 * @returns The key as text, or `undefined` when the series carries none.
 */
function seriesKey(series: StackSeries): string | undefined {
  const { key } = series;
  if (key === undefined || key === null || key === '') {
    return undefined;
  }
  return String(key);
}

/**
 * Binds a D3.js area chart to MAIDR, generating the accessible data
 * representation.
 *
 * Handles all three variants through `config.type`: independent bands
 * (`TraceType.AREA`, the default), stacked areas and streamgraphs
 * (`TraceType.STACKED_AREA`), and 100% stacked areas
 * (`TraceType.NORMALIZED_AREA`). The variant decides how the layer is read: a
 * stacked trace announces the running total at each x, and the point's share
 * of it, alongside the band's own value.
 *
 * Two D3 patterns are supported, and the binder tells them apart by the datum
 * bound to the first matched `<path>`:
 *
 * 1. **`d3.stack()` output** — the series array itself, with `.key`, whose
 *    items are `[y0, y1]` tuples. `x` is read from each tuple's `.data` row
 *    (function accessors included, so write `d => d.year`, not
 *    `d => d.data.year`), `y` is the band's own height (`y1 - y0`, which is
 *    what the trace needs — it re-derives the running total itself), and
 *    `.key` names the series.
 * 2. **Plain point arrays** — one `{ x, y }` array per `<path>`, or per-point
 *    elements via `pointSelector`. Read exactly as {@link bindD3Line} reads
 *    them.
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
 * @param svg - The SVG element containing the D3 area chart.
 * @param config - Configuration specifying selectors, accessors, and variant.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // d3.stack() + d3.area().y0(d => y(d[0])).y1(d => y(d[1]))
 * const series = d3.stack().keys(['Subscriptions', 'Services'])(rows);
 * svg.selectAll('path.area').data(series).join('path').attr('d', area);
 *
 * bindD3Area(svgElement, {
 *   selector: 'path.area',
 *   type: TraceType.STACKED_AREA,
 *   title: 'Revenue by Product',
 *   axes: { x: 'Year', y: 'Revenue', fill: 'Product' },
 *   x: 'year',   // a key on the stacked row, not on the [y0, y1] tuple
 * });
 * ```
 */
export function bindD3Area(svg: Element, config: D3AreaConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildAreaLayer(svg, config));
}

/**
 * Pure extraction core for area charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildAreaLayer(root: Element, config: D3AreaConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    type = TraceType.AREA,
  } = config;

  const pathElements = queryD3Elements(root, selector);
  if (pathElements.length === 0) {
    throw buildNoElementsError(root, selector, 'area path');
  }

  // Anything that is not d3.stack() output is the point array a line path
  // carries, which the line binder already reads in both its variants
  // (per-path arrays, or `pointSelector` + fill grouping).
  if (!isStackSeries(pathElements[0].datum)) {
    return buildLineLayer(root, config, panel, type);
  }

  // Infer the x accessor from a stacked ROW, not from the tuple: the tuple is
  // a pair of stack edges and carries no category.
  const sampleRow = pathElements[0].datum[0]?.data;
  const xAccessor = inferAccessor<number | string>(
    config,
    'x',
    'x',
    ['category', 'label', 'name', 'date', 'time'],
    sampleRow,
  );
  const fillAccessor = inferAccessor<string>(
    config,
    'fill',
    'fill',
    ['group', 'series', 'category', 'z', 'color'],
    sampleRow,
  );

  const data: LinePoint[][] = [];
  const legend: string[] = [];
  // The `<path>` that renders each emitted row, parallel to `data`. In this
  // shape one path IS one series, so the pairing is never ambiguous.
  const rowPaths: Element[] = [];

  for (const { element, datum, index } of pathElements) {
    if (!isStackSeries(datum)) {
      throw new Error(
        `The datum bound to "${selector}" at index ${index} is not d3.stack() `
        + `output, but the first matched path's was. Every series must come `
        + `from the same join for the bands to be read as one chart — check `
        + `that "${selector}" does not also match a non-stacked path (an axis `
        + `line, a reference band, a hand-appended shape).`,
      );
    }

    // The series' own name: its `.key`, falling back to the fill accessor read
    // off the first row for a stack assembled without `d3.stack().keys(...)`.
    const firstRow = datum[0]?.data;
    const key = seriesKey(datum)
      ?? (firstRow === undefined || firstRow === null
        ? undefined
        : resolveAccessorOptional<string>(firstRow, fillAccessor, 0));

    const seriesData: LinePoint[] = datum.map((tuple, pointIndex) => {
      const point: LinePoint = {
        x: resolveAccessor<number | string>(tuple.data, xAccessor, pointIndex),
        // The band's own height, which is what the trace wants: it sums the
        // series it is given to recover the running total, so handing it the
        // already-accumulated top edge would double-count every band above
        // the first. An explicit `y` accessor is resolved against the tuple,
        // so `d => d[1] - d[0]` and any custom offset stay expressible.
        y: config.y === undefined
          ? tuple[1] - tuple[0]
          : resolveAccessor<number>(tuple, config.y, pointIndex),
      };
      if (key !== undefined) {
        point.z = key;
      }
      return point;
    });

    if (seriesData.length === 0) {
      continue;
    }
    data.push(seriesData);
    rowPaths.push(element);
    if (key !== undefined) {
      legend.push(key);
    }
  }

  // One selector per band, so the model can highlight the series the cursor is
  // in. See {@link stampSeriesSelectors}.
  const selectorValue: string | string[] | undefined = pathElements.length > 1
    ? stampSeriesSelectors(root, selector, rowPaths, data.length, panel)
    // Exactly one path matched → a single scoped selector highlights it.
    : scopeSelector(root, selector, panel);

  const layer: MaidrLayer = {
    id: generateId(),
    type,
    title,
    selectors: selectorValue,
    axes: buildAxes(axes, format),
    data,
  };

  return { layer, legend };
}
