export interface Movable {
  moveOnce: (direction: MovableDirection) => void;
  moveToExtreme: (direction: MovableDirection) => void;
  moveToIndex: (index: number) => void;

  isMovable: (target: number | MovableDirection) => boolean;
  get position(): [number, number];
}

export type MovableDirection =
  | 'UPWARD'
  | 'DOWNWARD'
  | 'FORWARD'
  | 'BACKWARD';
