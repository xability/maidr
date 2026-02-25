/**
 * D3 binder for line charts.
 *
 * Extracts data from D3.js-rendered line chart SVG elements and generates
 * the MAIDR JSON schema for accessible line chart interaction.
 */

import type { LinePoint, Maidr, MaidrLayer } from '../type/grammar';
import type { D3BinderResult, D3LineConfig } from './types';
import { TraceType } from '../type/grammar';
import { generateId, queryD3Elements, resolveAccessor, resolveAccessorOptional, scopeSelector } from './util';

/**
 * Binds a D3.js line chart to MAIDR, generating the accessible data representation.
 *
 * Supports both single-line and multi-line charts. Data can be extracted from:
 * 1. D3-bound data on point elements (circles, etc.) via `pointSelector`.
 *    When using `pointSelector`, each line path and its associated points
 *    must share the same parent `<g>` group element for correct scoping.
 * 2. D3-bound data on the path elements themselves (array of points per path).
 *
 * @param svg - The SVG element containing the D3 line chart.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // Multi-line chart with paths and point circles
 * const result = bindD3Line(svgElement, {
 *   selector: 'path.line',
 *   pointSelector: 'circle.data-point',
 *   title: 'Temperature Over Time',
 *   axes: { x: 'Month', y: 'Temperature (F)' },
 *   x: 'month',
 *   y: 'temp',
 *   fill: 'city',
 * });
 * ```
 */
export function bindD3Line(svg: Element, config: D3LineConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    pointSelector,
    x: xAccessor = 'x',
    y: yAccessor = 'y',
    fill: fillAccessor = 'fill',
  } = config;

  const lineElements = queryD3Elements(svg, selector);
  const data: LinePoint[][] = [];

  if (pointSelector) {
    // Track which point elements we've already processed to avoid
    // double-counting when multiple line paths share a parent <g>.
    const processedPoints = new Set<Element>();

    for (const { element } of lineElements) {
      const parent = element.parentElement ?? svg;
      const points = queryD3Elements(parent, pointSelector);

      const lineData: LinePoint[] = [];
      for (const { element: pointEl, datum, index } of points) {
        if (processedPoints.has(pointEl))
          continue;
        processedPoints.add(pointEl);

        if (!datum) {
          throw new Error(
            `No D3 data bound to point element at index ${index}. `
            + `Ensure D3's .data() join has been applied to the "${pointSelector}" elements.`,
          );
        }
        const point: LinePoint = {
          x: resolveAccessor<number | string>(datum, xAccessor, index),
          y: resolveAccessor<number>(datum, yAccessor, index),
        };
        const fill = resolveAccessorOptional<string>(datum, fillAccessor, index);
        if (fill !== undefined) {
          point.fill = fill;
        }
        lineData.push(point);
      }

      if (lineData.length > 0) {
        data.push(lineData);
      }
    }
  } else {
    // Extract data from the path element's bound data directly
    // D3 line charts typically bind an array of points to each path
    for (const { datum } of lineElements) {
      if (!datum) {
        throw new Error(
          `No D3 data bound to line path element. `
          + `Ensure D3's .data() join has been applied to the "${selector}" elements, `
          + `or provide a pointSelector.`,
        );
      }

      const pointArray = Array.isArray(datum) ? datum : [datum];
      const lineData: LinePoint[] = pointArray.map((d: unknown, index: number) => {
        const point: LinePoint = {
          x: resolveAccessor<number | string>(d, xAccessor, index),
          y: resolveAccessor<number>(d, yAccessor, index),
        };
        const fill = resolveAccessorOptional<string>(d, fillAccessor, index);
        if (fill !== undefined) {
          point.fill = fill;
        }
        return point;
      });

      if (lineData.length > 0) {
        data.push(lineData);
      }
    }
  }

  // Extract legend labels from fill values
  const legend: string[] = [];
  for (const lineData of data) {
    const fill = lineData[0]?.fill;
    if (fill) {
      legend.push(fill);
    }
  }

  const layerId = generateId();
  const selectorValue = scopeSelector(svg, selector);
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.LINE,
    title,
    selectors: selectorValue,
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
      ...(legend.length > 0 ? { legend } : {}),
      layers: [layer],
    }]],
  };

  return { maidr, layer };
}
