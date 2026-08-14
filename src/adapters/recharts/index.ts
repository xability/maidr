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
  BoxenLadderConfig,
  ErrorIntervalConfig,
  FlowLinkConfig,
  ForestPlotConfig,
  GanttChartConfig,
  GaugeDialConfig,
  HexbinLatticeConfig,
  HistogramBinConfig,
  MaidrRechartsProps,
  ParallelAxesConfig,
  RechartsAdapterConfig,
  RechartsChartType,
  RechartsLayerConfig,
  RechartsSubplotConfig,
  RidgelineCurveConfig,
  SurvivalCurveConfig,
  VolcanoPointConfig,
  WaterfallStepConfig,
} from './types';
export { useRechartsAdapter } from './useRechartsAdapter';
