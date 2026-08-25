import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { ParallelTrace } from '@model/parallel';
import { TraceType } from '@type/grammar';

/**
 * Three cars over three axes whose units are deliberately incomparable.
 *
 * `weight` is measured in thousands and `mpg` in tens, which is the situation
 * that makes one scale for the layer wrong: against a single 21-to-3200 range,
 * every economy figure sits at the very bottom and is inaudible.
 *
 * Within each axis the three cars rank differently -- car A is best on economy
 * and worst on power, car C the reverse -- so a reading that lost the per-axis
 * scaling cannot coincide with the right answer.
 */
const CARS: LinePoint[][] = [
  [
    { x: 'mpg', y: 33, z: 'car A' },
    { x: 'hp', y: 65, z: 'car A' },
    { x: 'weight', y: 1800, z: 'car A' },
  ],
  [
    { x: 'mpg', y: 21, z: 'car B' },
    { x: 'hp', y: 110, z: 'car B' },
    { x: 'weight', y: 2600, z: 'car B' },
  ],
  [
    { x: 'mpg', y: 15, z: 'car C' },
    { x: 'hp', y: 230, z: 'car C' },
    { x: 'weight', y: 3200, z: 'car C' },
  ],
];

/**
 * Create a minimal parallel coordinates layer for model-only tests.
 * @param data The observations the layer carries
 * @returns Parallel coordinates layer definition
 */
