import type { FunnelTrace } from '@model/funnel';
import type { NotificationService } from '@service/notification';
import type { BarPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * A funnel with a stage that measured nothing, read through the text service.
 *
 * `FunnelTrace.ratio` answers `NaN` for a stage that is zero or absent, and
 * its docstring promises the text reads that as "missing". The promise only
 * holds if the ratio reaches `TextService` as a non-finite *number*: formatted
 * into a percentage string first it arrives as the literal "NaN%", which the
 * service has no reason to treat as anything but a value.
 */

function createLayer(data: BarPoint[]): MaidrLayer {
  return {
    id: 'test-funnel-gaps',
    type: TraceType.FUNNEL,
    title: 'Checkout funnel',
    axes: { x: { label: 'Stage' }, y: { label: 'People' } },
    data,
  };
}

function funnel(stage: number, data: BarPoint[]): FunnelTrace {
  const trace = TraceFactory.create(createLayer(data)) as FunnelTrace;
  trace.moveToIndex(0, stage);
  return trace;
}

function nonEmptyState(trace: FunnelTrace): NonEmptyTraceState {
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

describe('a stage following one that measured nothing', () => {
  const AFTER_EMPTY: BarPoint[] = [
    { x: 'a', y: 10 },
    { x: 'b', y: 0 },
    { x: 'c', y: 5 },
  ];

  test('reads its retention as missing rather than as a percentage of nothing', () => {
    const trace = funnel(2, AFTER_EMPTY);

    expect(announce(trace.state))
      .toBe('Stage is c, People is 5, Retained is missing, Entered is 10, 50.0% of it');
  });

  test('the share of the population is unaffected', () => {
    // The entry stage measured 10, so 5 is still half of what entered even
    // though the stage before it kept nobody.
    expect(nonEmptyState(funnel(2, AFTER_EMPTY)).text.stack?.share).toBeCloseTo(0.5);
  });
});

describe('a funnel whose entry stage measured nothing', () => {
  const EMPTY_ENTRY: BarPoint[] = [
    { x: 'a', y: 0 },
    { x: 'b', y: 3 },
  ];

  test('says nothing about a share of the population, since there is none', () => {
    // "0, NaN% of it" claims a fraction of an empty population; the total is
    // still worth announcing, the share is not.
    const trace = funnel(1, EMPTY_ENTRY);

    expect(announce(trace.state))
      .toBe('Stage is b, People is 3, Retained is missing, Entered is 0');
    expect(nonEmptyState(trace).text.stack?.share).toBeUndefined();
  });

  test('an absent entry stage is read the same way', () => {
    // `null` is what a producer sends for a stage it did not measure; the
    // count itself then has nothing to announce either.
    const trace = funnel(1, [{ x: 'a', y: null as unknown as number }, { x: 'b', y: 3 }]);

    expect(announce(trace.state))
      .toBe('Stage is b, People is 3, Retained is missing, Entered is missing');
  });
});

describe('a measured stage is unchanged', () => {
  test('still reads its retention as a percentage', () => {
    const trace = funnel(1, [{ x: 'a', y: 10 }, { x: 'b', y: 4 }]);

    expect(announce(trace.state))
      .toBe('Stage is b, People is 4, Retained is 40.0%, Entered is 10, 40.0% of it');
  });
});
