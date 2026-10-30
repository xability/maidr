import type { HighchartsAxis } from '@adapters/highcharts/types';
import type { MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { categoryPoints, fakeAxis, fakeChart, fakeSeries } from './helpers';

/**
 * An axis the chart drew without a title was named "X" (or "Y"), so every
 * move said "X is Jan", label mode said "X label is X", and the description
 * listed "X axis: X" for an axis whose name the chart never gave. An axis the
 * chart hides kept the "Values" Highcharts gives every y axis by default,
 * though it is drawn nowhere. MAIDR says such a label is not available when
 * the layer leaves it out, which is what the chart tells a sighted reader.
 */

const MONTHS = ['Jan', 'Feb', 'Mar'];

/**
 * The layer of a one-series column chart.
 *
 * @param xAxis - The category axis
 * @param yAxis - The value axis
 * @param inverted - Whether the chart is drawn on its side
 * @returns The layer
 */
function columnLayer(xAxis: HighchartsAxis, yAxis: HighchartsAxis, inverted = false): MaidrLayer {
  const chart = fakeChart({
    type: 'column',
    inverted,
    series: [fakeSeries({ index: 0, xAxis, yAxis, data: categoryPoints([49.9, 71.5, 106.4], MONTHS) })],
  });
  return highchartsToMaidr(chart).subplots[0][0].layers[0];
}

describe('highcharts axis labels', () => {
  it('leaves an axis the chart draws untitled unlabelled', () => {
    const layer = columnLayer(
      fakeAxis({ categories: MONTHS }),
      fakeAxis({ options: { title: { text: 'Rainfall (mm)' } } }),
    );

    expect(layer.axes?.x).toEqual({});
    expect(layer.axes?.y).toEqual({ label: 'Rainfall (mm)' });
  });

  it('leaves the untitled category axis unlabelled on a chart drawn on its side', () => {
    // An inverted chart swaps the two titles onto the axes they name, so the
    // untitled category axis is the layer's y.
    const layer = columnLayer(
      fakeAxis({ categories: MONTHS }),
      fakeAxis({ options: { title: { text: 'Rainfall (mm)' } } }),
      true,
    );

    expect(layer.axes?.x).toEqual({ label: 'Rainfall (mm)' });
    expect(layer.axes?.y).toEqual({});
  });

  it('leaves out the title of an axis the chart hides', () => {
    // Highcharts fills in "Values" on every y axis it is not given a title
    // for, hidden or not.
    const layer = columnLayer(
      fakeAxis({ categories: MONTHS, options: { visible: false } }),
      fakeAxis({ options: { visible: false, title: { text: 'Values' } } }),
    );

    expect(layer.axes).toEqual({ x: {}, y: {} });
  });

  it('leaves out a title the chart removed', () => {
    // `title: { text: null }` is how Highcharts is told to draw none.
    const removed = { text: null as unknown as string };
    const layer = columnLayer(
      fakeAxis({ categories: MONTHS }),
      fakeAxis({ options: { title: removed } }),
    );

    expect(layer.axes?.y).toEqual({});
  });
});
