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

export type MovableDirection
  = | 'UPWARD'
    | 'DOWNWARD'
    | 'FORWARD'
    | 'BACKWARD';

export interface Coordinate {
  row: number;
  col: number;
}

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
