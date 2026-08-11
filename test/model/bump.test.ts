import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { BumpTrace } from '@model/bump';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Four teams over four rounds.
 *
 * Ash starts first and finishes last while Cyan does the reverse, so a reading
 * that lost the inversion cannot coincide with the right answer. Birch holds
 * second throughout, which is the case a "no change" report has to distinguish
 * from the first round's absence of one.
 */
const TABLE: LinePoint[][] = [
  [
    { x: 'R1', y: 1, z: 'Ash' },
    { x: 'R2', y: 2, z: 'Ash' },
    { x: 'R3', y: 3, z: 'Ash' },
    { x: 'R4', y: 4, z: 'Ash' },
  ],
  [
    { x: 'R1', y: 2, z: 'Birch' },
    { x: 'R2', y: 3, z: 'Birch' },
    { x: 'R3', y: 2, z: 'Birch' },
    { x: 'R4', y: 2, z: 'Birch' },
  ],
  [
    { x: 'R1', y: 3, z: 'Cedar' },
    { x: 'R2', y: 1, z: 'Cedar' },
    { x: 'R3', y: 4, z: 'Cedar' },
    { x: 'R4', y: 3, z: 'Cedar' },
  ],
  [
    { x: 'R1', y: 4, z: 'Cyan' },
    { x: 'R2', y: 4, z: 'Cyan' },
    { x: 'R3', y: 1, z: 'Cyan' },
    { x: 'R4', y: 1, z: 'Cyan' },
  ],
];

/**
 * Create a minimal bump layer for model-only tests.
 * @param data The competitors the layer carries
 * @returns Bump layer definition
 */
