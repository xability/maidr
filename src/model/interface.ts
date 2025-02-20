import type { PlotState } from './state';

export interface Observer {
  update: (state: PlotState) => void;
}

export interface Observable {
  addObserver: (observer: Observer) => void;
  removeObserver: (observer: Observer) => void;

  notifyStateUpdate: () => void;
}

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

export enum EventType {
  CLICK = 'click',
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS_IN = 'focusin',
  FOCUS_OUT = 'focusout',
  KEY_DOWN = 'keydown',
  SELECTION_CHANGE = 'selectionchange',
}
