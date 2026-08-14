import type { LinePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/** Highcharts draws the per-variable names as the x axis' categories. */
const VARIABLES = ['Miles per gallon', 'Horsepower', 'Weight'];

/**
 * One `line` series per observation, all bound to the same axis pair — which
 * is what `onSeriesBindAxes` does in parallel coordinates mode.
 */
function carsChart(): ReturnType<typeof fakeChart> {
  const xAxis = fakeAxis({ categories: VARIABLES });
  const yAxis = fakeAxis();
  const observations = [[33, 62, 1835], [15, 165, 3693]];

  return fakeChart({
    title: 'Cars',
    renderToId: 'parallel-chart',
    parallelCoordinates: true,
    series: observations.map((values, index) => fakeSeries({
      index,
      type: 'line',
      name: `Car ${index + 1}`,
      xAxis,
      yAxis,
      data: values.map((y, i) => ({ x: i, y, category: VARIABLES[i] })),
    })),
  });
}

describe('highcharts parallel coordinates', () => {
  it('reads each series as one observation across the named axes', () => {
    const layers = highchartsToMaidr(carsChart()).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PARALLEL);
    // The raw values, not normalised: `ParallelTrace` computes each column's
    // extent itself and pitches a value against its OWN axis.
    expect(layers[0].data as LinePoint[][]).toEqual([
      [
        { x: 'Miles per gallon', y: 33, z: 'Car 1' },
        { x: 'Horsepower', y: 62, z: 'Car 1' },
        { x: 'Weight', y: 1835, z: 'Car 1' },
      ],
      [
        { x: 'Miles per gallon', y: 15, z: 'Car 2' },
        { x: 'Horsepower', y: 165, z: 'Car 2' },
        { x: 'Weight', y: 3693, z: 'Car 2' },
      ],
    ]);
    expect(layers[0].selectors).toEqual([
      '#parallel-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
      '#parallel-chart .highcharts-series-group .highcharts-series-1 path.highcharts-graph',
    ]);
    // Every column is a different quantity, so there is no single value axis
    // to name and `axes.x` names what a column IS.
    expect(layers[0].axes?.x?.label).toBe('Axis');
    expect(layers[0].axes?.y?.label).toBe('Value');
  });

  it('falls back to the per-variable axis titles when the x axis names nothing', () => {
    const xAxis = fakeAxis();
    const yAxes = VARIABLES.map(text => fakeAxis({ options: { title: { text } } }));
    const chart = fakeChart({
      parallelCoordinates: true,
      yAxis: yAxes,
      series: [fakeSeries({
        index: 0,
        type: 'line',
        xAxis,
        yAxis: yAxes[0],
        data: [{ x: 0, y: 33 }, { x: 1, y: 62 }, { x: 2, y: 1835 }],
      })],
    });

    const row = (highchartsToMaidr(chart).subplots[0][0].layers[0].data as LinePoint[][])[0];

    expect(row.map(point => point.x)).toEqual(VARIABLES);
  });

  it('wins over polar, so a star plot still pitches per axis', () => {
    const xAxis = fakeAxis({ categories: VARIABLES });
    const chart = fakeChart({
      parallelCoordinates: true,
      polar: true,
      series: [fakeSeries({
        index: 0,
        type: 'line',
        xAxis,
        data: [{ x: 0, y: 33, category: VARIABLES[0] }],
      })],
    });

    // A star plot is parallel coordinates bent around a circle: the columns
    // are still different quantities, which is what decides the pitch.
    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.PARALLEL);
  });
});
