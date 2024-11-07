import {PlotState} from '../model/state';

export interface Observer {
  update(state: PlotState): void;
}

export interface Observable {
  addObserver(observer: Observer): void;
  removeObserver(observer: Observer): void;

  notifyStateUpdate(): void;
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

export interface Plot extends Movable, Observable {
  id: string;
  type: string;

  title: string;
  subtitle: string;
  caption: string;

  xAxis: string;
  yAxis: string;

  get state(): PlotState;
}
