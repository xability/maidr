export type PlotState = DisplayState & AudioState;

export type DisplayState = {
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

export type BrailleState = {
  value: number;
  index: number;
  brailleArray?: string[];
};

export type AudioState = {
  min: number;
  max: number;
  size: number;
  count?: number;
  volume?: number;
} & BrailleState;
