import type { BoxPoint, TraceType } from '@type/grammar';
import type { MovableDirection } from './movable';

export type PlotState = FigureState | SubplotState | TraceState;

export type FigureState
  = | {
    empty: true;
    type: 'figure';
  }
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

export type SubplotState
  = | {
    empty: true;
    type: 'subplot';
  }
  | {
    empty: false;
    type: 'subplot';
    size: number;
    index: number;
    trace: TraceState;
  };

interface TraceEmptyState {
  empty: true;
  type: 'trace';
  traceType: TraceType;
}

export type TraceState
  = | TraceEmptyState
    | {
      empty: false;
      type: 'trace';
      traceType: TraceType;
      title: string;
      xAxis: string;
      yAxis: string;
      fill: string;
      hasMultiPoints: boolean;
      audio: AudioState;
      braille: BrailleState;
      text: TextState;
      autoplay: AutoplayState;
      highlight: HighlightState;
    };

export interface AudioState {
  min: number;
  max: number;
  size: number;
  value: number | number[];
  index: number;
  group?: number;
  isContinuous?: boolean;
}

export type BrailleState
  = | TraceEmptyState
    | BarBrailleState
    | BoxBrailleState
    | HeatmapBrailleState
    | LineBrailleState;

interface BaseBrailleState {
  id: string;
  empty: false;
  row: number;
  col: number;
}

export interface BarBrailleState extends BaseBrailleState {
  values: number[][];
  min: number[];
  max: number[];
}

export interface BoxBrailleState extends BaseBrailleState {
  values: BoxPoint[];
  min: number;
  max: number;
}

export interface CandlestickBrailleState extends BaseBrailleState {
  values: number[][];
  min: number;
  max: number;
}

export interface LineBrailleState extends BaseBrailleState {
  values: number[][];
  min: number[];
  max: number[];
}

export interface HeatmapBrailleState extends BaseBrailleState {
  values: number[][];
  min: number;
  max: number;
}

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

export type HighlightState
  = | TraceEmptyState
    | {
      empty: false;
      elements: SVGElement | SVGElement[];
    };
