import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { DivergingTrace } from '@model/diverging';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Three age bands, men left and women right, as the chart draws them.
 *
 * The left-hand values are negative because that is what a producer emits for
 * a chart with a mirrored baseline. Every magnitude is distinct and the
 * largest bar is on the *left*, which is the arrangement that exposes a
 * reading that took the sign for a magnitude: the biggest bar would be the
 * lowest note.
 *
 * Band `45-64` is the one where the two sides differ, so a balance of zero and
 * a balance in either direction are all present.
 */
const BANDS: SegmentedPoint[][] = [
  [
    { x: '0-24', y: -1200, z: 'Men' },
    { x: '25-44', y: -900, z: 'Men' },
    { x: '45-64', y: -700, z: 'Men' },
  ],
  [
    { x: '0-24', y: 1200, z: 'Women' },
    { x: '25-44', y: 950, z: 'Women' },
    { x: '45-64', y: 800, z: 'Women' },
  ],
];

/**
 * Create a minimal diverging bar layer for model-only tests.
 * @param data The sides the layer carries
 * @returns Diverging bar layer definition
 */
function createLayer(data: SegmentedPoint[][] = BANDS): MaidrLayer {
  return {
    id: 'test-diverging-layer',
    type: TraceType.DIVERGING,
    title: 'Population by age band',
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Age band' }, y: { label: 'People' }, z: { label: 'Sex' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: DivergingTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a diverging trace positioned on one band of one side.
 * @param row Which side; the last row is the balance the parent appends
 * @param col Which band
 * @param data The sides the layer carries
 * @returns The positioned trace
 */
function diverging(
  row = 0,
  col = 0,
  data: SegmentedPoint[][] = BANDS,
): DivergingTrace {
  const trace = TraceFactory.create(createLayer(data)) as DivergingTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * Where a state's pitch sits within the range it was given, 0 to 1.
 * @param state The trace state to read
 * @returns The relative pitch
 */
function pitch(state: NonEmptyTraceState): number {
  const { min, max, raw } = state.audio.freq;
  return (Number(raw) - min) / (max - min);
}

describe('diverging registration', () => {
  test('the factory builds a DivergingTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(DivergingTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(diverging().description.chartType).toBe('Diverging Bar Chart');
    expect(nonEmptyState(diverging()).plotType).toBe('diverging bar');
  });
});

describe('the sign is a direction, not a magnitude', () => {
  test('a left-hand bar is pitched by its size', () => {
    // The largest bar in the chart is on the left. Pitched as a signed value
    // it would be the LOWEST note -- a cohort of 1,200 men sounding smaller
    // than a cohort of 800 women.
    const { audio } = nonEmptyState(diverging(0, 0));

    expect(audio.freq.raw).toBe(1200);
    expect(audio.freq.min).toBe(0);
  });

  test('equal cohorts on opposite sides sound the same', () => {
    // Band `0-24` has 1,200 either way, and the two have to be
    // indistinguishable by pitch or the chart cannot be compared across its
    // own baseline.
    expect(pitch(nonEmptyState(diverging(0, 0))))
      .toBeCloseTo(pitch(nonEmptyState(diverging(1, 0))));
  });

  test('a bigger bar is a higher note whichever side it is on', () => {
    const bigLeft = pitch(nonEmptyState(diverging(0, 0)));
    const smallLeft = pitch(nonEmptyState(diverging(0, 2)));
    const smallRight = pitch(nonEmptyState(diverging(1, 2)));

    expect(bigLeft).toBeGreaterThan(smallLeft);
    expect(smallRight).toBeGreaterThan(smallLeft);
  });

  test('the announcement gives the size and the side, not a minus sign', () => {
    // A reader hearing "-1200" has to strip a sign that says which side they
    // are on, which the label beside it already said.
    const { text } = nonEmptyState(diverging(0, 0));

    expect(text.cross.value).toBe(1200);
    expect(text.z).toEqual({ label: 'Sex', value: 'Men' });
  });

  test('an unnamed side is named by the way it grows', () => {
    // Better than leaving the sign as the only clue, which is exactly what
    // this trace removes from the announcement.
    const unnamed: SegmentedPoint[][] = [
      [{ x: 'a', y: -5, z: '' }, { x: 'b', y: -3, z: '' }],
      [{ x: 'a', y: 4, z: '' }, { x: 'b', y: 6, z: '' }],
    ];

    expect(nonEmptyState(diverging(0, 0, unnamed)).text.z?.value).toBe('left');
    expect(nonEmptyState(diverging(1, 0, unnamed)).text.z?.value).toBe('right');
  });
});

describe('a chart drawn with its bands down the page', () => {
  /**
   * The same pyramid, horizontal. A bar layer carries its value on `x` and
   * its category on `y` when the orientation is horizontal -- the pair
   * `toBarValue` reads -- so the point fields swap, not the announcement.
   */
  const HORIZONTAL: SegmentedPoint[][] = BANDS.map(side =>
    side.map(point => ({ x: point.y, y: point.x, z: point.z })));

  /**
   * Build a horizontal diverging trace.
   * @param row Which side
   * @param col Which band
   * @returns The positioned trace
   */
  function horizontal(row: number, col: number): DivergingTrace {
    const trace = TraceFactory.create({
      ...createLayer(HORIZONTAL),
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'People' }, y: { label: 'Age band' }, z: { label: 'Sex' } },
    }) as DivergingTrace;
    trace.moveToIndex(row, col);
    return trace;
  }

  test('still announces the size and the side rather than a sign', () => {
    // The parent swaps which point field feeds `cross`, not which half of the
    // announcement carries the length -- so there is one slot to replace, and
    // this is the case that says whether the right one was chosen. A pyramid
    // is ordinarily drawn this way up, so getting it wrong here would be the
    // ordinary case rather than the exotic one.
    const { text } = nonEmptyState(horizontal(0, 0));

    expect(text.cross.label).toBe('People');
    expect(text.cross.value).toBe(1200);
    expect(text.main.value).toBe('0-24');
    expect(text.z?.value).toBe('Men');
  });

  test('still pitches by size', () => {
    const { audio } = nonEmptyState(horizontal(0, 0));

    expect(audio.freq.raw).toBe(1200);
    expect(audio.freq.min).toBe(0);
  });
});

