import type { AreaTrace } from '@model/area';
import type { NotificationService } from '@service/notification';
import type { LinePoint } from '@type/grammar';
import type { NonEmptyTraceState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * A stacked area whose series have gaps (#925).
 *
 * `computeColumnTotals` guards a column reached only by gaps so that it has
 * no total, and `text` withholds the share of a point that measured nothing.
 * Both guards read the sample through `Number(point.y)`, and `Number(null)`
 * is `0` -- a measured zero, which the guards accept. So a column of nothing
 * but gaps announced "Total is 0" and pulled the description's minimum total
 * down to 0, and a lone gap in a measured column announced itself as
 * "0.0% of it".
 */

const SUBSCRIPTIONS: LinePoint[] = [
  { x: 'Q1', y: 10, z: 'Subscriptions' },
  { x: 'Q2', y: null, z: 'Subscriptions' },
  { x: 'Q3', y: 30, z: 'Subscriptions' },
];

/** `Services` measured every quarter. */
const SERVICES: LinePoint[] = [
  { x: 'Q1', y: 5, z: 'Services' },
  { x: 'Q2', y: 20, z: 'Services' },
  { x: 'Q3', y: 70, z: 'Services' },
];

/** `Services` with the same quarter unmeasured. */
const SERVICES_GAPPED: LinePoint[] = [
  { x: 'Q1', y: 5, z: 'Services' },
  { x: 'Q2', y: null, z: 'Services' },
  { x: 'Q3', y: 70, z: 'Services' },
];

function stackedArea(data: LinePoint[][], row: number, col: number): AreaTrace {
  const trace = TraceFactory.create({
    id: 'test-area-gaps',
    type: TraceType.STACKED_AREA,
    title: 'Revenue',
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data,
  }) as AreaTrace;
  trace.moveToIndex(row, col);
  return trace;
}

function nonEmptyState(trace: AreaTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

function announce(state: TraceState): string {
  const text = new TextService({ notify: jest.fn() } as unknown as NotificationService);
  const listener = jest.fn();
  const disposable = text.onChange(listener);

  text.update(state);
  disposable.dispose();
  return (listener.mock.calls[0][0] as { value: string }).value;
}

describe('a column where every series has a gap', () => {
  test('has no total to announce', () => {
    // The chart draws no stack at Q2, so there is no height to report;
    // "Total is 0" would claim one.
    const trace = stackedArea([SUBSCRIPTIONS, SERVICES_GAPPED], 0, 1);

    expect(announce(trace.state)).toBe('Quarter is Q2, Revenue is missing, Group is Subscriptions');
    expect(nonEmptyState(trace).text.stack).toBeUndefined();
  });

  test('does not drag the minimum total down to zero', () => {
    const stats = stackedArea([SUBSCRIPTIONS, SERVICES_GAPPED], 0, 0).description.stats;

    expect(stats).toContainEqual({ label: 'Minimum total', value: 15 });
    expect(stats).toContainEqual({ label: 'Maximum total', value: 100 });
  });
});

describe('a gap in a column other series did measure', () => {
  test('announces the total of the measured series and no share', () => {
    // The stack at Q2 is the 20 that Services measured. The gap is not a
    // zero-height band inside it, so it has no share of it to report.
    const trace = stackedArea([SUBSCRIPTIONS, SERVICES], 0, 1);

    expect(announce(trace.state)).toBe('Quarter is Q2, Revenue is missing, Group is Subscriptions, Total is 20');
    expect(nonEmptyState(trace).text.stack).toEqual({ label: 'Total', value: 20, share: undefined });
  });

  test('the measured series in that column keeps its full share', () => {
    const trace = stackedArea([SUBSCRIPTIONS, SERVICES], 1, 1);

    expect(announce(trace.state)).toBe('Quarter is Q2, Revenue is 20, Group is Services, Total is 20, 100.0% of it');
  });
});

describe('a measured zero is still a reading', () => {
  test('counts towards the total and announces its share', () => {
    // The distinction the guard exists to draw: a series that really did
    // read nothing this quarter is a zero-height band, and says so.
    const zero: LinePoint[] = [
      { x: 'Q1', y: 10, z: 'Subscriptions' },
      { x: 'Q2', y: 0, z: 'Subscriptions' },
      { x: 'Q3', y: 30, z: 'Subscriptions' },
    ];
    const trace = stackedArea([zero, SERVICES], 0, 1);

    expect(announce(trace.state)).toBe('Quarter is Q2, Revenue is 0, Group is Subscriptions, Total is 20, 0.0% of it');
  });
});
