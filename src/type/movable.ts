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
