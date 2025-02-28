import type { Movable } from '@type/movable';
import type { Observable } from '@type/observable';
import type { PlotState } from '@type/state';

export enum PlotType {
  BAR = 'bar',
  BOX = 'box',
  DODGED = 'dodged_bar',
  HEATMAP = 'heat',
  HISTOGRAM = 'hist',
  LINE = 'line',
  NORMALIZED = 'stacked_normalized_bar',
  SCATTER = 'point',
  STACKED = 'stacked_bar',
}

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
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

  get hasMultiPoints(): boolean;
}
