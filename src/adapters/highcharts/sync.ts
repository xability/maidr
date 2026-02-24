/**
 * Visual synchronization between MAIDR navigation and Highcharts.
 *
 * When MAIDR's keyboard navigation moves to a new data point, the
 * corresponding Highcharts point is highlighted and its tooltip is shown.
 * This provides bidirectional visual feedback: the sonification and text
 * descriptions from MAIDR are reinforced by the visual cue in the chart.
 *
 * @example
 * ```ts
 * import Highcharts from 'highcharts';
 * import { highchartsToMaidr, createHighchartsSync } from 'maidr/highcharts';
 *
 * const chart = Highcharts.chart('container', { ... });
 * const maidrData = highchartsToMaidr(chart);
 * const sync = createHighchartsSync(chart);
 *
 * // Attach to a MutationObserver or MAIDR's navigation events.
 * // When MAIDR navigates to point index `i`, call:
 * sync.highlightPoint(0, i);
 *
 * // Clean up when done:
 * sync.dispose();
 * ```
 */

import type { HighchartsChart, HighchartsPoint } from './types';

/**
 * Manages visual synchronization between MAIDR and a Highcharts chart.
 */
export interface HighchartsSync {
  /**
   * Highlights a specific point in the chart by setting its hover state
   * and refreshing the tooltip.
   *
   * @param seriesIndex - Index of the series within the chart.
   * @param pointIndex - Index of the point within the series.
   */
  highlightPoint: (seriesIndex: number, pointIndex: number) => void;

  /**
   * Clears all active highlights and hides the tooltip.
   */
  clearHighlight: () => void;

  /**
   * Cleans up listeners and resets chart state.
   */
  dispose: () => void;
}

/**
 * Creates a {@link HighchartsSync} instance for the given chart.
 *
 * @param chart - A rendered Highcharts chart instance.
 * @returns A sync controller with `highlightPoint`, `clearHighlight`, and `dispose` methods.
 */
export function createHighchartsSync(chart: HighchartsChart): HighchartsSync {
  let activePoint: HighchartsPoint | null = null;

  function highlightPoint(seriesIndex: number, pointIndex: number): void {
    const series = chart.series[seriesIndex];
    if (!series)
      return;

    const point = series.data[pointIndex];
    if (!point)
      return;

    // Clear previous highlight.
    if (activePoint && activePoint !== point) {
      activePoint.setState?.('');
    }

    // Highlight the new point.
    point.setState?.('hover');
    chart.tooltip?.refresh(point);
    activePoint = point;
  }

  function clearHighlight(): void {
    if (activePoint) {
      activePoint.setState?.('');
      activePoint = null;
    }
    chart.tooltip?.hide();
  }

  function dispose(): void {
    clearHighlight();
  }

  return { highlightPoint, clearHighlight, dispose };
}
