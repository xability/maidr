import type { BarPoint, LinePoint, ScatterPoint, SegmentedPoint, SmoothPoint } from '@type/grammar';

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

export interface NavigableReference {
  // Essential identification
  id: string;
  value: XValue; // The actual navigable value

  // Navigation type based on data structure
  type: 'coordinate' | 'category' | 'group' | 'bin' | 'timestamp';

  // Position within the plot's data structure
  position: {
    row: number; // Row index in data array
    col: number; // Column index in data array
    subIndex?: number; // For nested data (e.g., outliers in box plots)
  };

  // Plot context
  context: {
    plotType: string; // From grammar.ts TraceType enum
    orientation?: string; // VERTICAL or HORIZONTAL (optional for plots without orientation)
    groupIndex?: number; // For grouped plots (stacked/dodged)
  };

  // Accessibility
  accessibility: {
    description: string; // Human-readable description
    shortLabel: string; // Short label for UI
    valueType: 'numeric' | 'categorical' | 'temporal';
  };
}
