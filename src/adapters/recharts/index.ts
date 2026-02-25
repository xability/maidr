/**
 * Recharts adapter for MAIDR.
 *
 * Provides utilities to convert Recharts chart data and SVG structure
 * into MAIDR's accessible format for audio sonification, text descriptions,
 * braille output, and keyboard navigation.
 *
 * @packageDocumentation
 */

export { convertRechartsToMaidr } from './converters';
export { MaidrRecharts } from './MaidrRecharts';
export { getRechartsSelector } from './selectors';
export type {
  HistogramBinConfig,
  MaidrRechartsProps,
  RechartsAdapterConfig,
  RechartsChartType,
  RechartsLayerConfig,
} from './types';
export { useRechartsAdapter } from './useRechartsAdapter';
