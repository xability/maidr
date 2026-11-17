import type { ScatterTrace } from '@model/scatter';
import type { AxisConfig, MaidrLayer, ScatterPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A scatter's description, on a layer whose author formatted its axes (#1716).
 *
 * Every announcement and the data table read a point through its axis's
 * declared format, and the description printed the raw numbers. r-maidr sends
 * a scatter over times as the axis's numbers with a time format
 * (xability/r-maidr#447), so a point read "t is 2026-01-01 00:00:00" while the
 * description read "t range: 1,767,225,600 to ...". The heatmap's z range had
 * the same gap, closed by #1696.
 */

/** Two days apart, at UTC midnight, in the seconds r-maidr sends. */
const JAN_1 = Date.UTC(2026, 0, 1) / 1000;
const JAN_3 = Date.UTC(2026, 0, 3) / 1000;

/**
 * A time axis as r-maidr formats one: a function over seconds, with the unit
 * they count. Read in UTC, so the test does not move with the machine.
 */
const DATE: AxisConfig['format'] = {
  function: 'return new Date(Number(value) * 1000).toISOString().slice(0, 10);',
  unit: 'second',
};

/**
 * Build a scatter trace with no selectors, so it needs no DOM.
 *
 * @param data - The points the layer carries
 * @param axes - The layer's axes
 * @returns The trace
 */
function traceOf(data: ScatterPoint[], axes: MaidrLayer['axes']): ScatterTrace {
  const layer: MaidrLayer = { id: 'points', type: TraceType.SCATTER, axes, data };
  return TraceFactory.create(layer) as ScatterTrace;
}

/**
 * Read one stat out of a trace's description.
 *
 * @param trace - The trace to read
 * @param label - Which stat to take
 * @returns The stat's value, or undefined when it is not reported
 */
function statOf(trace: ScatterTrace, label: string): unknown {
  return trace.description.stats.find(stat => stat.label === label)?.value;
}

describe('a scatter description on formatted axes', () => {
  test('states a time axis\'s range in its format, not in raw seconds', () => {
    const trace = traceOf(
      [{ x: JAN_1, y: 3 }, { x: JAN_1 + 86400, y: 5 }, { x: JAN_3, y: 4 }],
      { x: { label: 't', format: DATE }, y: { label: 'y' } },
    );

    expect(statOf(trace, 't range')).toBe('2026-01-01 to 2026-01-03');
  });

  test('states the y range, and a z range, each in its own axis\'s format', () => {
    const trace = traceOf(
      [{ x: 1, y: 0.12, z: 1500 }, { x: 2, y: 0.3, z: 2500 }, { x: 3, y: 0.24, z: 2000 }],
      {
        x: { label: 'Week' },
        y: { label: 'Margin', format: { type: 'percent', decimals: 0 } },
        z: { label: 'Revenue', format: { type: 'currency', currency: 'USD', decimals: 0 } },
      },
    );

    expect(statOf(trace, 'Margin range')).toBe('12% to 30%');
    expect(statOf(trace, 'Revenue range')).toBe('$1,500 to $2,500');
  });

  test('states where the quadrants split in each axis\'s format', () => {
    // Eight days, the fewest points the quadrant count is made for. The
    // split falls midway along each axis: noon on Jan 4, and 25%.
    const shares = [0.1, 0.4, 0.2, 0.3, 0.15, 0.35, 0.25, 0.3];
    const trace = traceOf(
      shares.map((y, day) => ({ x: JAN_1 + day * 86400, y })),
      { x: { label: 't', format: DATE }, y: { label: 'Share', format: { type: 'percent', decimals: 0 } } },
    );

    expect(statOf(trace, 'Quadrants split at')).toBe('t 2026-01-04, Share 25%');
  });

  test('leaves a range without a format as the plain numbers it was', () => {
    const trace = traceOf(
      [{ x: 1, y: 2 }, { x: 4, y: 8 }],
      { x: { label: 'Horsepower' }, y: { label: 'Miles per gallon' } },
    );

    expect(statOf(trace, 'Horsepower range')).toBe('1 to 4');
    expect(statOf(trace, 'Miles per gallon range')).toBe('2 to 8');
  });
});
