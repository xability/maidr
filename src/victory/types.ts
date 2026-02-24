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
export type VictoryComponentType =
  | 'VictoryBar'
  | 'VictoryLine'
  | 'VictoryScatter'
  | 'VictoryArea'
  | 'VictoryPie';

/**
 * Intermediate representation of a Victory data layer before conversion
 * to the MAIDR schema.
 */
export interface VictoryLayerInfo {
  /** Index-based layer ID. */
  id: string;
  /** The Victory component type that produced this layer. */
  victoryType: VictoryComponentType;
  /** Extracted data points from the Victory component. */
  data: unknown;
  /** X-axis label (from VictoryAxis or fallback). */
  xAxisLabel?: string;
  /** Y-axis label (from VictoryAxis or fallback). */
  yAxisLabel?: string;
  /** Number of data elements expected in the DOM (used for selector validation). */
  dataCount: number;
}