function createLayer(data: LinePoint[][] = CARS): MaidrLayer {
  return {
    id: 'test-parallel-layer',
    type: TraceType.PARALLEL,
    title: 'Car comparison',
    axes: { x: { label: 'Variable' }, y: { label: 'Value' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: ParallelTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a parallel coordinates trace positioned on one axis of one observation.
 * @param row Which observation
 * @param col Which axis
 * @param data The observations the layer carries
 * @returns The positioned trace
 */
function parallel(row = 0, col = 0, data: LinePoint[][] = CARS): ParallelTrace {
  const trace = TraceFactory.create(createLayer(data)) as ParallelTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * Where a state's pitch sits within the range it was given, 0 to 1.
 *
 * The service interpolates `raw` between `min` and `max`, so asserting on
 * `raw` alone would pass for a trace that kept the wrong range -- and the
 * range is the half this chart type gets right or wrong.
 * @param state The trace state to read
 * @returns The relative pitch
 */
function pitch(state: NonEmptyTraceState): number {
  const { min, max, raw } = state.audio.freq;
  return (Number(raw) - min) / (max - min);
}

/**
 * The braille grid, narrowed to the numeric shape this trace emits.
 *
 * `BrailleState.values` is a union with the box plot's own point shape, so a
 * bare index would not type-check.
 * @param trace The trace to read
 * @returns One row of normalized positions per observation
 */
function brailleGrid(trace: ParallelTrace): number[][] {
  const { braille } = nonEmptyState(trace);
  if (braille.empty) {
    throw new Error('Expected a populated braille state');
  }
  const values = braille.values;
  if (!Array.isArray(values[0])) {
    throw new TypeError('Expected a grid of numbers');
  }
  return values as number[][];
}

describe('parallel coordinates registration', () => {
  test('the factory builds a ParallelTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(ParallelTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(parallel().description.chartType).toBe('Parallel Coordinates Plot');
    expect(nonEmptyState(parallel()).plotType).toBe('parallel coordinates');
  });

  test('does not report itself as a line plot', () => {
    expect(nonEmptyState(parallel()).plotType).not.toContain('line');
  });
});

describe('every axis is pitched against itself', () => {
  test('a value is scaled by its own axis, not by the layer', () => {
    // car B on mpg: 21 within the 15-to-33 economy axis, not 21 within the
    // 15-to-3200 range of every number in the chart.
    const { audio } = nonEmptyState(parallel(1, 0));

    expect(audio.freq.min).toBe(15);
    expect(audio.freq.max).toBe(33);
    expect(audio.freq.raw).toBe(21);
  });

  test('the same row gets a different range on a different axis', () => {
    // The property `LineTrace` cannot have: its range is per row, so both of
    // these would report the same pair.
    const economy = nonEmptyState(parallel(1, 0)).audio.freq;
    const weight = nonEmptyState(parallel(1, 2)).audio.freq;

    expect([economy.min, economy.max]).toEqual([15, 33]);
    expect([weight.min, weight.max]).toEqual([1800, 3200]);
  });

  test('the best on an axis sounds highest whatever the units', () => {
    // Car A is the best on economy and the worst on weight, and its two
    // pitches have to say so despite weight being measured in thousands.
    expect(pitch(nonEmptyState(parallel(0, 0)))).toBeCloseTo(1);
    expect(pitch(nonEmptyState(parallel(0, 2)))).toBeCloseTo(0);
  });

  test('crossing lines are audible as a swap in pitch', () => {
    // The pattern the chart exists to show: between mpg and hp, car A goes
    // from top to bottom and car C from bottom to top. Negative correlation,
    // heard rather than seen.
    const aEconomy = pitch(nonEmptyState(parallel(0, 0)));
    const aPower = pitch(nonEmptyState(parallel(0, 1)));
    const cEconomy = pitch(nonEmptyState(parallel(2, 0)));
    const cPower = pitch(nonEmptyState(parallel(2, 1)));

    expect(aEconomy).toBeGreaterThan(cEconomy);
    expect(aPower).toBeLessThan(cPower);
  });

  test('an axis whose values are all equal pitches to the middle', () => {
    // Nothing distinguishes the observations there, and either extreme would
    // claim a rank the data does not support.
    const flat: LinePoint[][] = [
      [{ x: 'a', y: 5 }, { x: 'b', y: 1 }],
      [{ x: 'a', y: 5 }, { x: 'b', y: 9 }],
    ];
    const { audio } = nonEmptyState(parallel(0, 0, flat));

    expect(audio.freq.min).toBe(5);
    expect(audio.freq.max).toBe(5);
  });
});

describe('braille is a profile across the axes', () => {
  test('carries each value normalized on its own axis', () => {
    // Raw values would be scaled row-wise by the line encoder, comparing a
    // car's economy against its own weight -- so the cell heights would
    // encode which axis uses bigger numbers.
    const grid = brailleGrid(parallel());

    // Car A tops the economy axis and bottoms the weight one; car C reverses
    // both, on axes whose raw numbers differ by two orders of magnitude.
    expect(grid[0][0]).toBeCloseTo(1);
    expect(grid[0][2]).toBeCloseTo(0);
    expect(grid[2][0]).toBeCloseTo(0);
    expect(grid[2][2]).toBeCloseTo(1);
  });

  test('scales every row against the same 0 to 1, not its own extent', () => {
    const { braille } = nonEmptyState(parallel());
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.min).toEqual([0, 0, 0]);
    expect(braille.max).toEqual([1, 1, 1]);
  });

  test('one row per observation', () => {
    expect(brailleGrid(parallel())).toHaveLength(3);
  });
});

describe('the description says what the axes are', () => {
  const read = (label: string): unknown =>
    parallel().description.stats.find(stat => stat.label === label)?.value;

  test('names the axes in the order the chart draws them', () => {
    // The order is the author's choice and decides which crossings are
    // visible at all, so it is part of the chart rather than of the data.
    expect(read('Axes, in order')).toBe('mpg, hp, weight');
  });

  test('gives each axis its own range', () => {
    expect(read('mpg')).toBe('15 to 33');
    expect(read('hp')).toBe('65 to 230');
    expect(read('weight')).toBe('1800 to 3200');
  });

  test('drops the layer-wide min and max, which measure nothing', () => {
    // Inherited from the line trace, where one range is the chart. Here they
    // would be the smallest and largest numbers across axes measuring
    // different quantities -- 15 and 3200, a pair with no referent.
    const labels = parallel().description.stats.map(stat => stat.label);

    expect(labels).not.toContain('Min value');
    expect(labels).not.toContain('Max value');
  });

  test('counts observations and axes, not lines and points', () => {
    const labels = parallel().description.stats.map(stat => stat.label);

    expect(labels).toContain('Number of observations');
    expect(labels).toContain('Axes per observation');
    expect(labels).not.toContain('Number of lines');
  });
});

describe('one word per referent', () => {
  test('names a series the way the rest of the chart names it', () => {
    // The noun is announced beside the series' own name on every move, so
    // inheriting the line's "Group" would say "Observation 1 of 4, Group is
    // car A" -- two words for one thing in one sentence.
    expect(nonEmptyState(parallel()).text.z)
      .toEqual({ label: 'Observation', value: 'car A' });
  });

  test('a layer that names its own z axis still wins', () => {
    // The fallback is a fallback. A producer who said what the series are
    // called has said it, and the trace does not overrule them.
    const layer: MaidrLayer = { ...createLayer(), axes: {
      x: { label: 'Variable' },
      y: { label: 'Value' },
      z: { label: 'Model' },
    } };
    const trace = TraceFactory.create(layer) as ParallelTrace;
    trace.moveToIndex(0, 0);

    expect(nonEmptyState(trace).text.z?.label).toBe('Model');
  });
});

describe('observations that do not all reach every axis', () => {
  /** The third car was never measured for weight. */
  const RAGGED: LinePoint[][] = [
    [
      { x: 'mpg', y: 33, z: 'car A' },
      { x: 'hp', y: 65, z: 'car A' },
      { x: 'weight', y: 1800, z: 'car A' },
    ],
    [
      { x: 'mpg', y: 21, z: 'car B' },
      { x: 'hp', y: 110, z: 'car B' },
      { x: 'weight', y: 3200, z: 'car B' },
    ],
    [
      { x: 'mpg', y: 15, z: 'car C' },
      { x: 'hp', y: 230, z: 'car C' },
    ],
  ];

  test('an axis is scaled by the observations that reached it', () => {
    // The short row contributes to mpg and hp and not to weight, so weight's
    // range must come from the two rows that have one.
    const weight = nonEmptyState(parallel(0, 2, RAGGED)).audio.freq;
    const economy = nonEmptyState(parallel(0, 0, RAGGED)).audio.freq;

    expect([weight.min, weight.max]).toEqual([1800, 3200]);
    expect([economy.min, economy.max]).toEqual([15, 33]);
  });

  test('the axes are named from the longest observation, not the first', () => {
    // Reading the first row would work here by luck; reading the shortest
    // would lose an axis a cursor can still reach.
    const shortestFirst: LinePoint[][] = [RAGGED[2], RAGGED[0], RAGGED[1]];
    const stats = parallel(0, 0, shortestFirst).description.stats;

    expect(stats.find(stat => stat.label === 'Axes, in order')?.value)
      .toBe('mpg, hp, weight');
  });

  test('every axis a cursor can reach still has a range', () => {
    const stats = parallel(0, 0, RAGGED).description.stats.map(s => s.label);

    expect(stats).toContain('weight');
  });
});

describe('an observation with a gap in the middle (#1182)', () => {
  /**
   * Car B was never measured for power, so its row is one point shorter and
   * its weight sits where every other row's horsepower is.
   *
   * This is the shape both adapters emit today: `extractParallelLayer` drops a
   * null dimension value with `continue`, and `convertParallelSeries` filters
   * `p.y !== null`. Neither holds the column open, so the gap is interior
   * rather than trailing -- and an extent taken by column position then mixes
   * horsepower with a weight in pounds.
   */
  const GAPPY: LinePoint[][] = [
    [
      { x: 'mpg', y: 33, z: 'car A' },
      { x: 'hp', y: 65, z: 'car A' },
      { x: 'weight', y: 1800, z: 'car A' },
    ],
    [
      { x: 'mpg', y: 21, z: 'car B' },
      { x: 'weight', y: 2600, z: 'car B' },
    ],
    [
      { x: 'mpg', y: 15, z: 'car C' },
      { x: 'hp', y: 230, z: 'car C' },
      { x: 'weight', y: 3200, z: 'car C' },
    ],
  ];

  test('a value is scaled by the axis its point names, not by its column', () => {
    // Car A's 65 hp is the lowest power in the chart and car C's 230 the
    // highest, so the two have to be the ends of the hp axis. Taken by column,
    // the axis ran 65 to 2600 -- car B's weight -- and every real horsepower
    // figure collapsed into the bottom sixteenth of it.
    const power = nonEmptyState(parallel(0, 1, GAPPY)).audio.freq;

    expect([power.min, power.max]).toEqual([65, 230]);
  });

  test('the axis a reader is told they are on is the one they hear', () => {
    // Car B's second point announces `weight`, because that is what the point
    // says. Pitched by column it was played against the hp axis, so the
    // announcement and the sound named two different variables.
    const weight = nonEmptyState(parallel(1, 1, GAPPY)).audio.freq;

    expect([weight.min, weight.max]).toEqual([1800, 3200]);
    expect(weight.raw).toBe(2600);
  });

  test('the shortened row does not widen an axis it never reached', () => {
    // The failure in one number: 2600 is a weight, and it must not be able to
    // become the top of a range measured in horsepower.
    const power = nonEmptyState(parallel(2, 1, GAPPY)).audio.freq;

    expect(power.max).not.toBe(2600);
    expect(pitch(nonEmptyState(parallel(2, 1, GAPPY)))).toBeCloseTo(1);
  });

  test('the dialog reports each axis in its own units', () => {
    const read = (label: string): unknown =>
      parallel(0, 0, GAPPY).description.stats.find(stat => stat.label === label)?.value;

    // Was "65 to 2600": a horsepower figure at one end and a car's weight at
    // the other, given to a reader who opened the dialog to learn what the
    // axes are.
    expect(read('hp')).toBe('65 to 230');
    expect(read('weight')).toBe('1800 to 3200');
    expect(read('mpg')).toBe('15 to 33');
  });

  test('braille encodes each cell against the axis that cell names', () => {
    // The grid is built from the same extents, so the gap moved every cell
    // after it onto the wrong scale here too.
    const grid = brailleGrid(parallel(0, 0, GAPPY));

    // Car A is lowest on power, car C highest; car B's single interior cell is
    // its weight, in the middle of 1800 to 3200.
    expect(grid[0][1]).toBeCloseTo(0);
    expect(grid[2][1]).toBeCloseTo(1);
    expect(grid[1][1]).toBeCloseTo(0.5714, 3);
  });

  test('an axis no full-width observation reaches is still named', () => {
    // Every row skips something, so there is no complete spine to read the
    // order off. The axes still have to be named -- a cursor reaches all
    // three.
    const noSpine: LinePoint[][] = [
      [{ x: 'mpg', y: 33 }, { x: 'hp', y: 65 }],
      [{ x: 'mpg', y: 21 }, { x: 'weight', y: 2600 }],
    ];
    const stats = parallel(0, 0, noSpine).description.stats;

    expect(stats.find(stat => stat.label === 'Axes, in order')?.value)
      .toBe('mpg, hp, weight');
    expect(stats.map(stat => stat.label)).toContain('weight');
  });

  test('one observation gapping an axis does not silence it for the rest', () => {
    // `Math.min` of anything holding a gap is `NaN`, so counting one into the
    // extent would leave every value on that axis with a non-finite range to
    // be scaled against -- silencing the whole variable rather than the one
    // reading that is missing. This is the trap `LineTrace` filters for, and
    // a per-axis extent has to filter for it too.
    const oneGap: LinePoint[][] = [
      [{ x: 'mpg', y: 33 }, { x: 'hp', y: 65 }],
      [{ x: 'mpg', y: 15 }, { x: 'hp', y: null }],
      [{ x: 'mpg', y: 21 }, { x: 'hp', y: 230 }],
    ];
    const power = nonEmptyState(parallel(0, 1, oneGap)).audio.freq;

    expect([power.min, power.max]).toEqual([65, 230]);
  });

  test('an axis only a short observation reaches, and only gaps, is still named', () => {
    // Nothing was ever measured on it, and no full-width observation carries
    // it -- so neither the extents nor the widest row would name it on their
    // own. A cursor still reaches it.
    const onlyShortAndGapped: LinePoint[][] = [
      [{ x: 'mpg', y: 33 }, { x: 'hp', y: 65 }],
      [{ x: 'mpg', y: 21 }, { x: 'noise', y: null }],
    ];
    const stats = parallel(0, 0, onlyShortAndGapped).description.stats;

    expect(stats.find(stat => stat.label === 'Axes, in order')?.value)
      .toBe('mpg, hp, noise');
  });

  test('the drawn order comes from the widest row, not from what was seen first', () => {
    // The gappy row is first and skips the middle axis, so reading the order
    // off first appearance would put `weight` before `hp` -- which reverses
    // which variables the dialog says sit next to each other, and so which
    // crossings it implies are visible.
    const widestSecond: LinePoint[][] = [
      [{ x: 'mpg', y: 21 }, { x: 'weight', y: 2600 }],
      [{ x: 'mpg', y: 33 }, { x: 'hp', y: 65 }, { x: 'weight', y: 1800 }],
    ];
    const stats = parallel(0, 0, widestSecond).description.stats;

    expect(stats.find(stat => stat.label === 'Axes, in order')?.value)
      .toBe('mpg, hp, weight');
  });

  test('an axis with no spread puts every value at the midpoint, not at an end', () => {
    // 0 and 1 each claim a rank the data does not support. The braille grid is
    // where it shows: an axis every observation ties on would otherwise draw a
    // row of cells at the floor.
    const flat: LinePoint[][] = [
      [{ x: 'mpg', y: 33 }, { x: 'hp', y: 65 }],
      [{ x: 'mpg', y: 15 }, { x: 'hp', y: 65 }],
    ];
    const grid = brailleGrid(parallel(0, 0, flat));

    expect(grid[0][1]).toBe(0.5);
    expect(grid[1][1]).toBe(0.5);
  });
});

describe('an axis sits in one place in the stereo field (#1182)', () => {
  /** Four axes, with the second observation never measured for power. */
  const FOUR_AXES: LinePoint[][] = [
    [
      { x: 'mpg', y: 33 },
      { x: 'hp', y: 65 },
      { x: 'torque', y: 100 },
      { x: 'weight', y: 1800 },
    ],
    [{ x: 'mpg', y: 21 }, { x: 'torque', y: 150 }, { x: 'weight', y: 2600 }],
  ];

  /** Where a cell is panned, as (position, of how many). */
  const panOf = (row: number, col: number): [number, number] => {
    const { panning } = nonEmptyState(parallel(row, col, FOUR_AXES)).audio;
    return [panning.x, panning.cols];
  };

  test('the same axis pans to the same place on every observation', () => {
    // `torque` is the third axis the chart draws, whichever row a reader is
    // on. Panned by column it was 2 of 4 on the full observation and 1 of 3
    // on the short one -- one axis, two places in the stereo field, which is
    // #1182 heard in the left-right dimension rather than in the pitch.
    expect(panOf(0, 2)).toEqual([2, 4]);
    expect(panOf(1, 1)).toEqual([2, 4]);
  });

  test('the axes either side of the gap keep their places too', () => {
    // The whole tail shifts, not just the one after the gap, so the last
    // axis is the sharpest case: rightmost of four on one row and rightmost
    // of three on the other, which pans to the same edge for the wrong
    // reason. `mpg` pins the untouched end.
    expect(panOf(0, 3)).toEqual([3, 4]);
    expect(panOf(1, 2)).toEqual([3, 4]);
    expect(panOf(0, 0)).toEqual([0, 4]);
    expect(panOf(1, 0)).toEqual([0, 4]);
  });

  test('the field is as wide as the chart, not as the row', () => {
    // A reader on the short observation still hears three of four positions
    // rather than three of three, so the gap is audible as a place nothing
    // is played from.
    expect(panOf(1, 0)[1]).toBe(4);
  });
});

describe('an axis the chart never measured', () => {
  const UNMEASURED: LinePoint[][] = [
    [{ x: 'mpg', y: 33 }, { x: 'hp', y: null }],
    [{ x: 'mpg', y: 21 }, { x: 'hp', y: null }],
  ];

  test('is reported as having no readings, not as a range in no units', () => {
    // `MathUtil.spanned` of an empty set is the literal "Infinity to
    // -Infinity". The dialog is where a reader goes to learn what an axis
    // measures, so a range with no units in it is worse than saying plainly
    // that nothing was measured.
    const stats = parallel(0, 0, UNMEASURED).description.stats;

    expect(stats.find(stat => stat.label === 'hp')?.value).toBe('no readings');
  });

  test('is still named and still in the drawn order', () => {
    // `y: null` is a position with no reading (#925), so the axis is drawn
    // and a cursor reaches it. Dropping it from the order would leave the
    // dialog describing a chart with one fewer axis than the reader can walk.
    const stats = parallel(0, 0, UNMEASURED).description.stats;

    expect(stats.find(stat => stat.label === 'Axes, in order')?.value).toBe('mpg, hp');
  });

  test('places every value on it at the midpoint rather than at an end', () => {
    // No spread to place anything within, and either extreme would claim a
    // rank the data does not have.
    expect(brailleGrid(parallel(0, 0, UNMEASURED))[0][1]).toBe(0.5);
  });
});

describe('navigation is the multi-line model', () => {
  test('walks axes across and observations up', () => {
    const trace = parallel();

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('hp');
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(nonEmptyState(trace).text.cross?.value).toBe(110);
  });

  test('announces the axis name and the raw value, not the normalized one', () => {
    // The pitch carries the position; the announcement has to carry the
    // number, or the reader is told a rank they cannot act on.
    const { text } = nonEmptyState(parallel(2, 2));

    expect(text.main.value).toBe('weight');
    expect(text.cross?.value).toBe(3200);
  });
});
