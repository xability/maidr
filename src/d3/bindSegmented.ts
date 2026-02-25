/**
 * D3 binder for segmented bar charts (stacked, dodged, and normalized).
 *
 * Extracts data from D3.js-rendered grouped/stacked bar chart SVG elements
 * and generates the MAIDR JSON schema for accessible interaction.
 */

import type { Maidr, MaidrLayer, SegmentedPoint } from '../type/grammar';
import type { D3BinderResult, D3SegmentedConfig } from './types';
import { TraceType } from '../type/grammar';
import { buildAxes, generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

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
 * // Flat structure: each rect has { x, y, fill } data
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
 * // d3.stack() structure: groups contain segments
 * const result = bindD3Segmented(svgElement, {
 *   groupSelector: 'g.series',
 *   selector: 'rect',
 *   type: 'stacked_bar',
 *   title: 'Revenue by Region and Quarter',
 *   x: (d) => d.data.category,
 *   y: (d) => d[1] - d[0],
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
    groupSelector,
    type = TraceType.STACKED,
    x: xAccessor = 'x',
    y: yAccessor = 'y',
    fill: fillAccessor = 'fill',
  } = config;

  const groupOrder: string[] = [];
  const data: SegmentedPoint[][] = [];

  if (groupSelector) {
    // d3.stack() pattern: each group <g> contains segment <rect>s.
    // The group's datum typically has a .key property (d3.stack output).
    const groupElements = queryD3Elements(svg, groupSelector);
    if (groupElements.length === 0) {
      throw new Error(
        `No group elements found for selector "${groupSelector}". `
        + `Ensure the D3 chart has been rendered and the selector matches the group elements.`,
      );
    }

    for (const { element: groupEl, datum: groupDatum } of groupElements) {
      const segments = queryD3Elements(groupEl, selector);
      if (segments.length === 0)
        continue;

      // Derive fill from group datum's .key (d3.stack) or first segment
      const groupKey = (groupDatum as Record<string, unknown> | null)?.key as string | undefined;

      const groupPoints: SegmentedPoint[] = segments.map(({ datum, index }) => {
        if (!datum) {
          throw new Error(
            `No D3 data bound to segment element at index ${index} within group. `
            + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
          );
        }
        const fillValue = groupKey ?? resolveAccessor<string>(datum, fillAccessor, index);
        return {
          x: resolveAccessor<string | number>(datum, xAccessor, index),
          y: resolveAccessor<number | string>(datum, yAccessor, index),
          fill: fillValue,
        };
      });

      if (groupPoints.length > 0) {
        groupOrder.push(groupPoints[0].fill);
        data.push(groupPoints);
      }
    }
  } else {
    // Flat structure: all segments in one container, grouped by fill value
    const elements = queryD3Elements(svg, selector);
    if (elements.length === 0) {
      throw new Error(
        `No elements found for selector "${selector}". `
        + `Ensure the D3 chart has been rendered and the selector matches the bar elements.`,
      );
    }

    const groups = new Map<string, SegmentedPoint[]>();
    for (const { datum, index } of elements) {
      if (!datum) {
        throw new Error(
          `No D3 data bound to element at index ${index}. `
          + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
        );
      }
      const point: SegmentedPoint = {
        x: resolveAccessor<string | number>(datum, xAccessor, index),
        y: resolveAccessor<number | string>(datum, yAccessor, index),
        fill: resolveAccessor<string>(datum, fillAccessor, index),
      };
      if (!groups.has(point.fill)) {
        groupOrder.push(point.fill);
        groups.set(point.fill, []);
      }
      groups.get(point.fill)!.push(point);
    }
    for (const fill of groupOrder) {
      data.push(groups.get(fill)!);
    }
  }

  const layerId = generateId();
  const selectorValue = groupSelector
    ? scopeSelector(svg, `${groupSelector} ${selector}`)
    : scopeSelector(svg, selector);

  const layer: MaidrLayer = {
    id: layerId,
    type,
    title,
    selectors: selectorValue,
    axes: buildAxes(axes, format),
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
