import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { AreaTrace } from '@model/area';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Two revenue streams over three quarters. The numbers are chosen so every
 * total is distinct from every series value, so an assertion on a total
 * cannot pass by coincidentally reading a band height instead.
 */
const SUBSCRIPTIONS: LinePoint[] = [
  { x: 'Q1', y: 10, z: 'Subscriptions' },
  { x: 'Q2', y: 20, z: 'Subscriptions' },
  { x: 'Q3', y: 30, z: 'Subscriptions' },
];

const SERVICES: LinePoint[] = [
  { x: 'Q1', y: 5, z: 'Services' },
  { x: 'Q2', y: 20, z: 'Services' },
  { x: 'Q3', y: 70, z: 'Services' },
];

/** Column totals of the two series above: 15, 40, 100. */
const TOTALS = [15, 40, 100];

/**
 * `Services` as it would arrive if the line launched a quarter late: its own
 * first point is Q2, so its local column indices are shifted by one against
 * the series above. Totals looked up by column index rather than by x break
 * exactly here.
 */
const LATE_START: LinePoint[] = [
  { x: 'Q2', y: 20, z: 'Services' },
  { x: 'Q3', y: 70, z: 'Services' },
];

/**
 * Create a minimal area layer for model-only tests.
 * @param type The area variant to author
 * @param data Points, nested one array per series
 * @returns Area layer definition for AreaTrace
 */
function createAreaLayer(type: TraceType, data: LinePoint[][]): MaidrLayer {
  return {
    id: 'test-area-layer',
    type,
    title: 'Revenue',
    axes: {
      x: { label: 'Quarter' },
      y: { label: 'Revenue' },
    },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: AreaTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Move the cursor to a given column of the first series.
 * @param trace The trace to move
 * @param col Zero-based column index to land on
 */
function moveToColumn(trace: AreaTrace, col: number): void {
  trace.moveOnce('UPWARD');
  for (let i = 0; i < col; i++) {
    trace.moveOnce('FORWARD');
  }
}

describe('area trace registration', () => {
  test.each([
    [TraceType.AREA],
    [TraceType.STACKED_AREA],
    [TraceType.NORMALIZED_AREA],
  ])('the factory builds an AreaTrace for %s', (type) => {
    const trace = TraceFactory.create(createAreaLayer(type, [SUBSCRIPTIONS]));

    expect(trace).toBeInstanceOf(AreaTrace);
  });

  test.each([
    [TraceType.AREA, 'area'],
    [TraceType.STACKED_AREA, 'stacked area'],
    [TraceType.NORMALIZED_AREA, '100% stacked area'],
  ])('%s announces itself as "%s"', (type, expected) => {
    const trace = TraceFactory.create(
      createAreaLayer(type, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).plotType).toBe(expected);
  });
});

describe('unstacked area', () => {
  test('reads a point as a line does, with no running total', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 1);

    const { text } = nonEmptyState(trace);
    expect(text.cross.value).toBe(20);
    // Bands that do not stack have no total to report; announcing one would
    // claim an aggregate the chart never draws.
    expect(text.stack).toBeUndefined();
  });

  test('carries no total statistics in the description', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    const labels = trace.description.stats.map(stat => stat.label);
    expect(labels).not.toContain('Minimum total');
    expect(labels).not.toContain('Maximum total');
  });
});

describe('stacked area', () => {
  test('announces the band value and the running total as separate numbers', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 1);

    const { text } = nonEmptyState(trace);
    // The regression this trace type exists to prevent: read as a line, the
    // announcement carried 20 alone with nothing to say whether that was the
    // band's height or the stack's top edge.
    expect(text.cross.value).toBe(20);
    expect(text.stack?.value).toBe(TOTALS[1]);
  });

  test('reports the point share of the total', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 2);

    expect(nonEmptyState(trace).text.stack?.share).toBeCloseTo(30 / 100);
  });

  test('totals every series, not only the ones below the cursor', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 0);

    expect(nonEmptyState(trace).text.stack?.value).toBe(TOTALS[0]);
  });

  test('describes the range of the stack, not only of the tallest band', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    const stats = trace.description.stats;
    expect(stats).toContainEqual({ label: 'Minimum total', value: 15 });
    expect(stats).toContainEqual({ label: 'Maximum total', value: 100 });
  });

  test('matches series by x value rather than by column index', () => {
    // `Services` starts a quarter late. Indexing by column would add its Q2
    // value to the Q1 column and announce 30 as the Q1 stack height.
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, LATE_START]),
    ) as AreaTrace;
    moveToColumn(trace, 0);

    expect(nonEmptyState(trace).text.stack?.value).toBe(10);
  });

  test('reports the total for the x the cursor is actually on, in a short series', () => {
    // A series that starts late holds its own points at its own column
    // indices: `LATE_START[0]` is Q2, not Q1. Looking the total up by column
    // index rather than by x therefore reports Q1's total while the cursor
    // sits on Q2 — and, worse than being wrong, it yields a share above 100%,
    // which no stacked chart can draw.
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, LATE_START]),
    ) as AreaTrace;
    trace.moveToIndex(1, 0);

    const { text } = nonEmptyState(trace);
    expect(text.main.value).toBe('Q2');
    expect(text.cross.value).toBe(20);
    expect(text.stack?.value).toBe(TOTALS[1]);
    expect(text.stack?.share).toBeCloseTo(20 / 40);
  });

  test('totals an x that the first series does not carry at all', () => {
    // The reference series stops at Q2 while another runs to Q3. Building the
    // totals from the first series alone leaves Q3 with no total, so the
    // cursor lands on a real point and hears nothing about the stack it is in.
    const short: LinePoint[] = [
      { x: 'Q1', y: 10, z: 'Subscriptions' },
      { x: 'Q2', y: 20, z: 'Subscriptions' },
    ];
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [short, LATE_START]),
    ) as AreaTrace;
    trace.moveToIndex(1, 1);

    const { text } = nonEmptyState(trace);
    expect(text.main.value).toBe('Q3');
    expect(text.stack?.value).toBe(70);
  });

  test('stays silent about the share when the total is zero', () => {
    const positive: LinePoint[] = [{ x: 'Q1', y: 5, z: 'Inflow' }];
    const negative: LinePoint[] = [{ x: 'Q1', y: -5, z: 'Outflow' }];
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [positive, negative]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    const { text } = nonEmptyState(trace);
    expect(text.stack?.value).toBe(0);
    // 5 / 0 is Infinity; announcing "Infinity% of it" is worse than silence.
    expect(text.stack?.share).toBeUndefined();
  });
});
