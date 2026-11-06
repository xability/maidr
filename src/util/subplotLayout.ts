import type { Subplot } from '@model/plot';
import type { QueryRoot } from '@util/svg';
import { Svg } from '@util/svg';

/**
 * Pre-computed visual layout information for a multi-panel figure.
 *
 * Because the ordering of subplots in the MAIDR JSON data array does not always
 * match the visual (top-to-bottom, left-to-right) ordering in the SVG, we must
 * inspect the DOM at initialization time to determine the true visual positions.
 *
 * This data is computed once by {@link resolveSubplotLayout} (called from the
 * Controller) and then passed into the Figure, keeping the Model layer free of
 * direct DOM access.
 */
export interface SubplotLayout {
  /**
   * Maps each data position `"row,col"` to its 1-based visual display index
   * (top-left = 1, reading order).
   */
  visualOrderMap: Map<string, number>;

  /**
   * The data-array row index that corresponds to the visually top-left subplot.
   */
  topLeftRow: number;

  /**
   * Whether pressing the Up arrow should decrease the data row index.
   *
   * This is `true` when data row 0 is already at the visual top (lower Y),
   * because {@link MovableGrid} maps UPWARD to row + 1 by default.
   */
  invertVertical: boolean;

  /**
   * Pre-resolved SVG axes elements keyed by `"row,col"`.
   * Each subplot's axes `<g>` is looked up once and stored here so that
   * the Figure.highlight getter needs no runtime DOM access.
   */
  axesElements: Map<string, SVGElement | null>;

  /**
   * The element each subplot's outline is drawn round while the reader moves
   * between subplots, keyed by `"row,col"`; null where none is known, and for
   * every cell of a figure with one subplot, which has no lobby. See
   * {@link findPanel}.
   */
  panelElements: Map<string, Element | null>;
}

/** The namespace an SVG element is in, whichever window made it. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Position entry used internally during visual-order computation.
 */
