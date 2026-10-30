import type { AbstractTrace } from '@model/abstract';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, NonEmptyTraceState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * The register a multi-series line-family layer is heard on.
 *
 * Every series of a line chart is drawn against one value axis, so every
 * series is pitched against one range: the lowest and the highest measured
 * value of the layer. Each series was pitched against its own range, so a
 * smaller value on one line could sound higher than a larger value on
 * another, and unequal values on two lines played the same note.
 *
 * The two series are the Plotly multi-line example's: Series A runs from 10
 * to 25 and Series B from 5 to 20.
 */
const SERIES_A = [10, 15, 13, 17, 22, 19, 25];
const SERIES_B = [16, 5, 11, 9, 14, 20, 12];

/**
 * The two series as points of one layer.
 * @returns One row per series
 */
function rows(): LinePoint[][] {
  return [
    SERIES_A.map((y, x) => ({ x: x + 1, y, z: 'Series A' })),
    SERIES_B.map((y, x) => ({ x: x + 1, y, z: 'Series B' })),
  ];
}

/**
 * A layer of one type over the given rows.
 * @param type - The layer type
 * @param data - The series
 * @returns The layer definition
 */
function layer(type: TraceType, data: LinePoint[][] = rows()): MaidrLayer {
  return {
    id: `shared-scale-${type}`,
    type,
    title: 'Weekly sales',
    axes: { x: { label: 'Week' }, y: { label: 'Sales' } },
    data,
  };
}

/**
 * The trace a layer builds, with its state readable at any cell.
 * @param source - The layer
 * @returns The trace
 */
function build(source: MaidrLayer): AbstractTrace {
  return TraceFactory.create(source) as unknown as AbstractTrace;
}

/**
 * The state at a cell, asserting it is a populated one.
 * @param trace - The trace
 * @param row - The series
 * @param col - The point along it
 * @returns The non-empty state
 */
