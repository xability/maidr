import {PlotState} from "../model/state";

export interface Observer {
  update(state: PlotState): void;
}

export interface Subject {
  addObserver(observer: Observer): void;
  removeObserver(observer: Observer): void;
  notifyObservers(): void;
}
