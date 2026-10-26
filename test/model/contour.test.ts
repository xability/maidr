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
    expect(nonEmptyState(contour(1, 2)).text.cross?.value).toBe(8);
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
      .toEqual([{ label: 'Spacing', value: '1 to level 0.2' }]);
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
    //
    // Two decimals, the precision every other announcement is spoken at:
    // `withoutFloatNoise` trims binary noise, it does not round for a
    // listener, and this aside is spoken on every point of every curve.
    expect(nonEmptyState(contour(0, 2)).text.asides)
      .toEqual([{ label: 'Spacing', value: '6.4 to level 0.2' }]);
  });

  test('takes the nearer neighbour when there are two', () => {
    // The middle curve at x = 0 sits one unit from the 0.1 curve and two from
    // the 0.3 curve. A reader looking at that point sees the tighter gap.
    expect(nonEmptyState(contour(1, 0)).text.asides)
      .toEqual([{ label: 'Spacing', value: '1 to level 0.1' }]);
  });

  test('names which side the gap was measured to, because it changes', () => {
    // The same curve, two points apart: at x = 0 the nearer neighbour is the
    // 0.1 curve below, and by x = 10 it is the 0.3 curve above. A distance
    // announced without the level it was measured to would have the reader
    // comparing two numbers taken from opposite sides of the curve.
    expect(nonEmptyState(contour(1, 0)).text.asides?.[0].value)
      .toContain('to level 0.1');
    expect(nonEmptyState(contour(1, 2)).text.asides?.[0].value)
      .toContain('to level 0.3');
  });

  test('says nothing on a chart with one curve', () => {
    const alone: ContourPoint[][] = [[{ x: 0, y: 0, level: 1 }]];

    expect(nonEmptyState(contour(0, 0, alone)).text.asides).toBeUndefined();
  });
});

/**
 * Three levels of a peak, each traced at its own x values, as a contour
 * tracer samples them: no two curves share an x, so a line chart's reading of
 * Up and Down -- another series at the same x -- finds nothing.
 */
const RINGS: ContourPoint[][] = [
  [{ x: 1, y: 5, level: 0.1 }, { x: 5, y: 9, level: 0.1 }, { x: 9, y: 5, level: 0.1 }],
  [{ x: 2.5, y: 6, level: 0.2 }, { x: 4.9, y: 7.5, level: 0.2 }, { x: 7.5, y: 5, level: 0.2 }],
  [{ x: 4, y: 4.5, level: 0.3 }, { x: 5.5, y: 6, level: 0.3 }, { x: 6, y: 5, level: 0.3 }],
];

/**
 * Where the reader is, as the x, y and level announced.
 * @param trace The trace to read
 * @returns The announced x, y and level
 */
function place(trace: ContourTrace): [unknown, unknown, unknown] {
  const { text } = nonEmptyState(trace);
  return [text.main.value, text.cross?.value, text.z?.value];
}

describe('up and down move between levels', () => {
  test('up goes to the nearest point of the next level up', () => {
    const trace = contour(0, 0, RINGS);

    const moved = trace.moveOnce('UPWARD');

    expect(moved).toBe(true);
    expect(place(trace)).toEqual([2.5, 6, 0.2]);
  });

  test('down goes to the nearest point of the next level down', () => {
    const trace = contour(2, 1, RINGS);

    const moved = trace.moveOnce('DOWNWARD');

    expect(moved).toBe(true);
    expect(place(trace)).toEqual([4.9, 7.5, 0.2]);
  });

  test('the nearest point is taken wherever the reader is on the curve', () => {
    const trace = contour(0, 2, RINGS);

    trace.moveOnce('UPWARD');

    expect(place(trace)).toEqual([7.5, 5, 0.2]);
  });

  test('the top and bottom levels are the edges', () => {
    expect(contour(2, 0, RINGS).moveOnce('UPWARD')).toBe(false);
    expect(contour(0, 0, RINGS).moveOnce('DOWNWARD')).toBe(false);
  });

  test('a level drawn as two islands is one level, reached at its nearer island', () => {
    const islands: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 1 }, { x: 10, y: 0, level: 1 }],
      [{ x: 1, y: 1, level: 2 }],
      [{ x: 9, y: 1, level: 2 }],
    ];
    const trace = contour(0, 1, islands);

    trace.moveOnce('UPWARD');

    expect(place(trace)).toEqual([9, 1, 2]);
    expect(trace.moveOnce('UPWARD')).toBe(false);
  });

  test('control and up goes to the highest level, and up from there is the edge', () => {
    // Inherited, the jump went to the top of the reader's column by point
    // index, here level 0.2, and Up then moved again.
    const trace = contour(0, 0, RINGS);

    trace.moveToExtreme('UPWARD');

    expect(place(trace)).toEqual([4, 4.5, 0.3]);
    expect(trace.moveOnce('UPWARD')).toBe(false);
  });

  test('control and down goes to the lowest level', () => {
    const trace = contour(2, 1, RINGS);

    trace.moveToExtreme('DOWNWARD');

    expect(place(trace)).toEqual([5, 9, 0.1]);
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
  });

  test('left and right still walk the curve', () => {
    const trace = contour(1, 0, RINGS);

    trace.moveOnce('FORWARD');

    expect(place(trace)).toEqual([4.9, 7.5, 0.2]);
  });
});

