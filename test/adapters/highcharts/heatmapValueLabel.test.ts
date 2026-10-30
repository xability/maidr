import type { HighchartsAxis, HighchartsPoint } from '@adapters/highcharts/types';
import type { MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/**
 * A Highcharts heatmap emitted no name for its cell values, so MAIDR fell back
 * to its generic "Level": "X is Mon, Values is Morning, Level is 1" on a chart
 * whose series is named "Activity" and whose tooltip says so for every cell.
 */

/** One heatmap point, as the adapter reads them. */
function cell(x: number, y: number, value: number): Partial<HighchartsPoint> {
  return { x, y, options: { value } } as Partial<HighchartsPoint>;
}

/**
 * The layer a 2x2 heatmap converts to.
 *
 * @param name - The series' name
 * @param colorAxis - The colour axis the cells are shaded by, if any
 * @returns The layer
 */
function heatmapLayer(name: string, colorAxis?: HighchartsAxis): MaidrLayer {
  const xAxis = fakeAxis({ categories: ['Mon', 'Tue'] });
  const yAxis = fakeAxis({ categories: ['Morning', 'Evening'] });
  const series = fakeSeries({
    index: 0,
    type: 'heatmap',
    name,
    xAxis,
    yAxis,
    data: [cell(0, 0, 1), cell(1, 0, 20), cell(0, 1, 30), cell(1, 1, 60)],
  });
  series.colorAxis = colorAxis;
  return highchartsToMaidr(fakeChart({ type: 'heatmap', series: [series] })).subplots[0][0].layers[0];
}

describe('the values of a highcharts heatmap', () => {
  it('are named after the series, as the tooltip names them', () => {
    expect(heatmapLayer('Activity').axes?.z).toEqual({ label: 'Activity' });
  });

  it('are named after the colour axis when the chart titles it', () => {
    const colorAxis = fakeAxis({ options: { title: { text: 'Minutes active' } } });

    expect(heatmapLayer('Activity', colorAxis).axes?.z).toEqual({ label: 'Minutes active' });
  });

  it('fall back to the series name when the colour axis is untitled', () => {
    // Highcharts gives a colour axis no title text by default.
    const colorAxis = fakeAxis({ options: { title: {} } });

    expect(heatmapLayer('Activity', colorAxis).axes?.z).toEqual({ label: 'Activity' });
  });

  it('are left unnamed when neither names them', () => {
    expect(heatmapLayer('').axes?.z).toBeUndefined();
  });
});
