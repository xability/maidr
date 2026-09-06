import type { AbstractTrace } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { Histogram } from '@model/histogram';
import { LineTrace } from '@model/line';
import { PieTrace } from '@model/pie';
import { TraceType } from '@type/grammar';

/**
 * A reader who enters a chart, cycles the rotor to LOWER / HIGHER VALUE and
 * presses Right lands in `moveToNextCompareValue` while the trace is still in
 * its initial-entry state. The jump has to establish the entry position the
 * way an ordinary arrow does: otherwise the highlight stays suppressed and the
 * next arrow press is swallowed by the initial-entry branch of `moveOnce`,
 * which re-announces the point the compare jump already landed on instead of
 * moving.
 */

const BAR: MaidrLayer = {
  id: 'bars',
  type: TraceType.BAR,
  axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
  data: [{ x: 'Q1', y: 1 }, { x: 'Q2', y: 5 }, { x: 'Q3', y: 9 }],
};

const HISTOGRAM: MaidrLayer = {
  id: 'bins',
  type: TraceType.HISTOGRAM,
  axes: { x: { label: 'Petal Length' }, y: { label: 'Count' } },
  data: [
    { x: 1, y: 1, xMin: 0, xMax: 2, yMin: 0, yMax: 1 },
    { x: 3, y: 5, xMin: 2, xMax: 4, yMin: 0, yMax: 5 },
    { x: 5, y: 9, xMin: 4, xMax: 6, yMin: 0, yMax: 9 },
  ],
};

const PIE: MaidrLayer = {
  id: 'slices',
  type: TraceType.PIE,
  axes: { x: { label: 'Fruit' }, y: { label: 'Units' } },
  data: [{ x: 'Apples', y: 1 }, { x: 'Bananas', y: 5 }, { x: 'Cherries', y: 9 }],
};

const LINE: MaidrLayer = {
  id: 'line',
  type: TraceType.LINE,
  axes: { x: { label: 'X' }, y: { label: 'Y' } },
  data: [[{ x: 1, y: 1 }, { x: 2, y: 5 }, { x: 3, y: 9 }]],
};

describe.each([
  ['bar', (): AbstractTrace => new BarTrace(BAR)],
  ['histogram', (): AbstractTrace => new Histogram(HISTOGRAM)],
  ['pie', (): AbstractTrace => new PieTrace(PIE)],
  ['line', (): AbstractTrace => new LineTrace(LINE)],
])('rotor compare from initial entry on a %s', (_name, build) => {
  it('leaves the initial-entry state behind when the compare jump lands', () => {
    const trace = build();
    trace.resetToInitialEntry();

    const moved = trace.moveToNextCompareValue('right', 'higher');

    expect(moved).toBe(true);
    expect(trace.col).toBe(1);
    expect(trace.isInitialEntry).toBe(false);
  });

  it('does not swallow the arrow key that follows the compare jump', () => {
    const trace = build();
    trace.resetToInitialEntry();
    trace.moveToNextCompareValue('right', 'higher');

    const moved = trace.moveOnce('FORWARD');

    // The compare jump landed on the second point; an ordinary step then
    // reaches the third rather than re-announcing the second.
    expect(moved).toBe(true);
    expect(trace.col).toBe(2);
  });
});
