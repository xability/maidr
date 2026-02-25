/**
 * D3 binder for heatmaps.
 *
 * Extracts data from D3.js-rendered heatmap SVG elements and generates
 * the MAIDR JSON schema for accessible heatmap interaction.
 */

import type { HeatmapData, Maidr, MaidrLayer } from '../type/grammar';
import type { D3BinderResult, D3HeatmapConfig } from './types';
import { TraceType } from '../type/grammar';
import { generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Binds a D3.js heatmap to MAIDR, generating the accessible data representation.
 *
 * Extracts cell data from D3-bound SVG elements (`<rect>`) organized in a grid
 * and produces a complete {@link Maidr} data structure. The cells are grouped
 * by their x and y category values to form the 2D points grid.
 *
 * @param svg - The SVG element containing the D3 heatmap.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 * @throws Error if any cell coordinate pair is missing from the extracted data.
 *
 * @example
 * ```ts
 * const result = bindD3Heatmap(svgElement, {
 *   selector: 'rect.cell',
 *   title: 'Correlation Matrix',
 *   axes: { x: 'Variable', y: 'Variable', fill: 'Correlation' },
 *   x: 'xVar',
 *   y: 'yVar',
 *   value: 'correlation',
 * });
 * ```
 */
export function bindD3Heatmap(svg: Element, config: D3HeatmapConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    x: xAccessor = 'x',
    y: yAccessor = 'y',
    value: valueAccessor = 'value',
  } = config;

  const elements = queryD3Elements(svg, selector);

  // Extract raw cell data
  const cells: { x: string; y: string; value: number }[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }
    return {
      x: String(resolveAccessor<string>(datum, xAccessor, index)),
      y: String(resolveAccessor<string>(datum, yAccessor, index)),
      value: resolveAccessor<number>(datum, valueAccessor, index),
    };
  });

  // Build unique x and y labels (preserving order of appearance)
  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const seenX = new Set<string>();
  const seenY = new Set<string>();

  for (const cell of cells) {
    if (!seenX.has(cell.x)) {
      seenX.add(cell.x);
      xLabels.push(cell.x);
    }
    if (!seenY.has(cell.y)) {
      seenY.add(cell.y);
      yLabels.push(cell.y);
    }
  }

  // Build the 2D points grid using nested Maps to avoid key collisions
  const cellMap = new Map<string, Map<string, number>>();
  for (const cell of cells) {
    let row = cellMap.get(cell.y);
    if (!row) {
      row = new Map();
      cellMap.set(cell.y, row);
    }
    row.set(cell.x, cell.value);
  }

  const points: number[][] = [];
  for (const yLabel of yLabels) {
    const row: number[] = [];
    const rowMap = cellMap.get(yLabel);
    for (const xLabel of xLabels) {
      const value = rowMap?.get(xLabel);
      if (value === undefined) {
        throw new Error(
          `Missing heatmap cell for y="${yLabel}", x="${xLabel}". `
          + `Expected a complete grid of ${yLabels.length} x ${xLabels.length} cells `
          + `but found ${cells.length} elements.`,
        );
      }
      row.push(value);
    }
    points.push(row);
  }

  const data: HeatmapData = {
    x: xLabels,
    y: yLabels,
    points,
  };

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.HEATMAP,
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
    subplots: [[{ layers: [layer] }]],
  };

  return { maidr, layer };
}
