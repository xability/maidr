import type { AmAxis } from '@adapters/amcharts/types';
import type { GanttTrace } from '@model/gantt';
import type { GanttData, MaidrLayer } from '@type/grammar';
import { fromAmCharts } from '@adapters/amcharts/adapter';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { FormatUtil } from '@util/format';
import { fakeChart, fakeGanttSeries, fakeRoot } from './helpers';

/**
 * An amCharts gantt on a `DateAxis` read its dates as day numbers counted from
 * its earliest interval: "x is 0 through 30, Length is 30 days" for a task
 * the axis draws from Jan 1 to Jan 31, 2024, and the same numbers in the
 * description's table.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const JAN_1 = Date.UTC(2024, 0, 1);

/** One interval of a schedule, in epoch milliseconds. */
interface Bar {
  categoryY: string;
  openValueX: number;
  valueX: number;
}

/**
 * The gantt layer of a schedule on a date axis.
 *
 * @param bars - Its intervals
 * @param config - How the axis reads them
 * @param config.timeUnit - The axis' base time unit, `day` unless given
 * @param config.root - The root's time settings
 * @param convert - The adapter entry point to convert it with
 * @returns The layer
 */
function schedule(
  bars: Bar[],
  config: { timeUnit?: string; root?: AmAxis['root'] } = {},
  convert: typeof fromAmCharts = fromAmCharts,
): MaidrLayer {
  const series = fakeGanttSeries('Schedule', bars, { lanes: ['Design', 'Build'], timeUnit: 'day', ...config });
  return convert(fakeRoot([fakeChart({ series: [series], xLabel: 'Day', yLabel: 'Phase' })]))
    .subplots[0][0]
    .layers[0];
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

describe('an amCharts gantt on a date axis', () => {
  const DESIGN: Bar = { categoryY: 'Design', openValueX: JAN_1, valueX: JAN_1 + 30 * DAY };
  const BUILD: Bar = { categoryY: 'Build', openValueX: JAN_1 + 30 * DAY, valueX: JAN_1 + 100 * DAY };

  it('writes its positions as the dates the axis draws, and its lengths in the base interval\'s unit', () => {
    const layer = schedule([DESIGN, BUILD]);
    const data = layer.data as GanttData;
    const [design] = data.points[0];
    const [build] = data.points[1];

    expect(data.unit).toBe('days');
    expect(design.end - design.start).toBe(30);
    expect(written(layer, design.start)).toBe('Jan 1, 2024');
    expect(written(layer, design.end)).toBe('Jan 31, 2024');
    expect(written(layer, build.end)).toBe('Apr 10, 2024');
    expect(layer.axes?.x?.label).toBe('Day');
  });

  it('lists the same dates in the description\'s table', () => {
    const layer = schedule([DESIGN, BUILD]);
    // Read without the layer's selectors: they name bars this test does not
    // draw, and the trace would look for them in a document the unit
    // project's node environment does not have.
    const trace = TraceFactory.create({ ...layer, selectors: undefined }) as GanttTrace;

    expect(trace.description.dataTable.rows).toEqual([
      ['Design', '', 'Jan 1, 2024', 'Jan 31, 2024', 30],
      ['Build', '', 'Jan 31, 2024', 'Apr 10, 2024', 70],
    ]);
  });

  it('writes the time of day on a schedule read in hours', () => {
    const layer = schedule(
      [{ categoryY: 'Design', openValueX: JAN_1 + 9 * HOUR, valueX: JAN_1 + 12 * HOUR }],
      { timeUnit: 'hour' },
    );
    const data = layer.data as GanttData;
    const [task] = data.points[0];

    expect(data.unit).toBe('hours');
    expect(task.end - task.start).toBe(3);
    expect(written(layer, task.start)).toBe('Jan 1, 2024, 09:00 AM');
    expect(written(layer, task.end)).toBe('Jan 1, 2024, 12:00 PM');
  });

  it('writes the dates in the time zone the root draws them in', () => {
    // Midnight in UTC is the evening before in New York. A root's `utc`
    // takes precedence over its `timezone`, as it does in amCharts.
    const inNewYork = schedule([DESIGN], { root: { timezone: { name: 'America/New_York' } } });
    const inUtc = schedule([DESIGN], { root: { utc: true, timezone: { name: 'America/New_York' } } });

    expect(written(inNewYork, (inNewYork.data as GanttData).points[0][0].start))
      .toBe('Dec 31, 2023, 07:00 PM');
    expect(written(inUtc, (inUtc.data as GanttData).points[0][0].start)).toBe('Jan 1, 2024');
  });

  it('keeps milliseconds and an eval-free date format where the page forbids compiling one, asking once', () => {
    // A fresh copy of the adapter, which has not asked yet on this page.
    let convert: typeof fromAmCharts = fromAmCharts;
    jest.isolateModules(() => {
      // eslint-disable-next-line ts/no-require-imports
      convert = (require('@adapters/amcharts/adapter') as { fromAmCharts: typeof fromAmCharts }).fromAmCharts;
    });
    const original = globalThis.Function;
    let attempts = 0;
    globalThis.Function = function Blocked() {
      attempts += 1;
      throw new EvalError('unsafe-eval is not allowed');
    } as unknown as FunctionConstructor;
    try {
      const layer = schedule([DESIGN], {}, convert);
      schedule([DESIGN], {}, convert);
      const data = layer.data as GanttData;

      expect(data.unit).toBe('milliseconds');
      expect(data.points[0][0]).toMatchObject({ start: JAN_1, end: JAN_1 + 30 * DAY });
      expect(layer.axes?.x?.format?.function).toBeUndefined();
      expect(layer.axes?.x?.format?.type).toBe('date');
      expect(written(layer, data.points[0][0].start)).toBe('Jan 1, 2024');
      expect(attempts).toBe(1);
    } finally {
      globalThis.Function = original;
    }
  });
});
