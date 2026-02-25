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
 * Props for the MaidrVictory component.
 */
export interface MaidrVictoryProps {
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
}

/**
 * Victory chart component types that MAIDR can extract data from.
 */
export type VictoryComponentType
  = | 'VictoryBar'
    | 'VictoryLine'
    | 'VictoryScatter'
    | 'VictoryArea'
    | 'VictoryPie'
    | 'VictoryBoxPlot'
    | 'VictoryCandlestick'
    | 'VictoryHistogram'
    | 'VictoryGroup'
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