describe('the balance row says which side is ahead', () => {
  /** The summary row the segmented bar appends, after the two sides. */
  const BALANCE_ROW = 2;

  test('names the side rather than reporting a signed total', () => {
    // Band `25-44`: 950 women against 900 men, so the balance is +50.
    // "Sum is 50" invites a reader to hear a total; the number is a lead.
    const { text } = nonEmptyState(diverging(BALANCE_ROW, 1));

    expect(text.cross.value).toBe(50);
    expect(text.z).toEqual({ label: 'Balance', value: 'Women ahead' });
  });

  test('names the other side when it leads', () => {
    const flipped: SegmentedPoint[][] = [
      [{ x: 'a', y: -900, z: 'Men' }],
      [{ x: 'a', y: 400, z: 'Women' }],
    ];

    // Row 2 is the balance the parent appends; rows 0 and 1 are the sides.
    expect(nonEmptyState(diverging(2, 0, flipped)).text.z)
      .toEqual({ label: 'Balance', value: 'Men ahead' });
  });

  test('says level rather than naming a winner at zero', () => {
    // Band `0-24` is 1,200 either way.
    expect(nonEmptyState(diverging(BALANCE_ROW, 0)).text.z)
      .toEqual({ label: 'Balance', value: 'level' });
  });

  test('a balance is pitched by its size like any other bar', () => {
    const { audio } = nonEmptyState(diverging(BALANCE_ROW, 1));

    expect(audio.freq.raw).toBe(50);
    expect(audio.freq.min).toBe(0);
  });
});

describe('the description totals each side', () => {
  test('reports a total per side, unsigned', () => {
    // The number a pyramid is captioned with, and the one a reader cannot
    // accumulate by ear across twenty age bands.
    const stats = diverging().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Men total')).toBe(2800);
    expect(read('Women total')).toBe(2950);
  });
});
