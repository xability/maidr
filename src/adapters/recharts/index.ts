/**
 * Recharts adapter for MAIDR.
 *
 * Provides utilities to convert Recharts chart data and SVG structure
 * into MAIDR's accessible format for audio sonification, text descriptions,
 * braille output, and keyboard navigation.
 *
 * @packageDocumentation
 */

export { convertRechartsToMaidr, normalizeRechartsSubplotGrid } from './converters';
export { MaidrRecharts } from './MaidrRecharts';
export { getPanelClassName, getRechartsSelector } from './selectors';
export type {
  ErrorIntervalConfig,
  FlowLinkConfig,
  ForestPlotConfig,
  HistogramBinConfig,
  MaidrRechartsProps,
  RechartsAdapterConfig,
  RechartsChartType,
  RechartsLayerConfig,
  RechartsSubplotConfig,
  SurvivalCurveConfig,
  VolcanoPointConfig,
} from './types';
export { useRechartsAdapter } from './useRechartsAdapter';
