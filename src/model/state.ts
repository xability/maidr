import {MovableDirection} from '../core/interface';

export type PlotState =
  | EmptyState
  | {
      empty: false;
      audio: AudioState;
      braille: BrailleState;
      text: TextState;
      autoplay: AutoplayState;
    };

export type EmptyState = {
  empty: true;
};

export type AudioState = {
  min: number;
  max: number;
  size: number;
  value: number | number[];
  index: number;
  count?: number;
  volume?: number;
};

export type BrailleState = {
  values: string[][];
  row: number;
  col: number;
};

export type TextState = {
  mainLabel: string;
  mainValue: number | string;
  crossLabel: string;
  crossValue: number | number[] | string;
  fillLabel?: string;
  fillValue?: string;
  section?: string;
  min?: number;
  max?: number;
};

export type AutoplayState = {
  [key in MovableDirection]: number;
};
