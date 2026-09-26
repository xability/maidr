/**
 * MUI X Charts adapter for MAIDR.
 *
 * Provides the `<MaidrMuiCharts>` wrapper component and a
 * `useMuiChartsAdapter` hook that read an MUI X chart's `series`, `xAxis`,
 * `yAxis` and `dataset` props and convert them into MAIDR's accessible format
 * for audio sonification, text descriptions, braille output, and keyboard
 * navigation.
 *
 * @packageDocumentation
 */

export { convertMuiChart, convertMuiChartsToMaidr, findMuiChartElement, muiSeriesId } from './converters';
export type { MuiChartElement, MuiConvertedChart } from './converters';
export { MaidrMuiCharts } from './MaidrMuiCharts';
export type {
  MaidrMuiChartsProps,
  MuiAxisConfig,
  MuiChartKind,
  MuiChartProps,
  MuiChartsAdapterConfig,
  MuiSeriesConfig,
} from './types';
export { detectMuiChartKind, useMuiChartsAdapter } from './useMuiChartsAdapter';
