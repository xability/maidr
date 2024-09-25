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

export type BrailleState = {
  index: number;
  braille: string[];
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
