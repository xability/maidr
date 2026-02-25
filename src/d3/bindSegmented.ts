/**
 * D3 binder for segmented (stacked, dodged, normalized) bar charts.
 *
 * Extracts data from D3.js-rendered grouped bar chart SVG elements and generates
 * the MAIDR JSON schema for accessible interaction with stacked, dodged, and
 * normalized bar charts.
 */

import type { Maidr, MaidrLayer, SegmentedPoint } from '../type/grammar';
import type { D3BinderResult, D3SegmentedConfig } from './types';
import { Orientation, TraceType } from '../type/grammar';
import { buildAxes, generateId, getD3Datum, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Checks if a datum looks like a d3.stack() entry: an array-like `[y0, y1]`
 * with a `.data` property holding the original row object.
 */
function isD3StackEntry(datum: unknown): datum is [number, number] & { data: Record<string, unknown> } {
  return (
    Array.isArray(datum)
    && datum.length >= 2
    && typeof datum[0] === 'number'
    && typeof datum[1] === 'number'
    && 'data' in datum
    && typeof (datum as { data: unknown }).data === 'object'
    && (datum as { data: unknown }).data !== null
  );
}

/**
 * Binds a D3.js segmented bar chart (stacked, dodged, or normalized) to MAIDR.
 *
 * Segmented bar charts show multiple groups/categories per x-axis position.
 * Data is organized as a 2D array where each inner array represents one
 * group/fill level across all x-axis positions.
 *
 * Supports both flat data objects (`{ x, y, fill }`) and d3.stack() output
 * where each datum is `[y0, y1]` with a `.data` property.
 *
 * @param svg - The SVG element containing the D3 segmented bar chart.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Segmented(svgElement, {
 *   selector: 'rect.bar',
 *   type: TraceType.STACKED,
 *   title: 'Sales by Region and Quarter',
 *   axes: { x: 'Quarter', y: 'Sales' },
 *   x: 'quarter',
 *   y: 'sales',
 *   fill: 'region',
 * });
 * ```
 */
export function bindD3Segmented(svg: Element, config: D3SegmentedConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    type = TraceType.STACKED,
    x: xAccessor = 'x',
    y: yAccessor = 'y',
    fill: fillAccessor = 'fill',
    orientation = Orientation.VERTICAL,
  } = config;

  const elements = queryD3Elements(svg, selector);

  // Extract raw flat data, handling both flat objects and d3.stack() entries.
  const rawData: SegmentedPoint[] = elements.map(({ element, datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }

    // d3.stack() format: datum is [y0, y1] with datum.data = original row
    if (isD3StackEntry(datum)) {
      const row = datum.data;
      const x = resolveAccessor<string | number>(row, xAccessor, index) as string | number;
      const y = datum[1] - datum[0]; // stack value = upper - lower

      // Try to get fill from the parent <g> element's bound data (.key)
      let fill: string | undefined;
      const parent = element.parentElement;
      if (parent) {
        const parentDatum = getD3Datum(parent) as { key?: string } | undefined;
        if (parentDatum && typeof parentDatum === 'object' && 'key' in parentDatum) {
          fill = String(parentDatum.key);
        }
      }
      // Fallback to accessor on the original row
      if (fill === undefined) {
        fill = resolveAccessor<string>(row, fillAccessor, index) as string;
      }

      return { x, y, fill };
    }

    // Standard flat data format
    return {
      x: resolveAccessor<string | number>(datum, xAccessor, index) as string | number,
      y: resolveAccessor<number | string>(datum, yAccessor, index) as number | string,
      fill: resolveAccessor<string>(datum, fillAccessor, index) as string,
    };
  });

  // Group by fill value to create 2D array (each group is one fill level)
  const fillGroups = new Map<string, SegmentedPoint[]>();
  const fillOrder: string[] = [];
  for (const point of rawData) {
    const fillKey = String(point.fill);
    if (!fillGroups.has(fillKey)) {
      fillGroups.set(fillKey, []);
      fillOrder.push(fillKey);
    }
    fillGroups.get(fillKey)!.push(point);
  }

  const data: SegmentedPoint[][] = fillOrder.map(fill => fillGroups.get(fill)!);

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type,
    title,
    selectors: scopeSelector(svg, selector),
    orientation,
    axes: buildAxes(axes, format),
    data,
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{
      ...(fillOrder.length > 0 ? { legend: fillOrder } : {}),
      layers: [layer],
    }]],
  };

  return { maidr, layer };
}
