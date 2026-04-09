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
