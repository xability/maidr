/**
 * D3 binder for smooth/regression line charts.
 *
 * Extracts data from D3.js-rendered smooth curve SVG elements and generates
 * the MAIDR JSON schema for accessible smooth plot interaction.
 */

import type { Maidr, MaidrLayer, SmoothPoint } from '../type/grammar';
import type { D3BinderResult, D3SmoothConfig } from './types';
import { TraceType } from '../type/grammar';
import { buildAxes, generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Binds a D3.js smooth/regression line to MAIDR, generating the accessible data representation.
 *
 * Smooth traces are typically regression lines or kernel density curves. Each point
 * has both data coordinates (x, y) and SVG pixel coordinates (svg_x, svg_y).
 *
 * @param svg - The SVG element containing the D3 smooth line.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Smooth(svgElement, {
 *   selector: 'circle.smooth-point',
 *   title: 'Regression Line',
 *   axes: { x: 'X', y: 'Predicted Y' },
 *   x: 'x',
 *   y: 'yPred',
 *   svgX: (d) => d.screenX,
 *   svgY: (d) => d.screenY,
 * });
 * ```
 */
export function bindD3Smooth(svg: Element, config: D3SmoothConfig): D3BinderResult {
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
    svgX: svgXAccessor = 'svg_x',
    svgY: svgYAccessor = 'svg_y',
    fill: fillAccessor = 'fill',
  } = config;

  const lineElements = queryD3Elements(svg, selector);
  const data: SmoothPoint[][] = [];
  const selectors: string[] = [];
  const fillLabels: string[] = [];

  if (pointSelector) {
    // Extract from individual point elements grouped by line
    const processedParents = new Set<Element>();

    for (const { element } of lineElements) {
      const parent = element.parentElement;
      const container = (parent && parent !== svg && parent.tagName.toLowerCase() === 'g')
        ? parent
        : svg;

      if (processedParents.has(container)) {
        continue;
      }
      processedParents.add(container);

      const points = queryD3Elements(container, pointSelector);

      const lineData: SmoothPoint[] = points.map(({ datum, element: el, index }) => {
        if (!datum) {
          throw new Error(
            `No D3 data bound to point element at index ${index}. `
            + `Ensure D3's .data() join has been applied to the "${pointSelector}" elements.`,
          );
        }

        // Try data accessors first, fall back to SVG element attributes
        const svgX = resolveAccessor<number>(datum, svgXAccessor, index)
          ?? Number(el.getAttribute('cx') ?? el.getAttribute('x') ?? 0);
        const svgY = resolveAccessor<number>(datum, svgYAccessor, index)
          ?? Number(el.getAttribute('cy') ?? el.getAttribute('y') ?? 0);

        return {
          x: resolveAccessor<number>(datum, xAccessor, index) as number,
          y: resolveAccessor<number>(datum, yAccessor, index) as number,
          svg_x: svgX,
          svg_y: svgY,
        };
      });

      if (lineData.length > 0) {
        data.push(lineData);
        selectors.push(scopeSelector(svg, pointSelector));

        // Extract fill label from first point's datum
        const firstDatum = points[0]?.datum;
        if (firstDatum) {
          const fill = resolveAccessor<string>(firstDatum, fillAccessor, 0);
          if (fill !== undefined) {
            fillLabels.push(fill);
          }
        }
      }
    }
  } else {
    // Extract from path's bound data (array of points per path)
    for (const { datum } of lineElements) {
      if (!datum) {
        throw new Error(
          `No D3 data bound to smooth path element. `
          + `Ensure D3's .data() join has been applied to the "${selector}" elements, `
          + `or provide a pointSelector.`,
        );
      }

      const pointArray = Array.isArray(datum) ? datum : [datum];
      const lineData: SmoothPoint[] = pointArray.map((d: unknown, index: number) => ({
        x: resolveAccessor<number>(d, xAccessor, index) as number,
        y: resolveAccessor<number>(d, yAccessor, index) as number,
        svg_x: resolveAccessor<number>(d, svgXAccessor, index) ?? 0,
        svg_y: resolveAccessor<number>(d, svgYAccessor, index) ?? 0,
      }));

      if (lineData.length > 0) {
        data.push(lineData);
      }
    }
    selectors.push(scopeSelector(svg, selector));
  }

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.SMOOTH,
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
      ...(fillLabels.length > 0 ? { legend: fillLabels } : {}),
      layers: [layer],
    }]],
  };

  return { maidr, layer };
}
