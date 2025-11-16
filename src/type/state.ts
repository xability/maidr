import type { BoxPoint, CandlestickTrend, TraceType } from '@type/grammar';
import type { MovableDirection } from './movable';

export type PlotState = FigureState | SubplotState | TraceState;

export type FigureState
  = | {
    empty: true;
    type: 'figure';
    warning?: boolean;
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
    highlight: HighlightState; // Figure manages subplot highlighting
  };

export type SubplotState
  = | {
    empty: true;
    type: 'subplot';
    warning?: boolean;
  }
  | {
    empty: false;
    type: 'subplot';
    size: number;
    index: number;
    trace: TraceState;
    highlight: HighlightState;
  };

interface TraceEmptyState {
  empty: true;
  type: 'trace';
  traceType: TraceType;
  audio: AudioEmptyState;
  warning?: boolean;
}

export type TraceState
  = | TraceEmptyState
  | {
    empty: false;
    type: 'trace';
    traceType: TraceType;
    plotType: string;
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
    /**
     * Array of audio states for all lines that intersect at the current point.
     * Used for intersection-aware audio playback in multiline plots.
     * null/undefined for normal points (single line or no intersection).
     */
    intersections?: AudioState[] | null;
    /**
     * Number of groups/series in the plot.
     * Only present for multiline plots where plotType === 'multiline'.
     */
    groupCount?: number;
  };

export type NonEmptyTraceState = Extract<TraceState, { empty: false }>;

export interface LayerSwitchTraceState extends NonEmptyTraceState {
  isLayerSwitch: true;
  index: number;
  size: number;
}

export function isLayerSwitchTraceState(state: TraceState): state is LayerSwitchTraceState {
  return (
    !state.empty
    && (state as Partial<LayerSwitchTraceState>).isLayerSwitch === true
    && typeof (state as Partial<LayerSwitchTraceState>).index === 'number'
    && typeof (state as Partial<LayerSwitchTraceState>).size === 'number'
  );
}

export interface AudioEmptyState {
  index: number;
  size: number;
  groupIndex?: number;
}

export interface AudioState {
  min: number;
  max: number;
  size: number;
  value: number | number[];
  index: number | number[];
  /**
   * Indicates whether the audio is continuous.
   * If true, the audio plays without interruption.
   * If false or undefined, the audio may have discrete segments.
   */
  isContinuous?: boolean;
  /**
   * Group index for multiclass plots.
   * Used to determine which audio palette entry to use.
   * If undefined, defaults to 0 (single group).
   */
  groupIndex?: number;
  /**
   * Candlestick trend information for audio palette selection.
   * Used by AudioService to determine appropriate audio characteristics.
   * Only applicable for candlestick traces.
   */
  trend?: CandlestickTrend;
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
  custom?: string[];
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
  = | {
    empty: true;
    type: 'trace';
    traceType?: TraceType;
    audio: AudioEmptyState;
  }
  | {
    empty: false;
    elements: SVGElement | SVGElement[];
  };
