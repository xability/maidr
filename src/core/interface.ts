import {PlotState} from '../model/state';

export interface Observer {
  update(state: PlotState): void;
}

export interface Observable {
  addObserver(observer: Observer): void;

  removeObserver(observer: Observer): void;

  notifyObservers(): void;
}

export interface Movable {
  moveUp(): void;

  moveDown(): void;

  moveLeft(): void;

  moveRight(): void;

  moveToIndex(index: number): void;

  isMovable(index: number): boolean;

  isMovable(direction: MovableDirection): boolean;
}

export enum MovableDirection {
  UPWARD = 'up',
  DOWNWARD = 'down',
  FORWARD = 'right',
  BACKWARD = 'left',
}
