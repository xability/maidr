import type {
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  HistogramPoint,
  LinePoint,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type { ReactNode } from 'react';

/**
 * Row-major grid layout for multi-panel figures (two or more top-level
 * `<VictoryChart>` children). When omitted, panels form a single row in
 * children order.
 */
export interface VictoryPanelLayout {
  /**
   * Number of grid rows. Used to derive the panels-per-row count when
   * `columns` is omitted.
   */
  rows?: number;
  /** Number of panels per row. Takes precedence over `rows`. */
  columns?: number;
}

/**
 * Configuration accepted by both the {@link MaidrVictory} wrapper component
 * and the `useVictoryAdapter` hook.
 */
export interface VictoryAdapterConfig {
  /** Unique identifier for the chart. Used for DOM element IDs. */
  id: string;
  /** Chart title displayed in text descriptions. */
  title?: string;
  /** Chart subtitle. */
  subtitle?: string;
  /** Chart caption. */
  caption?: string;
  /** Victory chart components to make accessible. */
  children: ReactNode;
  /**
   * Grid layout for multi-panel figures. Only consulted when `children`
   * contains two or more top-level `<VictoryChart>` components; single-chart
   * figures are unaffected.
   */
  layout?: VictoryPanelLayout;
}

/**
 * Props for the MaidrVictory component (identical to {@link VictoryAdapterConfig}).
 */
export type MaidrVictoryProps = VictoryAdapterConfig;

/**
 * Victory chart component types that MAIDR can extract data from.
 *
 * VictoryStack is a container component (handled separately from the
 * individual data components) that maps to a stacked bar chart.
 */
export type VictoryComponentType
  = | 'VictoryBar'
    | 'VictoryLine'
    | 'VictoryScatter'
    | 'VictoryBoxPlot'
    | 'VictoryCandlestick'
    | 'VictoryHistogram'
    | 'VictoryStack';

/**
 * Discriminated union of all supported layer data shapes.
 *
 * Using a discriminated union instead of `unknown` ensures that each
 * layer's data is validated at extraction time and carries the correct
 * type through to the MAIDR schema conversion.
 */
export type VictoryLayerData
  = | { kind: 'bar'; points: BarPoint[] }
    | { kind: 'line'; points: LinePoint[][] }
    | { kind: 'scatter'; points: ScatterPoint[] }
    | { kind: 'box'; points: BoxPoint[] }
    | { kind: 'candlestick'; points: CandlestickPoint[] }
    | { kind: 'histogram'; points: HistogramPoint[] }
    | { kind: 'segmented'; points: SegmentedPoint[][] };

/**
 * Intermediate representation of a Victory data layer before conversion
 * to the MAIDR schema.
 */
export interface VictoryLayerInfo {
  /** Index-based layer ID. */
  id: string;
  /** The Victory component type that produced this layer. */
  victoryType: VictoryComponentType;
  /** Extracted and validated data points from the Victory component. */
  data: VictoryLayerData;
  /** X-axis label (from VictoryAxis or fallback). */
  xAxisLabel?: string;
  /** Y-axis label (from VictoryAxis or fallback). */
  yAxisLabel?: string;
  /** Number of data elements expected in the DOM (used for selector validation). */
  dataCount: number;
  /** Legend labels for multi-series segmented charts. */
  legend?: string[];
}

/**
 * Intermediate representation of one subplot panel (one top-level
 * `<VictoryChart>` in multi-panel mode) before conversion to the MAIDR
 * schema.
 */
export interface VictorySubplotInfo {
  /** Extracted data layers belonging to this panel. */
  layers: VictoryLayerInfo[];
  /**
   * Panel display name, read from the `<VictoryChart title="...">` prop.
   * Emitted as the first layer's title, which MAIDR uses as the panel name
   * in subplot summaries.
   */
  title?: string;
}
