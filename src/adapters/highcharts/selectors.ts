/**
 * CSS selector generation for Highcharts SVG elements.
 *
 * Highcharts renders charts as SVG inside a `.highcharts-container` div.
 * Each series gets a group element with predictable class names, and individual
 * data points are rendered as child elements (`rect`, `path`, etc.) with the
 * class `highcharts-point`.
 *
 * These selectors are scoped to the chart's render target to support pages
 * with multiple Highcharts charts.
 */

import type { HighchartsChart } from './types';

let selectorCounter = 0;

/**
 * Ensures the chart's render target has an `id` attribute so CSS selectors
 * can be scoped to this specific chart.
 *
 * @returns The element's `id` value (existing or newly assigned).
 */
export function ensureContainerId(chart: HighchartsChart): string {
  const target = chart.renderTo;
  if (!target.id) {
    target.id = `maidr-hc-${selectorCounter++}`;
  }
  return target.id;
}

/**
 * Generates a CSS selector for all point elements in a bar/column series.
 *
 * Highcharts renders bar/column points as `rect.highcharts-point` inside the
 * series group. The elements appear in data order.
 */
export function barSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-${seriesIndex} rect.highcharts-point`;
}

/**
 * Generates CSS selectors for line chart series.
 *
 * For line charts, MAIDR expects one selector per line (the `<path>` element),
 * not individual point selectors. MAIDR's `LineTrace` parses the path's `d`
 * attribute to extract point coordinates and creates circle highlight elements.
 */
export function lineSelectors(containerId: string, seriesIndices: number[]): string[] {
  return seriesIndices.map(
    i => `#${containerId} .highcharts-series-${i} path.highcharts-graph`,
  );
}

/**
 * Generates a CSS selector for all point elements in a scatter series.
 *
 * Scatter points are rendered as `path.highcharts-point` (marker shapes).
 */
export function scatterSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-${seriesIndex} path.highcharts-point`;
}

/**
 * Generates a CSS selector for heatmap cell elements.
 *
 * Heatmap cells are rendered as `rect.highcharts-point` inside the series group.
 */
export function heatmapSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-${seriesIndex} rect.highcharts-point`;
}

/**
 * Generates a CSS selector for histogram bar elements.
 *
 * Histogram bins are rendered as `rect.highcharts-point`, same as bar/column.
 */
export function histogramSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-${seriesIndex} rect.highcharts-point`;
}
