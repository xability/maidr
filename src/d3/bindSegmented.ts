/**
 * D3 binder for segmented bar charts (stacked, dodged, and normalized).
 *
 * Extracts data from D3.js-rendered grouped/stacked bar chart SVG elements
 * and generates the MAIDR JSON schema for accessible interaction.
 */

import type { Maidr, MaidrLayer, SegmentedPoint } from '../type/grammar';
import type { D3BinderResult, D3SegmentedConfig } from './types';
import { TraceType } from '../type/grammar';
import { generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Binds a D3.js segmented bar chart (stacked, dodged, or normalized) to MAIDR.
 *
 * Segmented bar charts extend regular bar charts with a `fill` dimension that
 * identifies the segment/group within each bar. The data is organized as a
 * 2D array where each inner array represents a series/group.
 *
 * @param svg - The SVG element containing the D3 segmented bar chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // Stacked bar chart
 * const result = bindD3Segmented(svgElement, {
 *   selector: 'rect.bar',
 *   type: 'stacked_bar',
 *   title: 'Revenue by Region and Quarter',
 *   axes: { x: 'Quarter', y: 'Revenue', fill: 'Region' },
 *   x: 'quarter',
 *   y: 'revenue',
 *   fill: 'region',
 * });
 *
 * // Dodged bar chart
 * const result = bindD3Segmented(svgElement, {
 *   selector: 'rect.bar',
 *   type: 'dodged_bar',
 *   title: 'Comparison by Category',
 *   axes: { x: 'Category', y: 'Value', fill: 'Group' },
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
  } = config;

  const elements = queryD3Elements(svg, selector);

  // Extract flat list of segmented points
  const flatPoints: SegmentedPoint[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }
    return {
      x: resolveAccessor<string | number>(datum, xAccessor, index),
      y: resolveAccessor<number | string>(datum, yAccessor, index),
      fill: resolveAccessor<string>(datum, fillAccessor, index),
    };
  });

  // Group by fill value to form 2D array (each group = one series)
  const groupOrder: string[] = [];
  const groups = new Map<string, SegmentedPoint[]>();
  for (const point of flatPoints) {
    if (!groups.has(point.fill)) {
      groupOrder.push(point.fill);
      groups.set(point.fill, []);
    }
    groups.get(point.fill)!.push(point);
  }

  const data: SegmentedPoint[][] = groupOrder.map(fill => groups.get(fill)!);

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type,
    title,
    selectors: scopeSelector(svg, selector),
    axes: axes
      ? {
          ...axes,
          ...(format ? { format } : {}),
        }
      : undefined,
    data,
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{
      legend: groupOrder,
      layers: [layer],
    }]],
  };

  return { maidr, layer };
}