function stateAt(trace: AbstractTrace, row: number, col: number): NonEmptyTraceState {
  const state: TraceState = trace.getStateAt(row, col);
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Where a tone sits in its register, from 0 (the bottom note) to 1 (the top
 * note), as the audio service maps it.
 * @param freq - The tone's frequency state
 * @returns The position in the register
 */
function placeOf(freq: AudioState['freq']): number {
  const raw = Array.isArray(freq.raw) ? freq.raw[1] : freq.raw;
  return (raw - freq.min) / (freq.max - freq.min);
}

/** Two classifiers' precision-recall curves, which meet at the baseline. */
const PR_LAYER: MaidrLayer = {
  id: 'pr',
  type: TraceType.PR_CURVE,
  axes: { x: { label: 'Recall' }, y: { label: 'Precision' } },
  data: [
    [{ x: 1, y: 0.3, z: 'Logistic' }, { x: 0.8, y: 0.7, z: 'Logistic' }, { x: 0, y: 1, z: 'Logistic' }],
    [{ x: 1, y: 0.3, z: 'Forest' }, { x: 0.6, y: 0.56, z: 'Forest' }, { x: 0, y: 1, z: 'Forest' }],
  ],
};

/** Three competitors' ranks over two periods. */
const RANKS: LinePoint[][] = [
  [{ x: 1, y: 1, z: 'Ash' }, { x: 2, y: 2, z: 'Ash' }],
  [{ x: 1, y: 2, z: 'Birch' }, { x: 2, y: 3, z: 'Birch' }],
  [{ x: 1, y: 3, z: 'Cyan' }, { x: 2, y: 1, z: 'Cyan' }],
];

/** Every type that pitches its series as a line does. */
const LINE_FAMILY: TraceType[] = [
  TraceType.LINE,
  TraceType.AREA,
  TraceType.STACKED_AREA,
  TraceType.NORMALIZED_AREA,
  TraceType.STEP,
  TraceType.SURVIVAL,
  TraceType.RADAR,
  TraceType.POLAR_AREA,
  TraceType.SMOOTH,
  TraceType.CONTOUR,
];

describe('the series of a line-family layer share one register', () => {
  test.each(LINE_FAMILY)('%s pitches every series against the layer\'s range', (type) => {
    const trace = build(layer(type));

    const onA = stateAt(trace, 0, 0).audio.freq;
    const onB = stateAt(trace, 1, 1).audio.freq;

    expect([onA.min, onA.max]).toEqual([5, 25]);
    expect([onB.min, onB.max]).toEqual([5, 25]);
  });

  test.each(LINE_FAMILY)('%s sounds a larger value higher, whichever series it is on', (type) => {
    const trace = build(layer(type));

    // Series B's 16 at week 1 is below Series A's 17 at week 4. Each on its
    // own range, B's 16 sat 73% of the way up its register and A's 17 47%.
    const sixteen = placeOf(stateAt(trace, 1, 0).audio.freq);
    const seventeen = placeOf(stateAt(trace, 0, 3).audio.freq);

    expect(sixteen).toBeLessThan(seventeen);
  });

  test.each(LINE_FAMILY)('%s plays only the layer\'s lowest value at the bottom note', (type) => {
    const trace = build(layer(type));

    // Series A's 10 and Series B's 5 are both their own series' lowest
    // value, and both played the bottom note.
    const ten = placeOf(stateAt(trace, 0, 0).audio.freq);
    const five = placeOf(stateAt(trace, 1, 1).audio.freq);

    expect(five).toBe(0);
    expect(ten).toBeCloseTo(0.25);
  });

  test('a bump chart keeps its inverted register over the whole table', () => {
    const trace = build(layer(TraceType.BUMP, RANKS));

    const { min, max } = stateAt(trace, 1, 0).audio.freq;

    expect([min, max]).toEqual([3, 1]);
  });

  test('[ and ] still jump to the extremes of the series the cursor is on', () => {
    const trace = build(layer(TraceType.LINE));
    trace.moveToIndex(1, 0);

    const targets = trace.getExtremaTargets();

    expect(targets.find(target => target.type === 'max')?.value).toBe(20);
    expect(targets.find(target => target.type === 'min')?.value).toBe(5);
  });
});

describe('the chord at a point several series share', () => {
  test('is inverted on a bump chart, as the single tone at the same cell is', () => {
    // Ash and Birch tie for first in period 1, so they share a point there.
    const tied: LinePoint[][] = [
      [{ x: 1, y: 1, z: 'Ash' }, { x: 2, y: 2, z: 'Ash' }],
      [{ x: 1, y: 1, z: 'Birch' }, { x: 2, y: 3, z: 'Birch' }],
      [{ x: 1, y: 3, z: 'Cyan' }, { x: 2, y: 1, z: 'Cyan' }],
    ];
    const trace = build(layer(TraceType.BUMP, tied));

    const state = stateAt(trace, 0, 0);

    expect(state.audio.freq).toEqual({ min: 3, max: 1, raw: 1 });
    expect(state.intersections?.map(tone => tone.freq)).toEqual([
      { min: 3, max: 1, raw: 1 },
      { min: 3, max: 1, raw: 1 },
    ]);
  });

  test('sounds every tone on the layer\'s register', () => {
    // The two lines meet at (1, 1). Each on its own range, the 1 was the top
    // of the first line's register and the bottom of the second's.
    const trace = build(layer(TraceType.LINE, [
      [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
    ]));

    const state = stateAt(trace, 0, 1);

    expect(state.intersections?.map(tone => tone.freq)).toEqual([
      { min: 0, max: 2, raw: 1 },
      { min: 0, max: 2, raw: 1 },
    ]);
  });

  test('sounds a precision-recall curve\'s shared point on the unit interval its tones use', () => {
    // Both classifiers start at the baseline, a recall of 1 at a precision of
    // 0.3. Their tones are on the unit interval; the chord was on each
    // curve's own range, so it played the baseline as the bottom note.
    const trace = build(PR_LAYER);

    const state = stateAt(trace, 0, 0);

    expect(state.audio.freq).toEqual({ min: 0, max: 1, raw: 0.3 });
    expect(state.intersections?.map(tone => tone.freq)).toEqual([
      { min: 0, max: 1, raw: 0.3 },
      { min: 0, max: 1, raw: 0.3 },
    ]);
  });
});

describe('the series of a line-family layer share one braille range', () => {
  test.each(LINE_FAMILY)('%s encodes every row against the layer\'s range', (type) => {
    const { braille } = stateAt(build(layer(type)), 1, 1);

    // Each row against its own range was [10, 5] to [25, 20].
    expect(braille).toMatchObject({ min: [5, 5], max: [25, 25] });
  });

  test('a precision-recall curve encodes every row on the unit interval its pitch uses', () => {
    const { braille } = stateAt(build(PR_LAYER), 0, 0);

    expect(braille).toMatchObject({ min: [0, 0], max: [1, 1] });
  });

  test('a bump chart encodes the ranks of the whole table, as literal ranks', () => {
    // The pitch is inverted so first place is the highest note; the braille
    // stays literal, rank 1 the lowest dot, on every row alike.
    const { braille } = stateAt(build(layer(TraceType.BUMP, RANKS)), 0, 0);

    expect(braille).toMatchObject({ min: [1, 1, 1], max: [3, 3, 3] });
  });
});
