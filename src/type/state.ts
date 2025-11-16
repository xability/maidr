import type { BoxPoint, CandlestickTrend, TraceType } from '@type/grammar';
import type { MovableDirection } from './movable';

/**
 * Union type representing state at any level of the plot hierarchy.
 */
export type PlotState = FigureState | SubplotState | TraceState;

/**
 * State for the top-level figure containing metadata and current subplot state.
 */
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

/**
 * State for a subplot containing its index, size, and current trace state.
 */
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

/**
 * Empty trace state used as a placeholder when no data is available.
 */
interface TraceEmptyState {
  empty: true;
  type: 'trace';
  traceType: TraceType;
  audio: AudioEmptyState;
  warning?: boolean;
}

/**
 * State for a single trace/layer containing all rendering and navigation information.
 */
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

/**
 * Type narrowing for non-empty trace states with full data.
 */
export type NonEmptyTraceState = Extract<TraceState, { empty: false }>;

/**
 * Extended trace state for layer switching mode with navigation indices.
 */
export interface LayerSwitchTraceState extends NonEmptyTraceState {
  isLayerSwitch: true;
  index: number;
  size: number;
}

/**
 * Type guard to check if a trace state is in layer switch mode.
 */
export function isLayerSwitchTraceState(state: TraceState): state is LayerSwitchTraceState {
  return (
    !state.empty
    && (state as Partial<LayerSwitchTraceState>).isLayerSwitch === true
    && typeof (state as Partial<LayerSwitchTraceState>).index === 'number'
    && typeof (state as Partial<LayerSwitchTraceState>).size === 'number'
  );
}

/**
 * Minimal audio state for empty traces containing only navigation indices.
 */
export interface AudioEmptyState {
  y: number;
  x: number;
  rows: number;
  cols: number;
}

/**
 * Audio state containing frequency mapping and current value for sonification.
 */
export interface AudioState {
  freq: {
    min: number;
    max: number;
    raw: number | number[];
  };
  panning: {
    y: number;
    x: number;
    rows: number;
    cols: number;
  };
  /**
   * Group index for multiclass plots.
   * Used to determine which audio palette entry to use.
   * If undefined, defaults to 0 (single group).
   */
  group?: number;
  /**
   * Indicates whether the audio is continuous.
   * If true, the audio plays without interruption.
   * If false or undefined, the audio may have discrete segments.
   */
  isContinuous?: boolean;
  /**
   * Candlestick trend information for audio palette selection.
   * Used by AudioService to determine appropriate audio characteristics.
   * Only applicable for candlestick traces.
   */
  trend?: CandlestickTrend;
  /**
   * Volume multiplier for dynamic volume control.
   * Used to scale audio volume based on data characteristics (e.g., violin plot width).
   * If undefined, defaults to 1.0 (no volume scaling).
   * Range should typically be between 0.0 and 1.0, but can exceed 1.0 for emphasis.
   */
  volumeMultiplier?: number;
  /**
   * Volume scale for dynamic volume control (0-1 range).
   * Used to scale audio volume based on density values (e.g., violin plot density).
   * If undefined, defaults to 1.0 (no volume scaling).
   * Range is 0.0 to 1.0, where 0.0 = quietest and 1.0 = loudest.
   */
  volumeScale?: number;
}

/**
 * Union type for all braille display states across different plot types.
 */
export type BrailleState
  = | TraceEmptyState
  | BarBrailleState
  | BoxBrailleState
  | HeatmapBrailleState
  | LineBrailleState;

/**
 * Base braille state with common properties for all plot types.
 */
interface BaseBrailleState {
  id: string;
  empty: false;
  row: number;
  col: number;
  custom?: string[];
}

/**
 * Braille state for bar charts with grouped values and min/max per group.
 */
export interface BarBrailleState extends BaseBrailleState {
  values: number[][];
  min: number[];
  max: number[];
}

/**
 * Braille state for boxplots with quartile information.
 */
export interface BoxBrailleState extends BaseBrailleState {
  values: BoxPoint[];
  min: number;
  max: number;
}

/**
 * Braille state for candlestick charts with OHLC values.
 */
export interface CandlestickBrailleState extends BaseBrailleState {
  values: number[][];
  min: number;
  max: number;
}

/**
 * Braille state for line charts with multi-series values.
 */
export interface LineBrailleState extends BaseBrailleState {
  values: number[][];
  min: number[];
  max: number[];
}

/**
 * Braille state for heatmaps with 2D grid values.
 */
export interface HeatmapBrailleState extends BaseBrailleState {
  values: number[][];
  min: number;
  max: number;
}

/**
 * Text description state containing labels and values for screen reader output.
 */
export interface TextState {
  main: { label: string; value: number | number[] | string };
  cross: { label: string; value: number | number[] | string };
  fill?: { label: string; value: string };
  range?: { min: number; max: number };
  section?: string;
}

/**
 * Autoplay state mapping directions to point counts for continuous playback.
 */
export type AutoplayState = {
  [key in MovableDirection]: number;
};

/**
 * Highlight state for visual emphasis of current plot elements.
 */
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