interface AxesPosition {
  row: number;
  col: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inspects the DOM to resolve the visual layout of all subplots in a figure.
 *
 * This is the **only** place where subplot-related DOM queries happen.
 * The result is a plain data object that can be passed into the Figure model
 * without violating MVVC layer boundaries.
 *
 * Every lookup is made inside `roots`, the chart's own element and the layers
 * it draws outside it, so another chart's panels are neither outlined nor
 * measured. A layer selector that matches nothing there is looked up as
 * {@link Svg.queryAll} does.
 *
 * @param subplots - The 2D subplot array from the Figure (already constructed).
 * @param roots - Where the chart is drawn; the whole page by default.
 * @returns A {@link SubplotLayout} containing pre-computed visual ordering,
 *          starting position, inversion flag, and axes and panel element
 *          references.
 */
export function resolveSubplotLayout(
  subplots: Subplot[][],
  roots: readonly QueryRoot[] = [document],
): SubplotLayout {
  const axesElements = collectAxesElements(subplots, roots);
  let positions = collectAxesPositions(subplots, axesElements);
  const panelElements = collectPanelElements(subplots, axesElements, roots);

  if (positions.length === 0) {
    positions = collectPanelPositions(subplots, roots);
  }

  if (positions.length === 0) {
    return buildFallbackLayout(subplots, axesElements, panelElements);
  }

  const sorted = sortByVisualPosition(positions);
  const visualOrderMap = buildOrderMap(sorted, subplots);
  const topLeftRow = sorted[0].row;
  const invertVertical = detectInversion(positions, subplots.length);

  return { visualOrderMap, topLeftRow, invertVertical, axesElements, panelElements };
}

// ---------------------------------------------------------------------------
// Internal helpers — each function has a single, well-defined purpose.
// ---------------------------------------------------------------------------

/**
 * Finds the parent `<g id="axes_*">` SVG element for a given subplot.
 *
 * Tries two strategies:
 * 1. Walk up from the subplot's own selector element (`subplot.selector`).
 * 2. Walk up from the first layer's selector string (for facet-style plots
 *    where the subplot itself has no selector).
 *
 * @param highlightElement - The element the subplot's own selector names (may be null).
 * @param layerSelector    - CSS selector string from the first layer (may be null).
 * @param roots            - Where the chart is drawn.
 * @returns The matching `<g>` element, or `null` if not found.
 */
function findAxesElement(
  highlightElement: Element | null,
  layerSelector: string | null,
  roots: readonly QueryRoot[],
): SVGElement | null {
  if (highlightElement) {
    const axes = highlightElement.closest('g[id^="axes_"]') as SVGElement | null;
    if (axes)
      return axes;
  }

  if (layerSelector) {
    const el = Svg.queryAll<SVGElement>(layerSelector, roots)[0] ?? null;
    if (el) {
      const axes = el.closest('g[id^="axes_"]') as SVGElement | null;
      if (axes)
        return axes;
    }
  }

  return null;
}

/**
 * Resolves the axes element for every subplot and returns them in a map
 * keyed by `"row,col"`.
 */
function collectAxesElements(
  subplots: Subplot[][],
  roots: readonly QueryRoot[],
): Map<string, SVGElement | null> {
  const map = new Map<string, SVGElement | null>();

  for (let r = 0; r < subplots.length; r++) {
    for (let c = 0; c < subplots[r].length; c++) {
      const subplot = subplots[r][c];
      const axesEl = findAxesElement(
        subplot.getHighlightElement(),
        subplot.getLayerSelector(),
        roots,
      );
      map.set(`${r},${c}`, axesEl);
    }
  }

  return map;
}

/**
 * Reads bounding-box positions for every subplot that has a resolved axes element.
 */
function collectAxesPositions(
  subplots: Subplot[][],
  axesElements: Map<string, SVGElement | null>,
): AxesPosition[] {
  const positions: AxesPosition[] = [];

  for (let r = 0; r < subplots.length; r++) {
    for (let c = 0; c < subplots[r].length; c++) {
      const axesEl = axesElements.get(`${r},${c}`);
      if (axesEl) {
        const bbox = axesEl.getBoundingClientRect();
        positions.push({ row: r, col: c, y: bbox.top, x: bbox.left });
      }
    }
  }

  return positions;
}

/**
 * Sorts position entries in visual reading order: top-to-bottom (ascending Y),
 * then left-to-right (ascending X).
 */
function sortByVisualPosition(entries: AxesPosition[]): AxesPosition[] {
  return [...entries].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Orders the indices of one axis by the screen coordinate its cells report.
 *
 * Only the *direction* is read from the measurements, not the individual
 * positions, so an index nothing could be measured for still lands where it
 * belongs: an empty cell has a place in the grid even when it has none on
 * the screen, and interpolating a coordinate for it would be inventing a
 * measurement rather than using one.
 *
 * @param count - How many indices this axis has.
 * @param coordOf - The axis coordinate of an index, or undefined if nothing
 *   at that index could be measured.
 * @returns The indices, in visual order.
 */
function axisOrder(
  count: number,
  coordOf: (index: number) => number | undefined,
): number[] {
  const all = Array.from({ length: count }, (_, index) => index);
  const measured = all.filter(index => coordOf(index) !== undefined);

  // The first pair that actually differs. Equal coordinates say nothing about
  // direction, and panels drawn exactly on top of each other report them.
  let descending = false;
  for (let k = 1; k < measured.length; k++) {
    const before = coordOf(measured[k - 1])!;
    const after = coordOf(measured[k])!;
    if (before !== after) {
      descending = before > after;
      break;
    }
  }

  return descending ? all.reverse() : all;
}

/**
 * Creates a 1-based visual index map covering **every** cell of the grid.
 *
 * Numbering only the cells that could be measured left an empty one with no
 * entry at all, and `Figure.state` then announced it as subplot 1 -- the
 * index the top-left panel already claims, so two different cells answered to
 * the same number and a reader had no way to tell where they were. The total
 * was meanwhile the whole cell count, so the announced index and the
 * announced total were counting different things and the last index was
 * never reachable (#1085).
 *
 * Both halves now come from the same set: the indices run 1..cells, and every
 * one of them is somewhere a reader can stand.
 *
 * @param sorted - Measured positions, in visual order.
 * @param subplots - The full grid, including cells nothing could be measured
 *   for.
 * @returns A 1-based index for every cell.
 */
function buildOrderMap(
  sorted: AxesPosition[],
  subplots: Subplot[][],
): Map<string, number> {
  const numCols = subplots.reduce((widest, row) => Math.max(widest, row.length), 0);
  const first = (
    entries: AxesPosition[],
    match: (entry: AxesPosition) => boolean,
    coord: (entry: AxesPosition) => number,
  ): number | undefined => {
    const found = entries.find(match);
    return found === undefined ? undefined : coord(found);
  };

  // `sorted` is already in reading order, so the first entry for a row or
  // column is its topmost or leftmost cell.
  const rowOrder = axisOrder(subplots.length, row =>
    first(sorted, entry => entry.row === row, entry => entry.y));
  const colOrder = axisOrder(numCols, col =>
    first(sorted, entry => entry.col === col, entry => entry.x));

  const map = new Map<string, number>();
  let index = 1;
  for (const row of rowOrder) {
    for (const col of colOrder) {
      // Ragged grids are allowed: a shorter row simply has no cell there.
      // The length is enough to say which, because a row is left-packed --
      // a producer fills every position it emits, and a cell with nothing
      // drawn in it is a `Subplot` carrying `layers: []` rather than a hole
      // in the array. A row missing its *leading* column is not a shape the
      // grammar can express.
      if (col < subplots[row].length) {
        map.set(`${row},${col}`, index++);
      }
    }
  }
  return map;
}

/**
 * Determines whether vertical navigation directions should be inverted.
 *
 * If data row 0 has a *lower* screen Y than data row 1 (i.e. row 0 is
 * visually above row 1), then the data is ordered top-to-bottom. Because
 * {@link MovableGrid} maps `UPWARD` to `row + 1`, we must invert so that
 * pressing Up actually moves toward lower row indices (visually upward).
 */
function detectInversion(entries: AxesPosition[], numRows: number): boolean {
  if (numRows <= 1)
    return false;

  const row0 = entries.find(e => e.row === 0);
  const row1 = entries.find(e => e.row === 1);

  if (row0 && row1) {
    return row0.y < row1.y;
  }
  return false;
}

/**
 * Measures each subplot's own panel element when no `<g id="axes_*">` groups
 * exist (charts not rendered by matplotlib — Vega-Lite cells, per-panel chart
 * containers, etc.).
 *
 * The element the subplot's own selector names is preferred; the first
 * element matched by the first layer's selector is used as a fallback. Positions are only trusted when EVERY subplot resolves to an
 * element with distinct, non-degenerate geometry — otherwise an empty array
 * is returned and the caller falls back to data-array order. This keeps
 * jsdom/test environments (all-zero rects) and partially-rendered charts on
 * the conservative path.
 */
function collectPanelPositions(
  subplots: Subplot[][],
  roots: readonly QueryRoot[],
): AxesPosition[] {
  const positions: AxesPosition[] = [];

  for (let r = 0; r < subplots.length; r++) {
    for (let c = 0; c < subplots[r].length; c++) {
      const el = resolvePanelElement(subplots[r][c], roots);
      if (!el) {
        return [];
      }
      const bbox = el.getBoundingClientRect();
      positions.push({ row: r, col: c, y: bbox.top, x: bbox.left });
    }
  }

  if (positions.length < 2) {
    return [];
  }

  const distinct = new Set(positions.map(p => `${p.x},${p.y}`));
  if (distinct.size !== positions.length) {
    return [];
  }

  return positions;
}

/**
 * Resolves the DOM element that best represents a subplot's panel geometry.
 */
function resolvePanelElement(subplot: Subplot, roots: readonly QueryRoot[]): Element | null {
  const highlight = subplot.getHighlightElement();
  if (highlight && hasGeometry(highlight)) {
    return highlight;
  }

  const selector = subplot.getLayerSelector();
  if (selector) {
    const el = Svg.queryAll(selector, roots)[0] ?? null;
    if (el && hasGeometry(el)) {
      return el;
    }
  }

  return null;
}

/**
 * Whether an element reports any usable bounding-box geometry.
 */
function hasGeometry(el: Element): boolean {
  const bbox = el.getBoundingClientRect();
  return bbox.width > 0 || bbox.height > 0 || bbox.top !== 0 || bbox.left !== 0;
}

/**
 * Returns a default layout when no DOM elements are found (fallback).
 * Uses data-array order directly: index 1 = (0,0), no inversion.
 */
function buildFallbackLayout(
  subplots: Subplot[][],
  axesElements: Map<string, SVGElement | null>,
  panelElements: Map<string, Element | null>,
): SubplotLayout {
  const visualOrderMap = new Map<string, number>();
  let idx = 1;
  for (let r = 0; r < subplots.length; r++) {
    for (let c = 0; c < subplots[r].length; c++) {
      visualOrderMap.set(`${r},${c}`, idx++);
    }
  }

  return {
    visualOrderMap,
    topLeftRow: 0,
    invertVertical: false,
    axesElements,
    panelElements,
  };
}

/**
 * Resolves the element each subplot's outline is drawn round, keyed by
 * `"row,col"`. A figure with one subplot has no lobby, and gets none.
 *
 * @param subplots - The figure's subplots
 * @param axesElements - Each subplot's `<g id="axes_*">`, where it has one
 * @param roots - Where the chart is drawn
 * @returns The element for each cell, or null
 */
function collectPanelElements(
  subplots: Subplot[][],
  axesElements: Map<string, SVGElement | null>,
  roots: readonly QueryRoot[],
): Map<string, Element | null> {
  const map = new Map<string, Element | null>();
  const cells = subplots.flatMap((row, r) => row.map((subplot, c) => ({ subplot, key: `${r},${c}` })));
  if (cells.length <= 1) {
    cells.forEach(cell => map.set(cell.key, null));
    return map;
  }

  const marks = cells.map(cell => layerMarks(cell.subplot, roots));
  cells.forEach((cell, at) => {
    const others = marks.flatMap((elements, other) => (other === at ? [] : elements));
    map.set(cell.key, findPanel(cell.subplot, axesElements.get(cell.key) ?? null, marks[at], others, roots));
  });
  return map;
}

/**
 * The element a subplot's outline is drawn round in the lobby.
 *
 * The panel is the subplot's `<g id="axes_*">` where it has one, as a
 * matplotlib figure does; else the element its own `selector` names, as
 * Vega-Lite, lattice and Bokeh name theirs; else the largest element holding
 * its first layer's marks and no other subplot's, as a Frappe panel's own
 * chart or a Highcharts pane's series group does. A panel that draws its own
 * filled background is outlined along that background, as a matplotlib
 * axes' patch is. Outlined only within matplotlib's axes groups, as this
 * was, the lobby of every other producer's figure showed nothing, and a
 * group whose first shape was a mark had that mark outlined: a dendrogram's
 * first link, or a D3 panel's first bar.
 *
 * @param subplot - The subplot
 * @param axes - Its axes group, or null
 * @param marks - Its first layer's marks
 * @param others - Every other subplot's first layer's marks
 * @param roots - Where the chart is drawn
 * @returns The panel, or its background, or null when none is found
 */
function findPanel(
  subplot: Subplot,
  axes: SVGElement | null,
  marks: readonly Element[],
  others: readonly Element[],
  roots: readonly QueryRoot[],
): Element | null {
  const panel = axes ?? subplot.getHighlightElement() ?? exclusiveAncestor(marks, others, roots);
  return panel === null ? null : backgroundOf(panel, marks) ?? panel;
}

/**
 * The elements a subplot's first layer names, through every selector it
 * holds, whatever their shape.
 *
 * @param subplot - The subplot
 * @param roots - Where the chart is drawn
 * @returns Its marks, or none
 */
function layerMarks(subplot: Subplot, roots: readonly QueryRoot[]): Element[] {
  const marks = subplot.getLayerMarkSelectors().flatMap(selector => Svg.queryAll<Element>(selector, roots));
  return [...new Set(marks)];
}

/**
 * The largest element holding every one of a subplot's marks and none of
 * another subplot's, inside the chart.
 *
 * @param marks - The subplot's marks
 * @param others - Every other subplot's marks
 * @param roots - Where the chart is drawn
 * @returns The element, or null when the marks are shared with another
 *   subplot's in every element that holds them
 */
function exclusiveAncestor(
  marks: readonly Element[],
  others: readonly Element[],
  roots: readonly QueryRoot[],
): Element | null {
  const holdsOther = (element: Element): boolean => others.some(other => element.contains(other));
  const inChart = (element: Element): boolean =>
    roots.some(root => root !== element && root.contains(element));

  let ancestor = marks[0]?.parentElement ?? null;
  while (ancestor !== null && !marks.every(mark => ancestor?.contains(mark))) {
    ancestor = ancestor.parentElement;
  }
  if (ancestor === null || !inChart(ancestor) || holdsOther(ancestor)) {
    return null;
  }
  for (let parent = ancestor.parentElement; parent !== null && inChart(parent) && !holdsOther(parent);
    parent = parent.parentElement) {
    ancestor = parent;
  }
  return ancestor;
}

/**
 * The filled background a panel draws behind its marks: the first rect or
 * path inside it, where that is filled and holds every mark. A matplotlib
 * axes' patch is one; a group whose first shape is one of its marks, as a
 * dendrogram's links or a D3 panel's bars are, has none.
 *
 * @param panel - The panel
 * @param marks - The subplot's marks
 * @returns The background, or null
 */
function backgroundOf(panel: Element, marks: readonly Element[]): Element | null {
  if (panel.namespaceURI !== SVG_NAMESPACE || panel.matches('rect, path')) {
    return null;
  }
  const first = panel.querySelector('rect, path');
  const view = panel.ownerDocument.defaultView;
  if (first === null || view === null || marks.includes(first)) {
    return null;
  }
  const style = view.getComputedStyle(first);
  if (style.fill === 'none' || style.fill === 'transparent' || Number.parseFloat(style.fillOpacity) === 0) {
    return null;
  }
  const box = first.getBoundingClientRect();
  const holds = (element: Element): boolean => {
    const mark = element.getBoundingClientRect();
    const x = mark.left + mark.width / 2;
    const y = mark.top + mark.height / 2;
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };
  return box.width > 0 && box.height > 0 && marks.every(holds) ? first : null;
}
