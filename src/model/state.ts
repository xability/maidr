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
  value: number;
  index: number;
  count?: number;
  volume?: number;
};

export type BrailleState = {
  index: number;
  values: string[];
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