/**
 * Three levels, the lowest drawn as two islands, as a contour tracer emits a
 * level that closes in two places: two curves in a row carrying one number.
 * The second island lies nearer the first than the next level up does.
 */
const ISLANDS: ContourPoint[][] = [
  [{ x: 0, y: 0, level: 100 }, { x: 1, y: 0, level: 100 }],
  [{ x: 3, y: 0, level: 100 }],
  [{ x: 0, y: 4, level: 120 }, { x: 1, y: 4, level: 120 }, { x: 3, y: 5, level: 120 }],
  [{ x: 0, y: 6, level: 140 }],
];

describe('a level drawn as islands is one level', () => {
  test('the description counts it once', () => {
    // Counted as curves, this was "Number of levels: 4" over three levels.
    expect(stat('Number of levels', ISLANDS)).toBe(3);
  });

  test('the description names it once, and the levels lowest first', () => {
    const shuffled = [ISLANDS[3], ISLANDS[0], ISLANDS[2], ISLANDS[1]];

    expect(stat('Levels', ISLANDS)).toBe('100, 120, 140');
    expect(stat('Levels', shuffled)).toBe('100, 120, 140');
  });

  test('its points are counted over all its islands', () => {
    // 100 has three points over two islands of two and one, and 120 three.
    // Counted per curve, two levels of three points each read "1 to 3".
    const twoLevels: ContourPoint[][] = [ISLANDS[0], ISLANDS[1], ISLANDS[2]];

    expect(stat('Points per level', twoLevels)).toBe(3);
    expect(stat('Points per level', ISLANDS)).toBe('1 to 3');
  });

  test('the spacing is measured to the next level, not to another island', () => {
    // The second island of 100 is 3 away; level 120 is 4 away. Measured to
    // the curve emitted next, this said "3 to level 100" -- a gap inside one
    // level, announced as the gradient.
    expect(nonEmptyState(contour(0, 0, ISLANDS)).text.asides)
      .toEqual([{ label: 'Spacing', value: '4 to level 120' }]);
  });

  test('the widest separation is between two levels', () => {
    // The island at (3, 0) is 2 from its own level's other island and 4.47
    // from level 120, the nearest point of which is (1, 4).
    expect(stat('Widest separation between levels', ISLANDS)).toBe('4.47 at X 3, Y 0');
    expect(stat('Closest approach between levels', ISLANDS)).toBe('2 at X 0, Y 4');
  });

  test('one level drawn as islands has no range and no step', () => {
    const one: ContourPoint[][] = [ISLANDS[0], ISLANDS[1]];

    expect(stat('Number of levels', one)).toBe(1);
    expect(stat('Levels', one)).toBe('100');
    expect(stat('Level range', one)).toBeUndefined();
    expect(stat('Level step', one)).toBeUndefined();
  });

  test('a curve declaring no level is listed as a level of its own', () => {
    const bare: ContourPoint[][] = [ISLANDS[0], [{ x: 5, y: 5 }], ISLANDS[1]];

    expect(stat('Number of levels', bare)).toBe(2);
    expect(stat('Levels', bare)).toBe('100, Curve 2');
    expect(nonEmptyState(contour(1, 0, bare)).text.asides).toBeUndefined();
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

  test('states the level of a chart with a single curve', () => {
    // The one case the series list cannot carry: a layer with one curve has
    // no series to name, so an unstated level would leave the chart's only
    // number out of its description entirely.
    const alone: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 0.05 }, { x: 1, y: 1, level: 0.05 }],
    ];

    expect(stat('Level', alone)).toBe(0.05);
  });

  test('the value range it reports is the field\'s, not the drawing\'s', () => {
    // Inherited from the line layer, `Min value` and `Max value` are the min
    // and max of the curves' **y** vertices. Under those labels, beside a
    // column of levels, they answered "what does this field cover?" with the
    // height of the plot: this field runs 0.1 to 0.3 and they said 0 to 18.
    const labels = contour().description.stats.map(entry => entry.label);

    expect(labels).not.toContain('Min value');
    expect(labels).not.toContain('Max value');
    expect(stat('Minimum Y')).toBe(0);
    expect(stat('Maximum Y')).toBe(18);
    expect(stat('Level range')).toBe('0.1 to 0.3');
  });

  test('the step is measured over the levels, not the emission order', () => {
    // Nothing in the grammar makes a producer emit its curves in order, and
    // diffing them as they arrive turns an evenly spaced field into one whose
    // step "varies" -- withdrawing the licence to read spacing as gradient
    // from a chart that supports it.
    const shuffled: ContourPoint[][] = [
      [{ x: 0, y: 1, level: 0.2 }],
      [{ x: 0, y: 2, level: 0.3 }],
      [{ x: 0, y: 0, level: 0.1 }],
    ];

    expect(stat('Level step', shuffled)).toBe(0.1);
  });

  test('a level drawn as islands is not a step of zero', () => {
    // One level, two curves: the shape the class already handles for
    // highlighting. Diffed in place the repeated level gives a difference of
    // 0, and `Level step: 0` licenses reading every gap on the page as no
    // change in the field at all.
    const islands: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 0.5 }],
      [{ x: 9, y: 9, level: 0.5 }],
    ];

    expect(stat('Level step', islands)).toBeUndefined();
  });

  test('finds where the levels run widest apart, not only closest', () => {
    // The plateau to the cliff above it. Both come out of one scan the class
    // already runs, and the wide end is the half a reader walking a single
    // curve can least reconstruct.
    expect(stat('Widest separation between levels')).toBe('10 at X 10, Y 18');
  });

  test('does not name the same gap twice on a field with one gap in it', () => {
    const pair: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 1 }],
      [{ x: 1, y: 1, level: 2 }],
    ];

    // A square root is a dozen digits, and the service rounds numbers rather
    // than composed strings, so the stat the class exists for was the least
    // listenable line in the dialog.
    expect(stat('Closest approach between levels', pair)).toBe('1.41 at X 0, Y 0');
    expect(stat('Widest separation between levels', pair)).toBeUndefined();
  });

  test('does not measure a step across a curve that declares no level', () => {
    // 1 and 3 are two steps apart, not one. Reporting `2` here would be a
    // step measured over a gap the layer left undeclared, announced as
    // uniform -- which is the licence a reader needs to treat spacing as a
    // gradient, granted on a chart that does not support it.
    const gappy: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 1 }],
      [{ x: 0, y: 1 }],
      [{ x: 0, y: 2, level: 3 }],
    ];

    expect(stat('Level step', gappy)).toBeUndefined();
  });
});

