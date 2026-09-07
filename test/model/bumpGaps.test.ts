import type { BumpTrace } from '@model/bump';
import type { NotificationService } from '@service/notification';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * A bump chart where a competitor has no rank for a period (#925).
 *
 * A rank that was never measured arrives as `null` and is held as `NaN`. The
 * move into or out of such a period is `NaN` too, and `NaN` is not
 * `undefined`: the text saw a move where there was none to report, and read
 * it out as "Change is missing" -- on the gap and again on the first
 * measured period after it. The rotor gate had the same blind spot, offering
 * "Rank gained" and "Rank lost" on a table whose only non-zero moves were
 * gaps.
 */

/** Two competitors who miss R2 and otherwise never move. */
const FROZEN_WITH_GAP: LinePoint[][] = [
  [
    { x: 'R1', y: 1, z: 'Ash' },
    { x: 'R2', y: null, z: 'Ash' },
    { x: 'R3', y: 1, z: 'Ash' },
  ],
  [
    { x: 'R1', y: 2, z: 'Birch' },
    { x: 'R2', y: null, z: 'Birch' },
    { x: 'R3', y: 2, z: 'Birch' },
  ],
];

/** The same two, swapping places across the round neither was ranked in. */
const SWAP_ACROSS_GAP: LinePoint[][] = [
  [
    { x: 'R1', y: 1, z: 'Ash' },
    { x: 'R2', y: null, z: 'Ash' },
    { x: 'R3', y: 2, z: 'Ash' },
    { x: 'R4', y: 1, z: 'Ash' },
  ],
  [
    { x: 'R1', y: 2, z: 'Birch' },
    { x: 'R2', y: null, z: 'Birch' },
    { x: 'R3', y: 1, z: 'Birch' },
    { x: 'R4', y: 2, z: 'Birch' },
  ],
];

function createLayer(data: LinePoint[][]): MaidrLayer {
  return {
    id: 'test-bump-gaps',
    type: TraceType.BUMP,
    title: 'League table',
    axes: { x: { label: 'Round' }, y: { label: 'Rank' } },
    data,
  };
}

function bump(data: LinePoint[][], row: number, col: number): BumpTrace {
  const trace = TraceFactory.create(createLayer(data)) as BumpTrace;
  trace.moveToIndex(row, col);
  return trace;
}

function nonEmptyState(trace: BumpTrace): NonEmptyTraceState {
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

describe('a period the competitor was not ranked in', () => {
  test('reports no move, since there is no rank to have moved', () => {
    const trace = bump(SWAP_ACROSS_GAP, 0, 1);

    expect(nonEmptyState(trace).text.stack).toBeUndefined();
    expect(announce(trace.state)).toBe('Round is R2, Rank is missing, Competitor is Ash');
  });

  test('the first ranked period after it reports no move either', () => {
    // There is no previous rank to compare against, which is the first
    // period's situation exactly, and it is read the same way.
    const trace = bump(SWAP_ACROSS_GAP, 0, 2);

    expect(nonEmptyState(trace).text.stack).toBeUndefined();
    expect(announce(trace.state)).toBe('Round is R3, Rank is 2, Competitor is Ash');
  });

  test('a move between two ranked periods is still reported', () => {
    expect(nonEmptyState(bump(SWAP_ACROSS_GAP, 0, 3)).text.stack)
      .toEqual({ label: 'Places gained', value: 1 });
  });
});

describe('the description across a gap', () => {
  /**
   * Ash is not ranked in R1 at all, and is the FIRST row on purpose.
   *
   * A gap is `NaN`, not `undefined`, so a guard written for the missing
   * column let it through -- and `NaN` then loses every later comparison, so
   * row zero won the period outright and stayed won. The chart says Birch led
   * R1; the description named the competitor who was not in it.
   */
  const LATE_START: LinePoint[][] = [
    [
      { x: 'R1', y: null, z: 'Ash' },
      { x: 'R2', y: 2, z: 'Ash' },
      { x: 'R3', y: 1, z: 'Ash' },
    ],
    [
      { x: 'R1', y: 1, z: 'Birch' },
      { x: 'R2', y: 1, z: 'Birch' },
      { x: 'R3', y: 2, z: 'Birch' },
    ],
  ];

  /**
   * Read a description stat by label.
   * @param data The competitors the layer carries
   * @param label The stat to find
   * @returns Its value, or undefined
   */
  function read(data: LinePoint[][], label: string): unknown {
    return bump(data, 0, 0).description.stats.find(stat => stat.label === label)?.value;
  }

  test('the leader of a period is one of the competitors ranked in it', () => {
    expect(read(LATE_START, 'Led at the start')).toBe('Birch');
    expect(read(LATE_START, 'Led at the end')).toBe('Ash');
  });

  test('names no leader for a period nobody was ranked in', () => {
    // Inventing one out of a column of gaps is the failure above; the honest
    // answer is to say nothing, as the rest of the dialog does for a fact the
    // layer does not carry.
    const unranked: LinePoint[][] = [
      [{ x: 'R1', y: null, z: 'Ash' }, { x: 'R2', y: 1, z: 'Ash' }],
      [{ x: 'R1', y: null, z: 'Birch' }, { x: 'R2', y: 2, z: 'Birch' }],
    ];

    expect(read(unranked, 'Led at the start')).toBeUndefined();
    expect(read(unranked, 'Led at the end')).toBe('Ash');
  });

  test('a competitor who joined late is still measured over the rounds it ran', () => {
    // Ash goes 2nd to 1st over the rounds it was ranked in, which is the
    // biggest climb on the chart. Subtracting across the gap gave NaN, and
    // NaN fails both comparisons rather than one -- so the competitor was
    // dropped from the climb and the fall alike, silently.
    expect(read(LATE_START, 'Climbed furthest')).toBe('Ash, 1 place');
    expect(read(LATE_START, 'Fell furthest')).toBe('Birch, 1 place');
  });

  test('a competitor ranked in one period only has no move to report', () => {
    const once: LinePoint[][] = [
      [{ x: 'R1', y: null, z: 'Ash' }, { x: 'R2', y: 1, z: 'Ash' }],
      [{ x: 'R1', y: 2, z: 'Birch' }, { x: 'R2', y: 2, z: 'Birch' }],
    ];

    expect(read(once, 'Climbed furthest')).toBeUndefined();
    expect(read(once, 'Fell furthest')).toBeUndefined();
  });
});

describe('the rotor across a gap', () => {
  test('offers nothing on a table where no measured rank ever moved', () => {
    expect(bump(FROZEN_WITH_GAP, 0, 0).getRotorFilterUnits()).toEqual([]);
  });

  test('does not stop on the gap or on the period after it', () => {
    // Ash's only gain is into R4. From R1, the gap at R2 and the return at
    // R3 are not moves, so the filter has to pass over both.
    const trace = bump(SWAP_ACROSS_GAP, 0, 0);

    expect(trace.moveToRotorFilter('gained', 'right')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('R4');
  });
});
