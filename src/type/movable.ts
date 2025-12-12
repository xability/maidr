/**
 * Interface for plot traces that support keyboard navigation and movement.
 */
export interface Movable {
  moveOnce: (direction: MovableDirection) => boolean;
  moveToExtreme: (direction: MovableDirection) => boolean;
  moveToIndex: (row: number, col: number) => boolean;

  isMovable: (target: [number, number] | MovableDirection) => boolean;

  get isInitialEntry(): boolean;
  set isInitialEntry(value: boolean);

  get isOutOfBounds(): boolean;
  set isOutOfBounds(value: boolean);

  get row(): number;
  set row(value: number);

  get col(): number;
  set col(value: number);
}

/**
 * Cardinal directions for navigating through plot data points.
 */
export type MovableDirection = 'UPWARD' | 'DOWNWARD' | 'FORWARD' | 'BACKWARD';

/**
 * Represents a coordinate position with row and column indices.
 */
export interface Coordinate {
  row: number;
  col: number;
}

/**
 * Represents a node in a graph structure with directional links.
 * Used for navigation in multi-line and complex plot types.
 */
export interface Node {
  up: Coordinate | null;
  down: Coordinate | null;
  left: Coordinate | null;
  right: Coordinate | null;
  top: Coordinate | null;
  bottom: Coordinate | null;
  start: Coordinate | null;
  end: Coordinate | null;
}
