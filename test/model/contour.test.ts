import type { ContourPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ContourTrace } from '@model/contour';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Three nested iso-value curves over a field.
 *
 * The gaps are deliberately uneven: level 0.1 and 0.2 run close together on
 * the left of the field and far apart on the right, which is what a steep
 * slope and a plateau look like on the page. A reading that gave only the
 * curve's own coordinates could never recover that -- a curve knows nothing
 * about its neighbours.
 */
const CURVES: ContourPoint[][] = [
  [
    { x: 0, y: 0, level: 0.1 },
    { x: 5, y: 0, level: 0.1 },
    { x: 10, y: 0, level: 0.1 },
  ],
  [
    { x: 0, y: 1, level: 0.2 },
    { x: 5, y: 4, level: 0.2 },
    { x: 10, y: 8, level: 0.2 },
  ],
  [
    { x: 0, y: 3, level: 0.3 },
    { x: 5, y: 9, level: 0.3 },
    { x: 10, y: 18, level: 0.3 },
  ],
];

/**
 * Create a minimal contour layer for model-only tests.
 * @param data The curves the layer carries
 * @returns Contour layer definition
 */
function createLayer(data: ContourPoint[][] = CURVES): MaidrLayer {
  return {
    id: 'test-contour-layer',
    type: TraceType.CONTOUR,
    title: 'Density field',
    axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Density' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: ContourTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a contour trace positioned on one point of one curve.
 * @param row Which curve
 * @param col Which point along it
 * @param data The curves the layer carries
 * @returns The positioned trace
 */
function contour(
  row = 0,
  col = 0,
  data: ContourPoint[][] = CURVES,
): ContourTrace {
  const trace = TraceFactory.create(createLayer(data)) as ContourTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * Read a description stat by label.
 * @param label The stat to find
 * @param data The curves the layer carries
 * @returns Its value, or undefined
 */
function stat(label: string, data: ContourPoint[][] = CURVES): unknown {
  return contour(0, 0, data).description.stats.find(entry => entry.label === label)?.value;
}

describe('contour registration', () => {
  test('the factory builds a ContourTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(ContourTrace);
  });

  test('it names itself a contour rather than a line', () => {
    expect(contour().description.chartType).toBe('Contour Plot');
  });

  test('it walks a curve the way a line layer does', () => {
    expect(nonEmptyState(contour(1, 2)).text.main.value).toBe(10);
    expect(nonEmptyState(contour(1, 2)).text.cross.value).toBe(8);
  });
});

describe('the level is the value, not the name', () => {
  test('announces it on the field axis', () => {
    // Read as a line layer the level is a series label at best -- the curve
    // says where it runs and never what value it runs at, which is the first
    // thing anyone asks of a contour.
    expect(nonEmptyState(contour(1, 0)).text.z)
      .toEqual({ label: 'Density', value: 0.2 });
  });

  test('says the same level everywhere along one curve', () => {
    expect(nonEmptyState(contour(2, 0)).text.z?.value).toBe(0.3);
    expect(nonEmptyState(contour(2, 2)).text.z?.value).toBe(0.3);
  });

  test('reads the level from whichever point declares it', () => {
    const sparse: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 5 }, { x: 1, y: 0 }],
      [{ x: 0, y: 2 }, { x: 1, y: 2, level: 9 }],
    ];

    expect(nonEmptyState(contour(0, 1, sparse)).text.z?.value).toBe(5);
    expect(nonEmptyState(contour(1, 0, sparse)).text.z?.value).toBe(9);
  });

  test('says nothing when the layer declares no level', () => {
    const bare: ContourPoint[][] = [
      [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    ];

    expect(nonEmptyState(contour(0, 0, bare)).text.z).toBeUndefined();
  });
});

describe('spacing is the gradient', () => {
  test('announces the gap to the nearest adjacent level', () => {
    // At x = 0 the 0.1 and 0.2 curves are one unit apart -- a cliff.
    expect(nonEmptyState(contour(0, 0)).text.asides)
      .toEqual([{ label: 'Spacing', value: '1' }]);
  });

  test('the gap widens where the field flattens', () => {
    // At x = 10 the gap has opened to 6.4 from 1 at x = 0 -- a plateau where
    // there was a cliff. The curve's own coordinates say nothing about this;
    // it is a fact about the gap between curves, and it is the whole of what
    // contour density conveys.
    //
    // 6.4 rather than 8, and that is the point: the nearest point on the
    // neighbouring curve is its (5, 4) vertex, not the (10, 8) one sharing
    // this index. Pairing by index would measure between two places that are
    // not opposite each other.
    expect(nonEmptyState(contour(0, 2)).text.asides)
      .toEqual([{ label: 'Spacing', value: '6.40312423743' }]);
  });

  test('takes the nearer neighbour when there are two', () => {
    // The middle curve at x = 0 sits one unit from the 0.1 curve and two from
    // the 0.3 curve. A reader looking at that point sees the tighter gap.
    expect(nonEmptyState(contour(1, 0)).text.asides)
      .toEqual([{ label: 'Spacing', value: '1' }]);
  });

  test('says nothing on a chart with one curve', () => {
    const alone: ContourPoint[][] = [[{ x: 0, y: 0, level: 1 }]];

    expect(nonEmptyState(contour(0, 0, alone)).text.asides).toBeUndefined();
  });
});

describe('the description answers what a curve cannot', () => {
  test('counts and names the levels', () => {
    expect(stat('Number of levels')).toBe(3);
    expect(stat('Levels')).toBe('0.1, 0.2, 0.3');
  });

  test('names a uniform step, which is what makes spacing a slope', () => {
    // Equal value between curves means the distance between them IS the
    // gradient. Without that, spacing is only a distance.
    expect(stat('Level step')).toBe(0.1);
  });

  test('names a varying step as varying rather than averaging it', () => {
    // An averaged step would let a reader treat spacing as a slope on a
    // chart where it is not one.
    const uneven: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 1 }],
      [{ x: 0, y: 1, level: 2 }],
      [{ x: 0, y: 2, level: 8 }],
    ];

    expect(stat('Level step', uneven)).toBe('varies');
  });

  test('finds where the levels run closest together', () => {
    // Where the lines crowd on the page, which is where the field changes
    // fastest -- and which a reader walking one curve cannot find, because
    // the finding is about the gap between curves.
    expect(stat('Closest approach between levels')).toBe('1 at X 0, Y 0');
  });
});
