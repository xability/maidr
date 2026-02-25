/**
 * Highcharts adapter for MAIDR.
 *
 * Provides utilities to convert Highcharts chart instances into MAIDR-compatible
 * data structures for accessible, non-visual chart interaction.
 *
 * @packageDocumentation
 */

export { highchartsToMaidr } from './adapter';
export type { HighchartsAdapterOptions } from './adapter';
export { createHighchartsSync } from './sync';
export type { HighchartsSync } from './sync';
export type {
  HighchartsAxis,
  HighchartsChart,
  HighchartsPoint,
  HighchartsSeries,
} from './types';
