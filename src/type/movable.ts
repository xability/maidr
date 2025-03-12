export interface Movable {
  moveOnce: (direction: MovableDirection) => void;
  moveToExtreme: (direction: MovableDirection) => void;
  moveToIndex: (index: number) => void;

  isMovable: (target: number | MovableDirection) => boolean;
}

export type MovableDirection =
  | 'UPWARD'
  | 'DOWNWARD'
  | 'FORWARD'
  | 'BACKWARD';
