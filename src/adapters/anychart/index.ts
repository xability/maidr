/**
 * AnyChart adapter for MAIDR.
 *
 * Provides utilities to convert AnyChart chart instances into MAIDR's
 * accessible format for audio sonification, text descriptions, braille
 * output, and keyboard navigation.
 *
 * @packageDocumentation
 */

export {
  anyChartsToMaidr,
  anyChartToMaidr,
  bindAnyChart,
  bindAnyCharts,
} from './converters';
export type {
  AnyChartBinderOptions,
  AnyChartGridInput,
  AnyChartInstance,
  AnyChartsBinderOptions,
  AnyChartsLayout,
} from './types';
