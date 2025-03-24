import type { MovableDirection } from '@type/movable';

export type PlotState = FigureState | SubplotState | TraceState;

export interface EmptyState {
  empty: true;
  type: string;
}

export type FigureState =
  | EmptyState
  | {
    empty: false;
    type: 'figure';
    title: string;
    subtitle: string;
    caption: string;
    size: number;
    index: number;
    subplot: SubplotState;
    traceTypes: string[];
  };

export type SubplotState =
  | EmptyState
  | {
    empty: false;
    type: 'subplot';
    size: number;
    index: number;
    trace: TraceState;
    traceType: string;
    isCombinedAudio: boolean;
  };

export type TraceState =
  | EmptyState
  | {
    empty: false;
    type: 'trace';
    traceType: string;
    title: string;
    xAxis: string;
    yAxis: string;
    fill: string;
    isCombinedAudio: boolean;
    audio: AudioState;
    braille: BrailleState;
    text: TextState;
    autoplay: AutoplayState;
  };

export interface AudioState {
  min: number;
  max: number;
  size: number;
  value: number | number[];
  index: number;
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
  main: { label: string; value: number | number[] | string };
  cross: { label: string; value: number | number[] | string };
  fill?: { label: string; value: string };
  range?: { min: number; max: number };
  section?: string;
}

export type AutoplayState = {
  [key in MovableDirection]: number;
};

export type HighlightState =
  | EmptyState
  | object;
