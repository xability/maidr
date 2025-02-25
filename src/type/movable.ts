export interface Movable {
  moveOnce: (direction: MovableDirection) => void;
  moveToExtreme: (direction: MovableDirection) => void;
  moveToIndex: (index: number) => void;

  isMovable: ((index: number) => boolean) & ((direction: MovableDirection) => boolean);
}

export enum MovableDirection {
  UPWARD = 'UPWARD',
  DOWNWARD = 'DOWNWARD',
  FORWARD = 'FORWARD',
  BACKWARD = 'BACKWARD',
}
