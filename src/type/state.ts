import type { MovableDirection } from '@type/movable';

export type PlotState =
  | EmptyState
  | {
    empty: false;
    audio: AudioState;
    braille: BrailleState;
    text: TextState;
    autoplay: AutoplayState;
  };

export interface EmptyState {
  empty: true;
}

export interface AudioState {
  min: number;
  max: number;
  size: number;
  value: number | number[];
  index: number;
  count?: number;
  volume?: number;
}

export type BrailleState =
  | EmptyState
  | {
    empty: false;
    values: string[][];
    row: number;
    col: number;
  };

export interface TextState {
  mainLabel: string;
  mainValue: number | string;
  crossLabel: string;
  crossValue: number | number[] | string;
  fillLabel?: string;
  fillValue?: string;
  section?: string;
  min?: number;
  max?: number;
}

export type AutoplayState = {
  [key in MovableDirection]: number;
};
