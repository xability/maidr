import type { Subplot, Trace } from '@model/plot';
import type { AxisFormat, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * Page Up and Page Down between a line and a scatter over one time column
 * (#1717).
 *
 * r-maidr writes a line's x as the text it reads ("2026-01-01 03:00:00") and,
 * since xability/r-maidr#447, a scatter's x as the axis's seconds with a time
 * format that writes them the same way. A switch carried one layer's x to the
 * other and found no point holding it: from the scatter at 03:00 the reader
 * landed on the line at midnight, and from the line at 03:00 on the scatter's
 * first point.
 */

/** Seconds at UTC midnight on 2026-01-01. */
const MIDNIGHT = Date.UTC(2026, 0, 1) / 1000;
const HOURS = [0, 1, 2, 3, 4];

/** r-maidr's time format, written in UTC so the test does not move with the machine. */
const TIME: AxisFormat = {
  function: 'var d = new Date(Number(value) * 1000).toISOString(); return d.slice(0, 10) + " " + d.slice(11, 19);',
  unit: 'second',
};

/**
 * How r-maidr writes an hour of the day as a line's x.
 *
 * @param hour - The hour
 * @returns The text
 */
function written(hour: number): string {
  return `2026-01-01 0${hour}:00:00`;
}

const LINE: MaidrLayer = {
  id: 'line',
  type: TraceType.LINE,
  axes: { x: { label: 'Time' }, y: { label: 'Load' } },
  data: [HOURS.map(hour => ({ x: written(hour), y: 10 + hour }))],
};

const SCATTER: MaidrLayer = {
  id: 'points',
  type: TraceType.SCATTER,
  axes: { x: { label: 'Time', format: TIME }, y: { label: 'Load' } },
  data: HOURS.map(hour => ({ x: MIDNIGHT + hour * 3600, y: 12 + hour })),
};

/**
 * The one subplot of a chart of the given layers.
 *
 * @param layers - Its layers, the first one active
 * @returns The subplot
 */
function subplotOf(...layers: MaidrLayer[]): Subplot {
  return new Figure({ id: 'chart', subplots: [[{ layers }]] }).activeSubplot;
}

/**
 * Walks the active layer forward to an hour's point.
 *
 * @param subplot - The chart's subplot
 * @param hour - The hour to stop at
 * @returns The active layer
 */
function walkTo(subplot: Subplot, hour: number): Trace | null {
  const trace = subplot.activeTrace;
  trace?.moveOnce('FORWARD');
  for (let step = 0; step < hour; step++) {
    trace?.moveOnce('FORWARD');
  }
  return trace;
}

describe('a layer switch between a line and a scatter over one time column', () => {
  test('lands on the line at the scatter\'s time', () => {
    const subplot = subplotOf(SCATTER, LINE);
    expect(walkTo(subplot, 3)?.getCurrentXValue()).toBe(MIDNIGHT + 3 * 3600);

    const line = subplot.switchLayer('UPWARD');

    expect(line?.getCurrentXValue()).toBe(written(3));
  });

  test('lands on the scatter at the line\'s time', () => {
    const subplot = subplotOf(LINE, SCATTER);
    expect(walkTo(subplot, 3)?.getCurrentXValue()).toBe(written(3));

    const points = subplot.switchLayer('UPWARD');

    expect(points?.getCurrentXValue()).toBe(MIDNIGHT + 3 * 3600);
  });

  test('keeps the place back and forth', () => {
    const subplot = subplotOf(LINE, SCATTER);
    walkTo(subplot, 2);

    subplot.switchLayer('UPWARD');
    const back = subplot.switchLayer('DOWNWARD');

    expect(back?.getCurrentXValue()).toBe(written(2));
  });
});
