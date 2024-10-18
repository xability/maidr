export type PlotState = {
  empty: boolean;
  audio: AudioState;
  braille: BrailleState;
  text: TextState;
};

export type AudioState = {
  min: number;
  max: number;
  size: number;
  value: number;
  index: number;
  count?: number;
  volume?: number;
  left_extreme?: boolean;
  right_extreme?: boolean;
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
  fillValue?: number;
  section?: string;
  min?: number;
  max?: number;
};
