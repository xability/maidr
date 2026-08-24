import type { MaidrLayer, WaterfallPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { WaterfallTrace } from '@model/waterfall';
import { TraceType } from '@type/grammar';

/**
 * A budget bridge: an opening total, three signed contributions, a closing
 * total. Every number is distinct so a reading that took the wrong field, or
 * the wrong step, cannot coincide with the right one — in particular no delta
 * equals any running total.
 */
const STEPS: WaterfallPoint[] = [
  { x: 'Opening', start: 0, end: 1200, delta: 1200, kind: 'total' },
  { x: 'Marketing', start: 1200, end: 950, delta: -250, kind: 'decrease' },
  { x: 'Sales', start: 950, end: 1430, delta: 480, kind: 'increase' },
  { x: 'Support', start: 1430, end: 1360, delta: -70, kind: 'decrease' },
  { x: 'Closing', start: 0, end: 1360, delta: 1360, kind: 'total' },
];

/**
 * Create a minimal waterfall layer for model-only tests.
 * @param data The steps the layer carries
 * @returns Waterfall layer definition
 */
function createLayer(data: WaterfallPoint[]): MaidrLayer {
  return {
    id: 'test-waterfall-layer',
    type: TraceType.WATERFALL,
    title: 'Budget bridge',
    axes: { x: { label: 'Step' }, y: { label: 'Amount' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: WaterfallTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a trace and place the cursor on one step.
 * @param col Step to land on
 * @param data The steps the layer carries
 * @returns The positioned trace
 */
function at(col: number, data: WaterfallPoint[] = STEPS): WaterfallTrace {
  const trace = TraceFactory.create(createLayer(data)) as WaterfallTrace;
  trace.moveToIndex(0, col);
  return trace;
}

describe('waterfall registration', () => {
  test('the factory builds a WaterfallTrace', () => {
    expect(TraceFactory.create(createLayer(STEPS))).toBeInstanceOf(WaterfallTrace);
  });

  test('announces itself as a waterfall chart', () => {
    expect(at(0).description.chartType).toBe('Waterfall Chart');
  });

  test('navigates one column per step, with no second dimension', () => {
    const trace = at(0);

    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    expect(nonEmptyState(at(4)).text.main.value).toBe('Closing');
  });
});

describe('reading a step', () => {
  test('announces the contribution, not the running total', () => {
    // The bar's height is the contribution, and that is the number the reader
    // is asking for when they land on "Marketing".
    const { text } = nonEmptyState(at(1));

    expect(text.main.value).toBe('Marketing');
    expect(text.cross?.value).toBe(-250);
  });

  test('carries the running total alongside the contribution', () => {
    // Without this the reader has to sum every delta in their head across the
    // whole chart to know where they are.
    const { text } = nonEmptyState(at(1));

    expect(text.stack).toEqual({ label: 'Running total', value: 950 });
  });

  test('names which way the step moved', () => {
    // A decrease announced as a bare negative number is easy to mishear, and
    // a total contributes nothing at all -- it restates the running value.
    expect(nonEmptyState(at(0)).text.section).toBe('total');
    expect(nonEmptyState(at(1)).text.section).toBe('decrease');
    expect(nonEmptyState(at(2)).text.section).toBe('increase');
  });

  test('keeps the contribution and the total distinguishable', () => {
    // The failure this guards is announcing one number where the chart draws
    // two: at every step the two must not be the same value.
    for (let col = 1; col < 4; col++) {
      const { text } = nonEmptyState(at(col));
      expect(text.cross?.value).not.toBe(text.stack?.value);
    }
  });
});

describe('audio', () => {
  test('pitches the contribution, so large movers stand out', () => {
    const { audio } = nonEmptyState(at(2));

    expect(audio.freq.raw).toBe(480);
  });

  test('scales against the signed range of the contributions', () => {
    // A decrease has to sound below an increase. Scaling to the running
    // totals instead would compress every step into a near-identical tone,
    // because the totals of a waterfall drift within a narrow band.
    const decrease = nonEmptyState(at(1)).audio;
    const increase = nonEmptyState(at(2)).audio;

    expect(decrease.freq.min).toBe(-250);
    expect(decrease.freq.max).toBe(1360);
    expect(Number(decrease.freq.raw)).toBeLessThan(Number(increase.freq.raw));
  });

  test('pans across the steps', () => {
    const { audio } = nonEmptyState(at(3));

    expect(audio.panning.x).toBe(3);
    expect(audio.panning.rows).toBe(1);
    expect(audio.panning.cols).toBe(5);
  });
});

describe('braille', () => {
  test('renders one row of contributions', () => {
    const { braille } = nonEmptyState(at(2));

    expect(braille.empty).toBe(false);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }
    expect(braille.values).toEqual([[1200, -250, 480, -70, 1360]]);
    expect(braille.col).toBe(2);
  });
});

describe('extrema navigation', () => {
  test('offers the biggest mover in each direction', () => {
    // What a waterfall is read to answer. Finding it by ear otherwise means
    // walking every step while holding the running maximum in your head.
    const targets = at(0).getExtremaTargets();

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ type: 'max', value: 480, pointIndex: 2 });
    expect(targets[1]).toMatchObject({ type: 'min', value: -250, pointIndex: 1 });
  });

  test('excludes the totals, which are not contributions', () => {
    // The opening and closing bars carry the largest magnitudes here (1200 and
    // 1360). Including them would make "largest increase" mean "the closing
    // balance" on nearly every waterfall and bury the answer.
    for (const target of at(0).getExtremaTargets()) {
      expect(Math.abs(target.value)).toBeLessThan(1200);
    }
  });

  test('moves the cursor to a chosen target', () => {
    // The base implementation throws when `supportsExtrema` is true, so a
    // trace that advertises extrema without this is worse than one that does
    // not advertise them at all.
    const trace = at(0);
    const [largest] = trace.getExtremaTargets();

    trace.navigateToExtrema(largest);

    expect(nonEmptyState(trace).text.main.value).toBe('Sales');
  });

  test('offers one target when every step moves the same way', () => {
    // Naming the same bar as both the biggest rise and the biggest fall would
    // tell the reader the chart has two movers when it has one.
    const rising: WaterfallPoint[] = [
      { x: 'Open', start: 0, end: 100, delta: 100, kind: 'total' },
      { x: 'A', start: 100, end: 180, delta: 80, kind: 'increase' },
    ];
    const targets = at(0, rising).getExtremaTargets();

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ type: 'max', value: 80 });
  });

  test('offers nothing when the chart is all totals', () => {
    const totalsOnly: WaterfallPoint[] = [
      { x: 'Open', start: 0, end: 500, delta: 500, kind: 'total' },
      { x: 'Close', start: 0, end: 500, delta: 500, kind: 'total' },
    ];

    expect(at(0, totalsOnly).getExtremaTargets()).toEqual([]);
  });
});

