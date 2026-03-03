import type { Subplot } from '@model/plot';

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
   * Total number of `<g id="axes_*">` groups found in the SVG.
   * Used by Figure.highlight to decide whether to show subplot outlines.
   */
  totalAxesCount: number;

  /**
   * Pre-resolved SVG axes elements keyed by `"row,col"`.
   * Each subplot's axes `<g>` is looked up once and stored here so that
   * the Figure.highlight getter needs no runtime DOM access.
   */
  axesElements: Map<string, SVGElement | null>;
}

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
 * @param subplots - The 2D subplot array from the Figure (already constructed).
 * @returns A {@link SubplotLayout} containing pre-computed visual ordering,
 *          starting position, inversion flag, and axes element references.
 */
export function resolveSubplotLayout(subplots: Subplot[][]): SubplotLayout {
  const axesElements = collectAxesElements(subplots);
  const positions = collectAxesPositions(subplots, axesElements);
  const totalAxesCount = document.querySelectorAll('g[id^="axes_"]').length;

  if (positions.length === 0) {
    return buildFallbackLayout(subplots, totalAxesCount, axesElements);
  }

  const sorted = sortByVisualPosition(positions);
  const visualOrderMap = buildOrderMap(sorted);
  const topLeftRow = sorted[0].row;
  const invertVertical = detectInversion(positions, subplots.length);

  return { visualOrderMap, topLeftRow, invertVertical, totalAxesCount, axesElements };
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
 * @param highlightElement - The subplot's own SVG highlight element (may be null).
 * @param layerSelector    - CSS selector string from the first layer (may be null).
 * @returns The matching `<g>` element, or `null` if not found.
 */
function findAxesElement(
  highlightElement: SVGElement | null,
  layerSelector: string | null,
): SVGElement | null {
  if (highlightElement) {
    const axes = highlightElement.closest('g[id^="axes_"]') as SVGElement | null;
    if (axes)
      return axes;
  }

  if (layerSelector) {
    const el = document.querySelector(layerSelector) as SVGElement | null;
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
function collectAxesElements(subplots: Subplot[][]): Map<string, SVGElement | null> {
  const map = new Map<string, SVGElement | null>();

  for (let r = 0; r < subplots.length; r++) {
    for (let c = 0; c < subplots[r].length; c++) {
      const subplot = subplots[r][c];
      const axesEl = findAxesElement(
        subplot.getHighlightElement(),
        subplot.getLayerSelector(),
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
 * Creates a 1-based visual index map from a sorted array of positions.
 */
function buildOrderMap(sorted: AxesPosition[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    map.set(`${sorted[i].row},${sorted[i].col}`, i + 1);
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
 * Returns a default layout when no DOM elements are found (fallback).
 * Uses data-array order directly: index 1 = (0,0), no inversion.
 */
function buildFallbackLayout(
  subplots: Subplot[][],
  totalAxesCount: number,
  axesElements: Map<string, SVGElement | null>,
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
    totalAxesCount,
    axesElements,
  };
}
