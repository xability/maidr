/**
 * Interface for plot traces that support keyboard navigation and movement.
 */
export interface Movable {
  moveOnce: (direction: MovableDirection) => void;
  moveToExtreme: (direction: MovableDirection) => void;
  moveToIndex: (row: number, col: number) => void;
  moveToPoint: (x: number, y: number) => void;

  isMovable: (target: [number, number] | MovableDirection) => boolean;
}

/**
 * Cardinal directions for navigating through plot data points.
 */
export type MovableDirection = 'UPWARD' | 'DOWNWARD' | 'FORWARD' | 'BACKWARD';
