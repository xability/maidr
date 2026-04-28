/**
 * D3 binder for heatmaps.
 *
 * Extracts data from D3.js-rendered heatmap SVG elements and generates
 * the MAIDR JSON schema for accessible heatmap interaction.
 */

import type { HeatmapData, Maidr, MaidrLayer } from '../../../type/grammar';
import type { D3BinderResult, D3HeatmapConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { applyMaidrData, buildAxes, buildNoDatumError, buildNoElementsError, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/**
 * Binds a D3.js heatmap to MAIDR, generating the accessible data representation.
 *
 * Extracts cell data from D3-bound SVG elements (`<rect>`) organized in a grid
 * and produces a complete {@link Maidr} data structure. The cells are grouped
 * by their x and y category values to form the 2D points grid.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: the x/y category pair and cell value bound
 * to each heatmap cell. Calling it before `.data().join()` has run (or
 * before the SVG is mounted) throws "No elements found for selector …" or
 * "Property '…' not found on datum".
 *
 * Typical call sites:
 * - **Vanilla JS:** right after your `selectAll(...).data(...).join(...)` chain.
 * - **React:** inside `useEffect`, never during render. Prefer
 *   {@link MaidrD3} / {@link useD3Adapter} from `maidr/react`, which
 *   handle the post-render timing for you.
 * - **Async data:** inside the `.then(...)` of your fetch, after drawing.
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
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
    autoApply,
  } = config;

  const elements = queryD3Elements(svg, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(svg, selector, 'heatmap cell');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string>(
    config,
    'x',
    'x',
    ['xLabel', 'xVar', 'category', 'col', 'column'],
    firstDatum,
  );
  const yAccessor = inferAccessor<string>(
    config,
    'y',
    'y',
    ['yLabel', 'yVar', 'group', 'row'],
    firstDatum,
  );
  const valueAccessor = inferAccessor<number>(
    config,
    'value',
    'value',
    ['count', 'amount', 'v', 'z', 'correlation'],
    firstDatum,
  );

  // Extract raw cell data
  const cells: { x: string; y: string; value: number }[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
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
    axes: buildAxes(axes, format),
    data,
    // D3 heatmaps typically join rects in row-major order (outer loop over
    // rows, inner over columns), which matches how we build `points` here.
    // The HeatmapTrace model otherwise defaults to column-major DOM mapping
    // (matplotlib path-element convention), which would transpose the
    // highlight grid relative to the data. Emit the hint explicitly.
    domMapping: { order: 'row' },
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{ layers: [layer] }]],
  };

  applyMaidrData(svg, maidr, autoApply);
  return { maidr, layer };
}
