import type { OverlayRect } from './overlay';
import type { ChartJsChart } from './types';

/**
 * Where one panel of a chart laid out as axis-stacked panels is drawn: the
 * band of the plot area its datasets' value scale is laid out in.
 *
 * A chart of stacked panels is one canvas, so nothing in the page marks a
 * panel; MAIDR names the panel the lobby is on by its layers, and this finds
 * where they are drawn.
 *
 * @param chart - The chart, laid out
 * @param datasetIndices - The datasets drawn in the panel
 * @returns The panel, in canvas CSS pixels, or null when none of the
 *   datasets' scales is laid out
 */
export function panelRect(chart: ChartJsChart, datasetIndices: readonly number[]): OverlayRect | null {
  const area = chart.chartArea;
  if (area === undefined) {
    return null;
  }
  for (const index of datasetIndices) {
    const id = chart.getDatasetMeta(index)?.vScale?.id;
    const scale = id === undefined ? undefined : chart.scales?.[id];
    if (scale === undefined) {
      continue;
    }
    // A panel stacked along x is a column of the plot area; along y, a row.
    const across = scale.axis === 'x';
    const left = across ? scale.left : area.left;
    const right = across ? scale.right : area.right;
    const top = across ? area.top : scale.top;
    const bottom = across ? area.bottom : scale.bottom;
    if (right > left && bottom > top) {
      return { kind: 'rect', left, top, width: right - left, height: bottom - top };
    }
  }
  return null;
}
