import type { HighchartsChart, HighchartsPoint } from '@adapters/highcharts/types';
import type { GanttData, MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it, jest } from '@jest/globals';
import { FormatUtil } from '@util/format';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/**
 * A Highcharts Gantt chart's dates were announced as the milliseconds its
 * datetime axis counts: "Date is 1,704,067,200,000 through 1,704,412,800,000,
 * Length is 345,600,000 ms", in navigation, the description and the table,
 * while the chart draws weeks and days.
 */

const DAY = 24 * 36e5;
const HOUR = 36e5;
const START = Date.UTC(2024, 0, 1);

/**
 * A one-lane Gantt chart on a datetime axis.
 *
 * @param tasks - The lane's intervals, in milliseconds
 * @param time - The chart's time settings, when it has any
 * @returns The chart
 */
function schedule(
  tasks: Partial<HighchartsPoint>[],
  time?: HighchartsChart['time'],
): HighchartsChart {
  const chart = fakeChart({
    type: 'gantt',
    renderToId: 'gantt-chart',
    series: [fakeSeries({
      index: 0,
      type: 'gantt',
      name: 'Project',
      xAxis: fakeAxis({ isDatetimeAxis: true, options: { type: 'datetime', title: { text: 'Date' } } }),
      yAxis: fakeAxis({ categories: ['Design'] }),
      data: tasks.map(task => ({ y: 0, ...task })),
    })],
  });
  chart.time = time;
  return chart;
}

/**
 * What the time axis' format writes for a position.
 *
 * @param layer - The gantt layer
 * @param position - A position as the layer states it
 * @returns The text MAIDR announces for it
 */
function written(layer: MaidrLayer, position: number): string {
  const format = layer.axes?.x?.format;
  if (format === undefined) {
    throw new Error('the time axis has no format');
  }
  return String(FormatUtil.resolveFormat(format)(position));
}

describe('a highcharts gantt chart on a datetime axis', () => {
  it('states its lengths in days and writes its positions as dates', () => {
    const layer = highchartsToMaidr(schedule([
      { name: 'Wireframes', x: START, x2: START + 4 * DAY },
      { name: 'Revisions', x: START + 10 * DAY, x2: START + 12 * DAY },
    ])).subplots[0][0].layers[0];
    const data = layer.data as GanttData;

    expect(data.unit).toBe('days');
    expect(data.points[0].map(task => task.end - task.start)).toEqual([4, 2]);
    expect(written(layer, data.points[0][0].start)).toBe('Jan 1, 2024');
    expect(written(layer, data.points[0][1].end)).toBe('Jan 13, 2024');
    expect(layer.axes?.x?.label).toBe('Date');
  });

  it('states hours, and writes the time of day, for tasks shorter than a day', () => {
    const layer = highchartsToMaidr(schedule([
      { name: 'Stand-up', x: START + 9 * HOUR, x2: START + 12 * HOUR },
    ])).subplots[0][0].layers[0];
    const data = layer.data as GanttData;

    expect(data.unit).toBe('hours');
    expect(data.points[0][0].end - data.points[0][0].start).toBe(3);
    expect(written(layer, data.points[0][0].start)).toBe('Jan 1, 2024, 09:00 AM');
  });

  it('writes the dates in the time zone the chart draws them in', () => {
    // Midnight in UTC, which is where Highcharts draws dates unless told
    // otherwise, is the evening before in New York.
    const layer = highchartsToMaidr(schedule(
      [{ name: 'Wireframes', x: START, x2: START + 4 * DAY }],
      { timezone: 'America/New_York' },
    )).subplots[0][0].layers[0];

    expect(written(layer, (layer.data as GanttData).points[0][0].start)).toBe('Dec 31, 2023, 07:00 PM');
  });

  it('keeps a schedule of milestones in milliseconds, written as dates', () => {
    // Nothing on it lasts any time, so there is no unit its lengths fill.
    const layer = highchartsToMaidr(schedule([{ name: 'Go live', x: START + 22 * DAY }])).subplots[0][0].layers[0];
    const data = layer.data as GanttData;

    expect(data.unit).toBe('ms');
    expect(data.points[0][0]).toMatchObject({ start: START + 22 * DAY, end: START + 22 * DAY });
    expect(layer.axes?.x?.format).toMatchObject({ type: 'date' });
    expect(written(layer, data.points[0][0].start)).toBe('Jan 23, 2024');
  });

  it('keeps milliseconds and an eval-free date format where the page forbids compiling one, asking once', () => {
    // A fresh copy of the adapter, which has not asked yet on this page.
    let convert: typeof highchartsToMaidr = highchartsToMaidr;
    jest.isolateModules(() => {
      // eslint-disable-next-line ts/no-require-imports
      convert = (require('@adapters/highcharts/adapter') as { highchartsToMaidr: typeof highchartsToMaidr }).highchartsToMaidr;
    });
    const original = globalThis.Function;
    let attempts = 0;
    globalThis.Function = function Blocked() {
      attempts += 1;
      throw new EvalError('unsafe-eval is not allowed');
    } as unknown as FunctionConstructor;
    try {
      const chart = schedule([{ name: 'Wireframes', x: START, x2: START + 4 * DAY }]);
      const layer = convert(chart).subplots[0][0].layers[0];
      convert(chart);
      const data = layer.data as GanttData;

      expect(data.unit).toBe('ms');
      expect(data.points[0][0]).toMatchObject({ start: START, end: START + 4 * DAY });
      expect(layer.axes?.x?.format?.function).toBeUndefined();
      expect(layer.axes?.x?.format?.type).toBe('date');
      expect(attempts).toBe(1);
    } finally {
      globalThis.Function = original;
    }
  });
});