function createLayer(data: LinePoint[][] = TABLE): MaidrLayer {
  return {
    id: 'test-bump-layer',
    type: TraceType.BUMP,
    title: 'League table',
    axes: { x: { label: 'Round' }, y: { label: 'Rank' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: BumpTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a bump trace positioned on one round of one competitor.
 * @param row Which competitor
 * @param col Which round
 * @param data The competitors the layer carries
 * @returns The positioned trace
 */
function bump(row = 0, col = 0, data: LinePoint[][] = TABLE): BumpTrace {
  const trace = TraceFactory.create(createLayer(data)) as BumpTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * The pitch the audio service will compute, from 0 (lowest) to 1 (highest).
 *
 * The service interpolates `raw` between `min` and `max`, and this chart hands
 * it those the other way round -- so asserting on `raw` alone would pass for a
 * trace that had not inverted anything.
 * @param state The trace state to read
 * @returns The relative pitch
 */
function pitch(state: NonEmptyTraceState): number {
  const { min, max, raw } = state.audio.freq;
  return (Number(raw) - min) / (max - min);
}

describe('bump registration', () => {
  test('the factory builds a BumpTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(BumpTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(bump().description.chartType).toBe('Bump Chart');
    expect(nonEmptyState(bump()).plotType).toBe('bump');
  });
});

describe('first place is the highest note', () => {
  test('the pitch runs opposite to the rank number', () => {
    // Rank 1 is the best position and the smallest number. Sonified as a
    // magnitude, the leader would be the lowest note in the chart.
    expect(pitch(nonEmptyState(bump(0, 0)))).toBeCloseTo(1);
    expect(pitch(nonEmptyState(bump(3, 0)))).toBeCloseTo(0);
  });

  test('the bounds are handed over inverted', () => {
    const { freq } = nonEmptyState(bump(0, 0)).audio;

    expect(freq.min).toBe(4);
    expect(freq.max).toBe(1);
    expect(freq.raw).toBe(1);
  });

  test('a competitor falling down the table falls in pitch', () => {
    // Ash goes 1st, 2nd, 3rd, 4th. Every step has to sound like a step down.
    const rounds = [0, 1, 2, 3].map(col => pitch(nonEmptyState(bump(0, col))));

    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i]).toBeLessThan(rounds[i - 1]);
    }
  });

  test('every competitor is scaled against the same table', () => {
    // Per-row bounds would make each competitor's own best round the highest
    // note, whether that was first place or fourth.
    const ash = nonEmptyState(bump(0, 0)).audio.freq;
    const cyan = nonEmptyState(bump(3, 0)).audio.freq;

    expect([ash.min, ash.max]).toEqual([cyan.min, cyan.max]);
  });
});

describe('the move travels with the rank', () => {
  test('a gain is named a gain rather than signed', () => {
    // Cedar goes 3rd to 1st between R1 and R2.
    const { text } = nonEmptyState(bump(2, 1));

    expect(text.cross.value).toBe(1);
    expect(text.stack).toEqual({ label: 'Places gained', value: 2 });
  });

  test('a loss is named a loss', () => {
    // Cedar goes 1st to 4th between R2 and R3.
    expect(nonEmptyState(bump(2, 2)).text.stack)
      .toEqual({ label: 'Places lost', value: 3 });
  });

  test('holding a position reports no change rather than staying silent', () => {
    // Birch holds 2nd between R3 and R4. Silence here is indistinguishable
    // from the first round, which has nothing to compare against at all.
    expect(nonEmptyState(bump(1, 3)).text.stack)
      .toEqual({ label: 'Change', value: 0 });
  });

  test('the first period reports no move, because there is none to report', () => {
    // Saying "no change" would claim a stability the chart does not.
    expect(nonEmptyState(bump(0, 0)).text.stack).toBeUndefined();
  });
});

describe('the rotor jumps between overtakes', () => {
  test('offers a gained and a lost unit', () => {
    expect(bump().getRotorFilterUnits().map(unit => unit.key))
      .toEqual(['gained', 'lost']);
  });

  test('offers nothing on a chart where no rank ever moved', () => {
    // Cycling onto a mode whose only possible answer is "none found" is worse
    // than not offering it.
    const frozen: LinePoint[][] = [
      [{ x: 'R1', y: 1 }, { x: 'R2', y: 1 }],
      [{ x: 'R1', y: 2 }, { x: 'R2', y: 2 }],
    ];

    expect(bump(0, 0, frozen).getRotorFilterUnits()).toEqual([]);
  });

  test('skips the rounds where this competitor held its place', () => {
    // Cyan holds 4th into R2, then gains 3 into R3. From R1 the next gain is
    // R3, not R2.
    const trace = bump(3, 0);

    expect(trace.moveToRotorFilter('gained', 'right')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('R3');
  });

  test('finds nothing past the last move and reports the bound', () => {
    const trace = bump(3, 3);

    expect(trace.moveToRotorFilter('gained', 'right')).toBe(false);
  });

  test('a loss filter does not stop on a gain', () => {
    // Cedar gains into R2 and loses into R3. Asked for a loss from R1, it has
    // to pass over the gain.
    const trace = bump(2, 0);

    expect(trace.moveToRotorFilter('lost', 'right')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('R3');
  });

  test('searches backwards too', () => {
    const trace = bump(0, 3);

    expect(trace.moveToRotorFilter('lost', 'left')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('R3');
  });
});

describe('the description says who moved', () => {
  const read = (label: string): unknown =>
    bump().description.stats.find(stat => stat.label === label)?.value;

  test('names the leader at each end', () => {
    expect(read('Led at the start')).toBe('Ash');
    expect(read('Led at the end')).toBe('Cyan');
  });

  test('names the biggest climb and the biggest fall separately', () => {
    // Cyan goes 4th to 1st and Ash goes 1st to 4th, so the two are the same
    // size -- which is the ordinary case, since ranks are a permutation and
    // somebody's gain is somebody else's loss. Reporting only the larger
    // would silently drop one of the two findings on exactly those charts.
    expect(read('Climbed furthest')).toBe('Cyan, 3');
    expect(read('Fell furthest')).toBe('Ash, 3');
  });

  test('reports no climb on a chart where every rank fell or held', () => {
    // Naming whoever moved least would announce a rise the chart does not
    // contain.
    const sinking: LinePoint[][] = [
      [{ x: 'R1', y: 1, z: 'Ash' }, { x: 'R2', y: 2, z: 'Ash' }],
      [{ x: 'R1', y: 2, z: 'Birch' }, { x: 'R2', y: 2, z: 'Birch' }],
    ];
    const stats = bump(0, 0, sinking).description.stats;

    expect(stats.find(stat => stat.label === 'Climbed furthest')).toBeUndefined();
    expect(stats.find(stat => stat.label === 'Fell furthest')?.value)
      .toBe('Ash, 1');
  });

  test('drops the layer-wide min and max, which say nothing on a rank axis', () => {
    // "Somebody came first and somebody came last" is true of every bump
    // chart ever drawn.
    const labels = bump().description.stats.map(stat => stat.label);

    expect(labels).not.toContain('Min value');
    expect(labels).not.toContain('Max value');
  });

  test('counts competitors and periods, not lines and points', () => {
    const labels = bump().description.stats.map(stat => stat.label);

    expect(labels).toContain('Number of competitors');
    expect(labels).toContain('Periods');
    expect(labels).not.toContain('Number of lines');
  });
});
