import type { BarPoint, LinePoint, ScatterPoint, SegmentedPoint, SmoothPoint } from '@type/grammar';

/**
 * Interface for traces that support grid-based navigation.
 * Implemented by trace types that can divide their plot area into
 * navigable cells (e.g., ScatterTrace with grid config).
 */
export interface GridNavigable {
  setGridMode: (enabled: boolean) => void;
  supportsGridMode: () => boolean;
  moveGridUp: () => boolean;
  moveGridDown: () => boolean;
  moveGridLeft: () => boolean;
  moveGridRight: () => boolean;
  getGridDimensions: () => { rows: number; cols: number } | null;
  getGridPosition: () => { row: number; col: number } | null;
  // Grid cell point navigation
  isInCellMode: () => boolean;
  enterGridCell: () => boolean;
  exitGridCell: () => void;
  moveCellPointLeft: () => boolean;
  moveCellPointRight: () => boolean;
}

/**
 * Type guard to check if a plot supports grid navigation.
 */
export function isGridNavigable(plot: unknown): plot is GridNavigable {
  return (
    plot !== null
    && typeof plot === 'object'
    && 'supportsGridMode' in plot
    && typeof (plot as GridNavigable).supportsGridMode === 'function'
  );
}

/**
 * Interface for traces that support point-by-point navigation.
 * In point mode, every individual data point is navigable in two
 * orthogonal sort orders: reading order (left/right) and column-major
 * order (up/down).
 */
export interface PointNavigable {
  setPointMode: (enabled: boolean) => void;
  movePointLeft: () => boolean;
  movePointRight: () => boolean;
  movePointUp: () => boolean;
  movePointDown: () => boolean;
}

/**
 * Type guard to check if a plot supports point navigation.
 */
export function isPointNavigable(plot: unknown): plot is PointNavigable {
  return (
    plot !== null
    && typeof plot === 'object'
    && 'setPointMode' in plot
    && typeof (plot as PointNavigable).setPointMode === 'function'
  );
}

/**
 * Interface for traces whose highlight is a set of individual data points
 * rather than a position on a row/column grid.
 *
 * A scatter-family trace navigates five different index spaces (x-bucket,
 * y-bucket, flat point, grid cell, in-cell x-group), so no single row/column
 * pair can name what it has selected. It publishes the selection as indices
 * into its layer's `data` array instead — the one currency the producing
 * adapter already shares with the model, since the adapter built that array.
 *
 * This is what lets a canvas chart draw a highlight: it has no SVG elements to
 * select, so the element-based highlight path cannot reach it, and an adapter
 * that reconstructed the model's binning would drift from it silently.
 */
export interface PointCloudHighlightable {
  /** Indices into the layer's `data` array of the currently highlighted points. */
  readonly highlightedPointIndices: readonly number[];
}

/**
 * Type guard to check if a plot publishes point-level highlight identity.
 *
 * The shape is checked, not merely the name: the sibling guards above assert
 * `typeof … === 'function'` on the member they test, and the equivalent here is
 * that the member reads as an array. Reading it is safe and cheap — the getter
 * is pure over fields fixed at construction — and a trace that happened to
 * carry a same-named property of another shape would otherwise be fed to a
 * consumer expecting indices.
 */
export function isPointCloudHighlightable(plot: unknown): plot is PointCloudHighlightable {
  return (
    plot !== null
    && typeof plot === 'object'
    && 'highlightedPointIndices' in plot
    && Array.isArray((plot as PointCloudHighlightable).highlightedPointIndices)
  );
}

/**
 * Union type for all point types that have an 'x' property
 */
export type PointWithX = BarPoint | LinePoint | ScatterPoint | SegmentedPoint | SmoothPoint;

/**
 * Type for X values that can be extracted from points
 */
export type XValue = string | number;

/**
 * Type for points array that can be used in navigation
 */
export type PointsArray = PointWithX[][] | PointWithX[];

/**
 * Type for values array that can be used in navigation
 */
export type ValuesArray = (XValue | { x: XValue })[][];

/**
 * Type guard to check if a value has an 'x' property
 */
export function hasXProperty(value: unknown): value is { x: XValue } {
  return value !== null && typeof value === 'object' && 'x' in value;
}

/**
 * Type guard to check if a value is a valid X value
 */
export function isXValue(value: unknown): value is XValue {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Type guard to check if a point has an 'x' property
 */
export function isPointWithX(point: unknown): point is PointWithX {
  return point !== null && typeof point === 'object' && 'x' in point;
}
