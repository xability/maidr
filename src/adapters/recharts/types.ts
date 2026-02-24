/**
 * Types for the Recharts adapter.
 *
 * Defines the configuration interfaces for converting Recharts data
 * and SVG structure into MAIDR's accessible format.
 */

import type { Orientation } from '@type/grammar';

/**
 * Recharts chart types supported by the adapter.
 */
export type RechartsChartType = 'bar' | 'line' | 'area' | 'scatter' | 'pie';

/**
 * A single data series/layer configuration for composed charts.
 * Use this when a chart has multiple series of different types.
 */
export interface RechartsLayerConfig {
  /** Key in the data array for this series' y-values. */
  yKey: string;
  /** Chart type for this series. */
  chartType: RechartsChartType;
  /** Display name for this series (used in legends/descriptions). */
  name?: string;
}

/**
 * Configuration for the Recharts-to-MAIDR adapter.
 *
 * Supports two configuration modes:
 * 1. **Simple mode** - Set `chartType` and `yKeys` for a single chart type
 *    with one or more data series.
 * 2. **Composed mode** - Set `layers` for mixed chart types (e.g., bar + line).
 *
 * @example Simple bar chart
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'sales-chart',
 *   title: 'Sales by Quarter',
 *   data: [{ quarter: 'Q1', revenue: 100 }, { quarter: 'Q2', revenue: 200 }],
 *   chartType: 'bar',
 *   xKey: 'quarter',
 *   yKeys: ['revenue'],
 *   xLabel: 'Quarter',
 *   yLabel: 'Revenue ($)',
 * };
 * ```
 *
 * @example Multi-series line chart
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'temp-chart',
 *   title: 'Temperature by City',
 *   data: [{ month: 1, nyc: 32, la: 58 }, { month: 2, nyc: 35, la: 60 }],
 *   chartType: 'line',
 *   xKey: 'month',
 *   yKeys: ['nyc', 'la'],
 *   xLabel: 'Month',
 *   yLabel: 'Temperature (F)',
 * };
 * ```
 *
 * @example Composed chart (bar + line)
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'mixed-chart',
 *   title: 'Revenue and Trend',
 *   data: [{ month: 'Jan', revenue: 100, trend: 95 }],
 *   xKey: 'month',
 *   layers: [
 *     { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
 *     { yKey: 'trend', chartType: 'line', name: 'Trend' },
 *   ],
 *   xLabel: 'Month',
 *   yLabel: 'Value',
 * };
 * ```
 */
export interface RechartsAdapterConfig {
  /** Unique identifier for the chart (used for DOM IDs). */
  id: string;

  /** Chart title displayed in text descriptions. */
  title?: string;

  /** Chart subtitle. */
  subtitle?: string;

  /** Chart caption. */
  caption?: string;

  /** Recharts data array. Each item is one data point with named fields. */
  data: Record<string, unknown>[];

  /**
   * Chart type for simple mode (single chart type with one or more series).
   * Mutually exclusive with `layers`.
   */
  chartType?: RechartsChartType;

  /** Key in data objects for x-axis values. */
  xKey: string;

  /**
   * Keys in data objects for y-axis values (simple mode).
   * Each key creates a separate data series.
   * Mutually exclusive with `layers`.
   */
  yKeys?: string[];

  /**
   * Layer configurations for composed charts (composed mode).
   * Each layer defines a chart type and data key.
   * Mutually exclusive with `chartType`/`yKeys`.
   */
  layers?: RechartsLayerConfig[];

  /** X-axis label. */
  xLabel?: string;

  /** Y-axis label. */
  yLabel?: string;

  /** Bar/box chart orientation. Defaults to vertical. */
  orientation?: Orientation;
}

/**
 * Props for the MaidrRecharts wrapper component.
 */
export interface MaidrRechartsProps extends RechartsAdapterConfig {
  /** Recharts chart component(s) to make accessible. */
  children: React.ReactNode;
}
