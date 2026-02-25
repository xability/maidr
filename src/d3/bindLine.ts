/**
 * D3 binder for line charts.
 *
 * Extracts data from D3.js-rendered line chart SVG elements and generates
 * the MAIDR JSON schema for accessible line chart interaction.
 */

import type { LinePoint, Maidr, MaidrLayer } from '../type/grammar';
import type { D3BinderResult, D3LineConfig } from './types';
import { TraceType } from '../type/grammar';
import { buildAxes, generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Extracts a single line's point data from a set of D3-bound point elements.
 */
function extractLinePoints(
  points: { datum: unknown; index: number }[],
  xAccessor: D3LineConfig['x'],
  yAccessor: D3LineConfig['y'],
  fillAccessor: D3LineConfig['fill'],
  pointSelector: string,
): LinePoint[] {
  const xAcc = xAccessor ?? 'x';
  const yAcc = yAccessor ?? 'y';
  const fillAcc = fillAccessor ?? 'fill';

  return points.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to point element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${pointSelector}" elements.`,
      );
    }
    const point: LinePoint = {
      x: resolveAccessor<number | string>(datum, xAcc, index) as number | string,
      y: resolveAccessor<number>(datum, yAcc, index) as number,
    };
    const fill = resolveAccessor<string>(datum, fillAcc, index);
    if (fill !== undefined) {
      point.fill = fill;
    }
    return point;
  });
}

/**
 * Binds a D3.js line chart to MAIDR, generating the accessible data representation.
 *
 * Supports both single-line and multi-line charts. Data can be extracted from:
 * 1. D3-bound data on point elements (circles, etc.) via `pointSelector`.
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
  const selectors: string[] = [];

  if (pointSelector) {
    // Extract data from individual point elements grouped by line.
    // Group line elements by their parent <g> to avoid querying the
    // same parent multiple times when multiple lines share one.
    const processedParents = new Set<Element>();
    let usedScopedExtraction = false;

    for (const { element } of lineElements) {
      const parent = element.parentElement;
      // Only scope to parent if it is a distinct <g> wrapper for this line
      // (not the SVG root itself, which would match all points).
      if (parent && parent !== svg && parent.tagName.toLowerCase() === 'g') {
        if (processedParents.has(parent)) {
          continue;
        }
        processedParents.add(parent);

        const points = queryD3Elements(parent, pointSelector);
        const lineData = extractLinePoints(points, xAccessor, yAccessor, fillAccessor, pointSelector);
        if (lineData.length > 0) {
          data.push(lineData);
          selectors.push(scopeSelector(svg, pointSelector));
          usedScopedExtraction = true;
        }
      }
    }

    // Fallback: if lines are not wrapped in individual <g> elements,
    // query all points from the SVG and partition evenly by line count.
    if (!usedScopedExtraction && lineElements.length > 0) {
      const allPoints = queryD3Elements(svg, pointSelector);
      const pointsPerLine = Math.floor(allPoints.length / lineElements.length);
      for (let i = 0; i < lineElements.length; i++) {
        const start = i * pointsPerLine;
        const end = i === lineElements.length - 1 ? allPoints.length : start + pointsPerLine;
        const lineData = extractLinePoints(
          allPoints.slice(start, end),
          xAccessor,
          yAccessor,
          fillAccessor,
          pointSelector,
        );
        if (lineData.length > 0) {
          data.push(lineData);
          selectors.push(scopeSelector(svg, pointSelector));
        }
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
          x: resolveAccessor<number | string>(d, xAccessor, index) as number | string,
          y: resolveAccessor<number>(d, yAccessor, index) as number,
        };
        const fill = resolveAccessor<string>(d, fillAccessor, index);
        if (fill !== undefined) {
          point.fill = fill;
        }
        return point;
      });

      if (lineData.length > 0) {
        data.push(lineData);
      }
    }

    selectors.push(scopeSelector(svg, selector));
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
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.LINE,
    title,
    selectors: selectors.length === 1 ? selectors[0] : selectors,
    axes: buildAxes(axes, format),
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