describe('the description speaks of levels, not lines', () => {
  /**
   * Read the whole description of the default fixture.
   * @param data The curves the layer carries
   * @returns Its description state
   */
  function description(data: ContourPoint[][] = CURVES) {
    return contour(0, 0, data).description;
  }

  test('no stat calls a curve a line', () => {
    // Inherited from the line layer, the description opens "Number of lines,
    // Points per line, Line names: Line 1, Line 2, Line 3" -- the reading
    // this class exists to replace, printed in the description dialog.
    const labels = description().stats.map(entry => entry.label);

    expect(labels).toContain('Number of levels');
    expect(labels).toContain('Points per level');
    expect(labels).not.toContain('Number of lines');
    expect(labels).not.toContain('Points per line');
    expect(labels).not.toContain('Line names');
  });

  test('the data table identifies a curve by its level', () => {
    // The part of the description a reader consults most, and the place the
    // level being a value rather than a name actually shows: `Line 1` is an
    // index into the order the producer emitted the curves in.
    const { headers, rows } = description().dataTable;

    // Headed by the layer's own name for the field, which is what the
    // announcement calls the same number: `Density 0.2` while walking, and a
    // column of 0.2 under a different word, is one quantity named twice.
    expect(headers).toEqual(['X', 'Y', 'Density']);
    expect(rows[0]).toEqual([0, 0, '0.1']);
    expect(rows.map(row => row[2])).not.toContain('Line 1');
  });

  test('a curve with no level is not given one', () => {
    // `Line 2` in a column headed `Level` reads as a level. So does anything
    // else invented for it -- the honest answer names the curve and says
    // nothing about its value.
    const bare: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 1 }],
      [{ x: 0, y: 1 }],
    ];

    expect(description(bare).dataTable.rows.map(row => row[2]))
      .toEqual(['1', 'Curve 2']);
  });

  test('an unlabelled field keeps the generic column name', () => {
    // `this.z` is the literal `Level` when the layer names no z axis, so the
    // column follows the announcement in both directions.
    const trace = TraceFactory.create({
      id: 'bare-contour-layer',
      type: TraceType.CONTOUR,
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: CURVES,
    }) as ContourTrace;

    expect(trace.description.dataTable.headers).toEqual(['X', 'Y', 'Level']);
  });

  test('a densely sampled field caps its table and says it did', () => {
    // A contour samples densely enough to look smooth, and the inherited
    // table is one row per sample -- re-rounded on every press of `d`. A row
    // count claiming the whole field over a table holding a fraction of it is
    // worse than no table.
    const dense: ContourPoint[][] = [
      Array.from({ length: 1200 }, (_unused, x) => ({ x, y: x, level: 1 })),
    ];

    expect(description(dense).dataTable.rows).toHaveLength(1000);
    expect(stat('Table rows', dense)).toBe('first 1000 of 1200');
  });

  test('an authored name survives where the layer gave no level', () => {
    const named: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 1 }],
      [{ x: 0, y: 1, z: 'ridge' }],
    ];

    expect(description(named).dataTable.rows.map(row => row[2]))
      .toEqual(['1', 'ridge']);
  });
});
