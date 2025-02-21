import type { PlotState } from '@type/state';

export interface Observer {
  update: (state: PlotState) => void;
}

export interface Observable {
  addObserver: (observer: Observer) => void;
  removeObserver: (observer: Observer) => void;

  notifyStateUpdate: () => void;
}
