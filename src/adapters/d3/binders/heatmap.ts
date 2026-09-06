/**
 * D3 binder for heatmaps.
 *
 * Extracts data from D3.js-rendered heatmap SVG elements and generates
 * the MAIDR JSON schema for accessible heatmap interaction.
 */

import type { HeatmapData, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3HeatmapConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector, stampOrderedSelectors } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

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
 * @remarks
 * **Say which row is the top one, and which column is the leftmost.** The
 * schema orders a heatmap's rows top-first and its columns left-first, and
 * without {@link D3HeatmapConfig.yOrder} and {@link D3HeatmapConfig.xOrder}
 * both are taken in the order the cells appear in the DOM -- the order your
 * `.data().join()` ran in, which need not be the order your scales draw. A
 * band scale whose domain ascends up the page joins bottom-first, and the
 * chart is then read upside down: the cursor enters at the top row and
 * <kbd>Up</kbd> walks down it. The column equivalent reads it mirrored, with
 * <kbd>Right</kbd> walking left. Nothing errors either way, and every value is
 * still announced against its own label (#978, #1013). Pass
 * `yOrder: yScale.domain()` and `xOrder: xScale.domain()`, reversing either
 * for a band scale that runs the other way.
 *
 * @param svg - The SVG element containing the D3 heatmap.
 * @param config - Configuration specifying the selector and data accessors.
 * @remarks
 * **A grid the join does not fill is read, not refused.** A tidy array with no
 * row for one label pair simply draws no rect there, and the schema spells
 * that cell `null` rather than `0` -- a value the chart never drew (#1191).
 * Its slot in the selector grid is a hole too, so every drawn cell's selector
 * stays aligned with the value it names.
 *
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
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
  return finalizeSingleChart(svg, config, buildHeatmapLayer(svg, config));
}

/**
 * Pure extraction core for heatmaps. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
/** The attribute each cell is stamped with, so a selector names one cell. */
const CELL_ATTRIBUTE = 'data-maidr-heatmap-cell';

/**
 * The row labels in the order the chart draws them, top first.
 *
 * @param appearance - The categories in the order they appear in the DOM
 * @param declared - What the caller said the drawn order is, if anything
 * @returns The declared order when it names every one, else `appearance`
 */
function orderedCategories(appearance: string[], declared?: string[]): string[] {
  if (!declared) {
    return appearance;
  }

  const present = new Set(appearance);
  const taken = new Set<string>();
  const ordered: string[] = [];
  for (const row of declared) {
    // Repeats are dropped as well as unknowns, so the length check below
    // really does mean "names every category exactly once". Taking the first
    // mention and counting alone would let `['a', 'a']` past for a grid of
    // `a` and `b`, emitting one twice and losing the other outright.
    if (present.has(row) && !taken.has(row)) {
      taken.add(row);
      ordered.push(row);
    }
  }

  // Naming categories the chart does not draw is ordinary -- a scale's domain
  // outlives a filter -- so the extras are dropped. Naming *fewer* than it
  // draws is not a description of this grid, and honouring it would lose one
  // the reader can see, so appearance order is kept instead.
  return ordered.length === appearance.length ? ordered : appearance;
}

export function buildHeatmapLayer(root: Element, config: D3HeatmapConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    yOrder,
    xOrder,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'heatmap cell');
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
  const cells: { x: string; y: string; value: number; element: Element }[] = elements.map(({ element, datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    return {
      x: String(resolveAccessor<string>(datum, xAccessor, index)),
      y: String(resolveAccessor<string>(datum, yAccessor, index)),
      value: resolveAccessor<number>(datum, valueAccessor, index),
      element,
    };
  });

  // Build unique x and y labels (preserving order of appearance)
  const appearanceX: string[] = [];
  const appearanceY: string[] = [];
  const seenX = new Set<string>();
  const seenY = new Set<string>();

  for (const cell of cells) {
    if (!seenX.has(cell.x)) {
      seenX.add(cell.x);
      appearanceX.push(cell.x);
    }
    if (!seenY.has(cell.y)) {
      seenY.add(cell.y);
      appearanceY.push(cell.y);
    }
  }

  // `HeatmapData` runs top-first and left-first, and appearance order is the
  // order the join happened to run in -- which for a band scale whose domain
  // ascends is bottom-first, and for anything else is nobody's order in
  // particular. Unlike the library adapters there is no scale to consult here,
  // so the caller says: rows since #978, columns since #1013.
  const yLabels = orderedCategories(appearanceY, yOrder);
  const xLabels = orderedCategories(appearanceX, xOrder);

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

  // A grid is a rectangle and a join need not fill it: a tidy array with no
  // row for one label pair simply draws no rect there. `HeatmapData.points`
  // spells that cell `null` -- not `0`, which is a value the chart never drew
  // (#1191) -- so the gap is emitted rather than aborting the whole bind.
  const points: (number | null)[][] = [];
  for (const yLabel of yLabels) {
    const row: (number | null)[] = [];
    const rowMap = cellMap.get(yLabel);
    for (const xLabel of xLabels) {
      const value = rowMap?.get(xLabel);
      row.push(value === undefined ? null : value);
    }
    points.push(row);
  }

  const data: HeatmapData = {
    x: xLabels,
    y: yLabels,
    points,
  };

  // One selector per cell, keyed to a stamp rather than to the DOM's own
  // order. A single selector resolves in DOM order, which ties the highlight
  // back to the join the row order was just taken off -- so reordering the
  // rows alone would announce one cell and outline another. The model indexes
  // `selectors[r][c]` by its *own* row, which is the reverse of the payload's
  // (it turns the rows over on construction), so the grid is laid out that way
  // here (#978).
  const byCell = new Map<string, Element>();
  for (const cell of cells) {
    byCell.set(`${cell.y}\u0000${cell.x}`, cell.element);
  }
  // A cell the join drew no mark for keeps its slot as `null`, which the grid
  // explicitly permits. Dropping it instead would shift every later cell's
  // selector one place left of the value it names.
  const ordered: (Element | null)[] = [];
  for (let r = 0; r < yLabels.length; r++) {
    const yLabel = yLabels[yLabels.length - 1 - r];
    for (const xLabel of xLabels) {
      ordered.push(byCell.get(`${yLabel}\u0000${xLabel}`) ?? null);
    }
  }
  const drawn = ordered.filter((element): element is Element => element !== null);
  const flat = drawn.length === cells.length
    ? stampOrderedSelectors(root, selector, CELL_ATTRIBUTE, drawn, panel)
    : null;
  let stamped = 0;
  const grid = flat === null
    ? null
    : ordered.map(element => element === null ? null : flat[stamped++]);
  const selectors = grid === null
    ? scopeSelector(root, selector, panel)
    : yLabels.map((_, r) => grid.slice(r * xLabels.length, (r + 1) * xLabels.length));

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.HEATMAP,
    title,
    selectors,
    axes: buildAxes(axes, format),
    data,
    // Only meaningful for the fallback, where one selector still has to be
    // flattened: D3 joins rects row-major, while the model otherwise assumes
    // the column-major convention matplotlib's path elements use.
    ...(flat === null ? { domMapping: { order: 'row' as const } } : {}),
  };

  return { layer };
}
