import type { GanttData } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { Orientation, TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeGraphic, fakeSeries } from './helpers';

const LANES = ['Design', 'Develop', 'Test', 'Ship'];
const DAY = 24 * 36e5;

/**
 * Tasks declared by date rather than by lane — the order a schedule is usually
 * authored in, and the one that puts the DOM out of step with MAIDR's lanes.
 */
const TASKS = [
  { name: 'Wireframes', y: 0, x: 0, x2: 2 * DAY },
  { name: 'API', y: 1, x: DAY, x2: 4 * DAY },
  { name: 'Revisions', y: 0, x: 3 * DAY, x2: 4 * DAY },
  { name: 'Regression', y: 2, x: 4 * DAY, x2: 6 * DAY },
];

function scheduleChart(): ReturnType<typeof fakeChart> {
  return fakeChart({
    title: 'Release plan',
    renderToId: 'gantt-chart',
    type: 'gantt',
    series: [fakeSeries({
      index: 0,
      type: 'gantt',
      name: 'Project',
      xAxis: fakeAxis({ options: { type: 'datetime', title: { text: 'Date' } } }),
      yAxis: fakeAxis({ categories: LANES, options: { title: { text: 'Task' } } }),
      data: TASKS.map(task => ({ ...task, graphic: fakeGraphic() })),
    })],
  });
}

describe('highcharts gantt series', () => {
  it('nests the intervals by lane and keeps an unbooked lane', () => {
    const layer = highchartsToMaidr(scheduleChart()).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.GANTT);
    // A gantt runs its bars along x with its lanes down y, the opposite of
    // MAIDR's default.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);

    const data = layer.data as GanttData;
    expect(data.points).toEqual([
      [
        { x: 'Design', start: 0, end: 2 * DAY, label: 'Wireframes' },
        { x: 'Design', start: 3 * DAY, end: 4 * DAY, label: 'Revisions' },
      ],
      [{ x: 'Develop', start: DAY, end: 4 * DAY, label: 'API' }],
      [{ x: 'Test', start: 4 * DAY, end: 6 * DAY, label: 'Regression' }],
      // Nothing is booked in Ship, and an empty lane is a real statement about
      // a schedule — which is the whole reason the shape is nested.
      [],
    ]);
    expect(data.lanes).toEqual(LANES);
    // A Highcharts datetime axis counts milliseconds, and a length is a
    // difference along it.
    expect(data.unit).toBe('ms');
    expect(layer.axes?.x?.label).toBe('Date');
    expect(layer.axes?.y?.label).toBe('Task');
  });

  it('stamps the rendered intervals in lane-major order', () => {
    const chart = scheduleChart();
    const points = chart.series[0].data;

    highchartsToMaidr(chart);

    // Highcharts draws in `series.data` order while MAIDR slices its selectors
    // lane by lane, so document order cannot be indexed into.
    expect(points.map(p => p.graphic?.element.getAttribute('data-maidr-task-index')))
      .toEqual(['0', '2', '1', '3']);
    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].selectors).toEqual([
      '#gantt-chart .highcharts-series-group .highcharts-series-0 [data-maidr-task-index="0"]',
      '#gantt-chart .highcharts-series-group .highcharts-series-0 [data-maidr-task-index="1"]',
      '#gantt-chart .highcharts-series-group .highcharts-series-0 [data-maidr-task-index="2"]',
      '#gantt-chart .highcharts-series-group .highcharts-series-0 [data-maidr-task-index="3"]',
    ]);
  });

  it('reads an xrange series the same way, numbering unnamed lanes', () => {
    const chart = fakeChart({
      type: 'xrange',
      series: [fakeSeries({
        index: 0,
        type: 'xrange',
        xAxis: fakeAxis(),
        yAxis: fakeAxis(),
        data: [
          { x: 1, x2: 5, y: 0, name: 'Prep' },
          { x: 2, x2: 8, y: 1 },
        ],
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
    const data = layer.data as GanttData;

    expect(layer.type).toBe(TraceType.GANTT);
    expect(data.lanes).toEqual([0, 1]);
    expect(data.points).toEqual([
      [{ x: 0, start: 1, end: 5, label: 'Prep' }],
      [{ x: 1, start: 2, end: 8 }],
    ]);
    // A plain numeric axis measures no time, so nothing names its unit.
    expect(data.unit).toBeUndefined();
  });

  it('gives a milestone a zero length at its own instant', () => {
    const chart = fakeChart({
      type: 'gantt',
      series: [fakeSeries({
        index: 0,
        type: 'gantt',
        yAxis: fakeAxis({ categories: ['Launch'] }),
        data: [{ x: 7 * DAY, y: 0, name: 'Go live' }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as GanttData;

    // Highcharts draws a milestone as a diamond rather than a bar, because it
    // has no end.
    expect(data.points[0]).toEqual([
      { x: 'Launch', start: 7 * DAY, end: 7 * DAY, label: 'Go live' },
    ]);
  });
});
