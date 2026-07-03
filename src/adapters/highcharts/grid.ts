/**
 * Multi-instance grid API: combines several separate Highcharts chart
 * instances (the Highcharts small-multiples / faceting pattern — one chart
 * per div) into a single MAIDR figure with subplot navigation.
 *
 * Each chart becomes one subplot cell. Since every chart renders into its own
 * container (whose id is embedded in every generated selector), highlighting
 * stays scoped per panel without extra work. Attach the resulting JSON as a
 * `maidr-data` attribute on a wrapper element enclosing all chart divs.
 *
 * @example
 * ```ts
 * import Highcharts from 'highcharts';
 * import { highchartsGridToMaidr } from 'maidr/highcharts';
 *
 * const east = Highcharts.chart('east', { title: { text: 'East' }, ... });
 * const west = Highcharts.chart('west', { title: { text: 'West' }, ... });
 *
 * const maidrData = highchartsGridToMaidr([east, west], { title: 'Sales by region' });
 * document.getElementById('wrapper').setAttribute('maidr-data', JSON.stringify(maidrData));
 * ```
 */

import type { Maidr, MaidrSubplot } from '../../type/grammar';
import type { HighchartsChart, HighchartsGridOptions } from './types';
import { buildSubplotGrid, collectUsableSeries } from './adapter';
import { ensureContainerId } from './selectors';

let gridCounter = 0;

/**
 * Converts multiple rendered Highcharts chart instances into one MAIDR figure
 * with a subplot grid (one subplot per chart).
 *
 * Input shapes:
 * - `Chart[][]` — maps 1:1 to the subplot grid, row-major (ragged rows OK).
 * - `Chart[]` — a single row, or chunked into rows via `options.layout`
 *   (`columns` = charts per row; `rows` derives columns when set alone).
 *
 * Panel naming: each chart's own title becomes its panel's display name
 * (written into the first layer's `title`); the figure title comes from
 * `options.title`. Charts with no convertible series are skipped (with a
 * warning) and their row compacted, because MAIDR crashes on empty subplots.
 * A member chart that itself contains multiple panes (stacked `yAxis` bands)
 * is expanded with the same pane detection as {@link highchartsToMaidr}: each
 * pane becomes its own cell, flattened into that chart's grid row.
 *
 * @param charts - Rendered chart instances in visual reading order (top-left first).
 * @param options - Optional figure metadata and flat-list layout.
 * @returns A {@link Maidr} object ready for use with the MAIDR library.
 * @throws When no chart in the grid produces any convertible series — the
 *         resulting figure would have no navigable data, and attaching it
 *         would crash MAIDR on focus.
 */
export function highchartsGridToMaidr(
  charts: HighchartsChart[] | HighchartsChart[][],
  options?: HighchartsGridOptions,
): Maidr {
  const chartGrid = toChartGrid(charts, options?.layout);

  let subplotIndex = 0;
  const subplots: MaidrSubplot[][] = [];
  for (const chartRow of chartGrid) {
    const row: MaidrSubplot[] = [];
    for (const chart of chartRow) {
      const containerId = ensureContainerId(chart);

      // Reuse the single-chart pane detection so a multi-pane member chart
      // (e.g. a Highstock price + volume chart) is never fused into one
      // subplot — cross-pane bar series would otherwise merge into a single
      // dodged/stacked layer mixing unrelated scales. The pane path already
      // drops empty-layer cells; the single-subplot path may still yield one.
      const paneSubplots = buildSubplotGrid(collectUsableSeries(chart), chart, containerId)
        .flat()
        .filter(subplot => subplot.layers.length > 0);

      if (paneSubplots.length === 0) {
        console.warn(
          `[MAIDR Highcharts] Grid chart "${containerId}" has no convertible series; skipping panel.`,
        );
        continue;
      }

      if (paneSubplots.length > 1) {
        console.warn(
          `[MAIDR Highcharts] Grid chart "${containerId}" contains ${paneSubplots.length} panes; `
          + `flattening them into adjacent cells of the same grid row.`,
        );
      }

      // The chart's own title is the panel's display name; MAIDR reads it
      // from the first layer's title (there is no subplot-title field). For a
      // multi-pane chart it names the first pane only — the remaining panes
      // keep their pane-level names (series name or y-axis title fallback).
      const paneTitle = chart.title?.textStr;
      if (paneTitle) {
        paneSubplots[0].layers[0].title = paneTitle;
      }

      for (const subplot of paneSubplots) {
        // Series indices restart at 0 in every chart, but MAIDR requires layer
        // ids to be unique across the WHOLE figure — prefix with the cell index.
        for (const layer of subplot.layers) {
          layer.id = `${subplotIndex}_${layer.id}`;
        }
        row.push(subplot);
        subplotIndex++;
      }
    }
    if (row.length > 0) {
      subplots.push(row);
    }
  }

  if (subplots.length === 0) {
    // Fail loudly at conversion time (where the developer can see it) instead
    // of emitting an empty-layers subplot whose JSON would crash MAIDR with an
    // uncaught TypeError inside Context construction on first focus.
    throw new Error(
      '[MAIDR Highcharts] highchartsGridToMaidr: no chart in the grid produced any convertible series.',
    );
  }

  return {
    id: options?.id ?? `highcharts-grid-${gridCounter++}`,
    title: options?.title ?? '',
    subtitle: options?.subtitle,
    caption: options?.caption,
    subplots,
  };
}

/**
 * Normalizes the accepted chart input shapes into a row-major 2D grid.
 */
function toChartGrid(
  charts: HighchartsChart[] | HighchartsChart[][],
  layout?: HighchartsGridOptions['layout'],
): HighchartsChart[][] {
  if (charts.length === 0) {
    throw new Error('[MAIDR Highcharts] highchartsGridToMaidr requires at least one chart.');
  }

  // 2D input maps 1:1; drop empty rows (the model crashes on them).
  if (Array.isArray(charts[0])) {
    const grid = (charts as HighchartsChart[][]).filter(row => row.length > 0);
    if (grid.length === 0) {
      throw new Error('[MAIDR Highcharts] highchartsGridToMaidr requires at least one chart.');
    }
    return grid;
  }

  const flat = charts as HighchartsChart[];
  const columns = resolveColumns(flat.length, layout);
  const grid: HighchartsChart[][] = [];
  for (let i = 0; i < flat.length; i += columns) {
    grid.push(flat.slice(i, i + columns));
  }
  return grid;
}

function resolveColumns(
  count: number,
  layout?: HighchartsGridOptions['layout'],
): number {
  if (layout?.columns && layout.columns >= 1) {
    return Math.floor(layout.columns);
  }
  if (layout?.rows && layout.rows >= 1) {
    return Math.ceil(count / Math.min(Math.floor(layout.rows), count));
  }
  return count; // Single row by default.
}