describe('description', () => {
  test('reports where the chart starts and ends', () => {
    // Not recoverable from the contributions without summing every one of
    // them while navigating, which is the work the form exists to save.
    const { stats } = at(0).description;

    expect(stats).toContainEqual({ label: 'Starting value', value: 0 });
    expect(stats).toContainEqual({ label: 'Ending value', value: 1360 });
  });

  test('counts the increases and decreases without the totals', () => {
    // A total is not a contribution; counting the opening and closing bars as
    // increases would overstate how many things moved.
    const { stats } = at(0).description;

    expect(stats).toContainEqual({ label: 'Increases', value: 1 });
    expect(stats).toContainEqual({ label: 'Decreases', value: 2 });
  });

  test('names the largest mover by magnitude, not by sign', () => {
    // What a waterfall is read to find. The largest here is a decrease of
    // 480 in the other direction -- taking the maximum rather than the
    // largest absolute value would report Sales instead.
    const dominated: WaterfallPoint[] = [
      { x: 'Open', start: 0, end: 100, delta: 100, kind: 'total' },
      { x: 'Rent', start: 100, end: -800, delta: -900, kind: 'decrease' },
      { x: 'Sales', start: -800, end: -320, delta: 480, kind: 'increase' },
    ];
    const { stats } = at(0, dominated).description;

    expect(stats).toContainEqual({
      label: 'Largest contribution',
      value: 'Rent (-900)',
    });
  });

  test('stays silent about a largest mover when nothing moved', () => {
    // A chart of nothing but totals has no contribution to report, and
    // naming one would invent a step the chart does not draw.
    const totalsOnly: WaterfallPoint[] = [
      { x: 'Open', start: 0, end: 500, delta: 500, kind: 'total' },
      { x: 'Close', start: 0, end: 500, delta: 500, kind: 'total' },
    ];
    const labels = at(0, totalsOnly).description.stats.map(stat => stat.label);

    expect(labels).not.toContain('Largest contribution');
  });

  test('tabulates each step with its change and running total', () => {
    const { dataTable } = at(0).description;

    expect(dataTable.headers).toEqual(['Step', 'Change', 'Running total']);
    expect(dataTable.rows[1]).toEqual(['Marketing', -250, 950]);
  });
});
