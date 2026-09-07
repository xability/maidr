import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { RidgelineTrace } from '@model/ridgeline';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Three groups sampled on *different* grids, which is what a KDE evaluated
 * over each group's own range produces.
 *
 * The grids are chosen so index and value disagree: sample 1 of `early` sits
 * at 20 while sample 1 of `late` sits at 60. A move between groups that
 * carried the index would land forty units away and announce a real density
 * at a real place, with nothing to say it had moved.
 *
 * The densities differ by an order of magnitude between groups, so a reading
 * that scaled each group against its own peak would report them as equally
 * tall.
 */
const GROUPS: ViolinKdePoint[][] = [
  [
    { x: 'early', y: 10, density: 0.02 },
    { x: 'early', y: 20, density: 0.09 },
    { x: 'early', y: 30, density: 0.01 },
  ],
  [
    { x: 'middle', y: 30, density: 0.30 },
    { x: 'middle', y: 45, density: 0.90 },
    { x: 'middle', y: 60, density: 0.20 },
  ],
  [
    { x: 'late', y: 50, density: 0.05 },
    { x: 'late', y: 60, density: 0.11 },
    { x: 'late', y: 70, density: 0.03 },
  ],
];

/**
 * Create a minimal ridgeline layer for model-only tests.
 * @param data The groups the layer carries
 * @returns Ridgeline layer definition
 */
function createLayer(data: ViolinKdePoint[][] = GROUPS): MaidrLayer {
  return {
    id: 'test-ridgeline-layer',
    type: TraceType.RIDGELINE,
    title: 'Delivery times by cohort',
    axes: { x: { label: 'Days' }, y: { label: 'Cohort' }, z: { label: 'Cohort' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: RidgelineTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a ridgeline trace positioned on one sample of one group.
 * @param row Which group
 * @param col Which sample
 * @param data The groups the layer carries
 * @returns The positioned trace
 */
function ridgeline(
  row = 0,
  col = 0,
  data: ViolinKdePoint[][] = GROUPS,
): RidgelineTrace {
  const trace = TraceFactory.create(createLayer(data)) as RidgelineTrace;
  trace.moveToIndex(row, col);
  return trace;
}

describe('ridgeline registration', () => {
  test('the factory builds a RidgelineTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(RidgelineTrace);
  });

  test('it names itself a ridgeline rather than a violin', () => {
    expect(ridgeline().description.chartType).toBe('Ridgeline Plot');
  });
});

describe('the orientation key', () => {
  /**
   * Build a positioned ridgeline whose layer declares an orientation.
   * @param orientation What the producer declared, or nothing
   * @returns The trace, moved onto the first sample of the first group
   */
  function declaring(orientation?: Orientation): RidgelineTrace {
    const trace = TraceFactory.create({
      ...createLayer(),
      ...(orientation ? { orientation } : {}),
    }) as RidgelineTrace;
    trace.moveToIndex(0, 1);
    return trace;
  }

  test('changes nothing about how the chart is read', () => {
    // `RidgelineTrace` extends `AbstractTrace`, not `ViolinTrace`, so it
    // neither resolves `layer.orientation` nor inherits anything that does.
    // The record in `src/util/orientation.ts` said otherwise, and the word it
    // put in front of every announcement described nothing a reader could act
    // on (#949). This is what says the two now agree: a producer declaring
    // `horz` gets the same reading, so there is nothing to announce.
    const vertical = nonEmptyState(declaring(Orientation.VERTICAL));
    const horizontal = nonEmptyState(declaring(Orientation.HORIZONTAL));

    expect(horizontal.text).toEqual(vertical.text);
    expect(horizontal.audio).toEqual(vertical.audio);
    expect(horizontal.braille).toEqual(vertical.braille);
  });

  test('is not announced as part of the chart type', () => {
    expect(declaring(Orientation.HORIZONTAL).description.chartType)
      .toBe('Ridgeline Plot');
    expect(declaring().description.chartType).toBe('Ridgeline Plot');
  });
});

describe('every group is pitched against the whole chart', () => {
  test('a sparse group does not sound as tall as a dense one', () => {
    // `early` peaks at 0.09 and `middle` at 0.90 -- an order of magnitude.
    // Scaled per group, both peaks would be the top of the register and the
    // chart would report a dozen equally tall ridges.
    const early = nonEmptyState(ridgeline(0, 1)).audio.freq;
    const middle = nonEmptyState(ridgeline(1, 1)).audio.freq;

    expect(early.max).toBe(0.9);
    expect(middle.max).toBe(0.9);
    expect(early.raw).toBe(0.09);
    expect(middle.raw).toBe(0.9);
  });

  test('the floor is zero, not the smallest density on the chart', () => {
    // A density of zero is a real reading -- nobody in this group had that
    // value -- so it belongs at the bottom of the register rather than
    // wherever the sparsest sample that *was* measured happens to sit.
    expect(nonEmptyState(ridgeline(0, 0)).audio.freq.min).toBe(0);
  });

  test('braille scales every row against the chart too', () => {
    const { braille } = nonEmptyState(ridgeline(0, 0));
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.min).toEqual([0, 0, 0]);
    expect(braille.max).toEqual([0.9, 0.9, 0.9]);
  });
});

describe('moving between groups holds the value', () => {
  test('lands on the nearest sample, not the same index', () => {
    // From `early` at 30 (index 2), the nearest sample in `middle` is 30
    // (index 0) -- not index 2, which is 60.
    const trace = ridgeline(0, 2);

    expect(trace.moveOnce('UPWARD')).toBe(true);

    const { text } = nonEmptyState(trace);
    expect(text.main.value).toBe(30);
    expect(text.section).toBe('middle');
  });

  test('a walk across groups does not drift', () => {
    // Three grids staggered so that holding the reader's value and
    // re-deriving it at each ridge give different answers by the third
    // group. A single step can only move by half a sample spacing, so the
    // failure this guards needs a walk to show up at all -- which is exactly
    // what makes it easy to miss.
    //
    //   chosen 10  ->  `b` has nothing nearer than 16
    //                  `c`'s samples straddle: 5 is nearest to 10,
    //                                          22 is nearest to 16
    const staggered: ViolinKdePoint[][] = [
      [
        { x: 'a', y: 0, density: 0.1 },
        { x: 'a', y: 10, density: 0.4 },
        { x: 'a', y: 20, density: 0.2 },
      ],
      [
        { x: 'b', y: 16, density: 0.5 },
        { x: 'b', y: 30, density: 0.3 },
        { x: 'b', y: 44, density: 0.1 },
      ],
      [
        { x: 'c', y: 5, density: 0.2 },
        { x: 'c', y: 22, density: 0.6 },
      ],
    ];

    const trace = ridgeline(0, 1, staggered);
    trace.moveOnce('UPWARD');
    expect(nonEmptyState(trace).text.main.value).toBe(16);

    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).text.section).toBe('c');
    // 5, the sample nearest the 10 the reader chose. Re-deriving from the 16
    // they were forced onto in `b` would give 22 -- twelve units from where
    // they meant to be, announcing a real density at a real place.
    expect(nonEmptyState(trace).text.main.value).toBe(5);
  });

  test('stepping across and straight back returns to the start', () => {
    const trace = ridgeline(1, 1);
    const start = nonEmptyState(trace).text.main.value;

    trace.moveOnce('UPWARD');
    trace.moveOnce('DOWNWARD');

    expect(nonEmptyState(trace).text.main.value).toBe(start);
  });

  test('moving along a curve ends the comparison', () => {
    // Choosing a new place on the value axis is what ends it, so the next
    // move between groups measures from there.
    const trace = ridgeline(0, 0);
    trace.moveOnce('UPWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    // Back in `early`, nearest to `middle`'s second sample (45) is 30.
    expect(nonEmptyState(trace).text.main.value).toBe(30);
  });

  test('the first keypress enters the chart rather than falling off', () => {
    const trace = TraceFactory.create(createLayer()) as RidgelineTrace;

    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(nonEmptyState(trace).text.section).toBe('early');
  });
});

describe('a jump to the far group keeps the value too', () => {
  /** Three grids staggered so index and value give different answers. */
  const STAGGERED: ViolinKdePoint[][] = [
    [
      { x: 'a', y: 0, density: 0.1 },
      { x: 'a', y: 10, density: 0.4 },
      { x: 'a', y: 20, density: 0.2 },
    ],
    [
      { x: 'b', y: 16, density: 0.5 },
      { x: 'b', y: 30, density: 0.3 },
      { x: 'b', y: 44, density: 0.1 },
    ],
    [
      { x: 'c', y: 5, density: 0.2 },
      { x: 'c', y: 22, density: 0.6 },
    ],
  ];

  test('lands under the value it left, not at its index', () => {
    // Ctrl+Up is a vertical move and has the vertical move's problem. The
    // base grid carries the column index into the far group: index 1 of `c`
    // is 22, twelve units from the 10 the reader was comparing at -- the
    // drift this trace exists to prevent, reached by a different key.
    const trace = ridgeline(0, 1, STAGGERED);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);

    const { text } = nonEmptyState(trace);
    expect(text.section).toBe('c');
    expect(text.main.value).toBe(5);
  });

  test('keeps the value the reader chose, not the one the group forced', () => {
    // Where a jump lands is decided by whatever the far group sampled, so
    // resuming from there would strand the reader at a value they never
    // picked. `b` straddles the two candidates: nearest to the chosen 10 is
    // 12, while nearest to the 5 that `c` forced is 2.
    const straddling: ViolinKdePoint[][] = [
      [
        { x: 'a', y: 0, density: 0.1 },
        { x: 'a', y: 10, density: 0.4 },
        { x: 'a', y: 20, density: 0.2 },
      ],
      [
        { x: 'b', y: 2, density: 0.3 },
        { x: 'b', y: 12, density: 0.5 },
      ],
      [
        { x: 'c', y: 5, density: 0.2 },
        { x: 'c', y: 22, density: 0.6 },
      ],
    ];

    const trace = ridgeline(0, 1, straddling);
    trace.moveToExtreme('UPWARD');

    expect(nonEmptyState(trace).text.section).toBe('c');
    expect(nonEmptyState(trace).text.main.value).toBe(5);

    trace.moveOnce('DOWNWARD');

    expect(nonEmptyState(trace).text.section).toBe('b');
    expect(nonEmptyState(trace).text.main.value).toBe(12);
  });

  test('a horizontal extreme ends the comparison', () => {
    const trace = ridgeline(0, 0, STAGGERED);
    trace.moveOnce('UPWARD');
    trace.moveToExtreme('FORWARD');

    expect(nonEmptyState(trace).text.main.value).toBe(44);

    trace.moveOnce('DOWNWARD');

    // Measured from the 44 the horizontal jump chose, not the 0 the vertical
    // walk started from: `a`'s nearest to 44 is 20.
    expect(nonEmptyState(trace).text.main.value).toBe(20);
  });
});

describe('the announcement names the group, the value and the density', () => {
  test('carries all three', () => {
    const { text } = nonEmptyState(ridgeline(1, 1));

    expect(text.section).toBe('middle');
    expect(text.main).toEqual({ label: 'Days', value: 45 });
    expect(text.cross).toEqual({ label: 'Cohort', value: 0.9 });
  });

  test('names an unnamed group by its position', () => {
    const unnamed: ViolinKdePoint[][] = [
      [{ x: '', y: 1, density: 0.5 }],
      [{ x: '', y: 2, density: 0.6 }],
    ];

    expect(nonEmptyState(ridgeline(1, 0, unnamed)).text.section).toBe('Group 2');
  });
});

describe('the description reports where each group peaks', () => {
  test('names the modal value of every group', () => {
    // The ridgeline's headline finding: whether the modes march across the
    // axis. A reader cannot assemble it without walking every sample of
    // every group and holding a dozen maxima in mind.
    const stats = ridgeline().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Peak of each group')).toBe(
      'early at 20, middle at 45, late at 60',
    );
    expect(read('Peaks span')).toBe('20 to 60');
    expect(read('Number of groups')).toBe(3);
  });

  test('withholds the span when every group peaks in the same place', () => {
    // Naming a span of zero would report a finding the chart does not make.
    const aligned: ViolinKdePoint[][] = [
      [{ x: 'a', y: 5, density: 0.1 }, { x: 'a', y: 9, density: 0.9 }],
      [{ x: 'b', y: 5, density: 0.2 }, { x: 'b', y: 9, density: 0.4 }],
    ];
    const stats = ridgeline(0, 0, aligned).description.stats;

    expect(stats.find(stat => stat.label === 'Peaks span')).toBeUndefined();
    expect(stats.find(stat => stat.label === 'Peak of each group')?.value)
      .toBe('a at 9, b at 9');
  });

  test('rounds a peak position to what a listener can follow', () => {
    // A KDE is evaluated on a `linspace` grid, so these are full-precision
    // floats. The service rounds a stat that IS a number and passes a
    // composed string through, so this one has to round itself or the dialog
    // reads out sixteen digits.
    const grid: ViolinKdePoint[][] = [
      [
        { x: 'a', y: 3.2857142857142856, density: 0.9 },
        { x: 'a', y: 7.428571428571429, density: 0.1 },
      ],
      [
        { x: 'b', y: 3.2857142857142856, density: 0.2 },
        { x: 'b', y: 7.428571428571429, density: 0.8 },
      ],
    ];
    const stats = ridgeline(0, 0, grid).description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Peak of each group')).toBe('a at 3.29, b at 7.43');
    expect(read('Peaks span')).toBe('3.29 to 7.43');
  });

  test('names which ridge is tallest, and how tall', () => {
    // "Which distribution is tallest, and where" is what the chart is drawn
    // for, and the modes above answer only the second half. The peak is
    // already what the pitch and the braille are scaled against; a reader had
    // to walk every sample of every group to find it.
    const stats = ridgeline().description.stats;

    expect(stats.find(stat => stat.label === 'Tallest ridge')?.value)
      .toBe('middle, peak density 0.9');
  });

  test('says how long a walk along one ridge is', () => {
    // Groups are not obliged to share a sample grid, so a single number would
    // be a claim about every curve that a per-group KDE does not support.
    const ragged: ViolinKdePoint[][] = [
      [{ x: 'a', y: 1, density: 0.1 }, { x: 'a', y: 2, density: 0.2 }],
      [{ x: 'b', y: 1, density: 0.3 }],
    ];
    const read = (label: string): unknown =>
      ridgeline(0, 0, ragged).description.stats.find(stat => stat.label === label)?.value;

    expect(read('Samples per group')).toBe('1 to 2');
    expect(ridgeline().description.stats.find(stat => stat.label === 'Samples per group')?.value)
      .toBe(3);
  });
});

describe('a group the layer named with a number', () => {
  /** Three years of delivery times, which is the canonical ridgeline. */
  const YEARS: ViolinKdePoint[][] = [
    [{ x: 2021, y: 10, density: 0.2 }, { x: 2021, y: 20, density: 0.5 }],
    [{ x: 2022, y: 10, density: 0.4 }, { x: 2022, y: 20, density: 0.1 }],
  ];

  test('keeps the name the chart draws', () => {
    // `ViolinKdePoint.x` is `string | number`, so a test for a string threw
    // every one of these away and put an ordinal in its place -- and an
    // ordinal looks authoritative enough that nothing signals the swap.
    expect(nonEmptyState(ridgeline(0, 0, YEARS)).text.section).toBe('2021');
  });

  test('and uses it everywhere the description names a group', () => {
    const description = ridgeline(0, 0, YEARS).description;
    const read = (label: string): unknown =>
      description.stats.find(stat => stat.label === label)?.value;

    expect(read('Groups')).toBe('2021, 2022');
    expect(read('Peak of each group')).toBe('2021 at 20, 2022 at 10');
    expect(description.dataTable.rows[0][0]).toBe('2021');
  });
});

describe('the data table names its own columns', () => {
  test('the group column is headed by the group axis, not the density', () => {
    // The three columns are the group, the value it was measured at, and the
    // density there. Heading the first with the density's own label put
    // `Cohort` over a column of group names, and the density column under a
    // word the chart never used.
    const trace = TraceFactory.create({
      ...createLayer(),
      axes: { x: { label: 'Days' }, y: { label: 'Cohort' }, z: { label: 'Share' } },
    }) as RidgelineTrace;

    expect(trace.description.dataTable.headers).toEqual(['Cohort', 'Days', 'Share']);
  });

  test('falls back to words that describe a ridgeline, not to placeholders', () => {
    // `Level` is the generic z placeholder and `Y` the generic axis one;
    // neither says anything about a group or a density.
    const trace = TraceFactory.create({
      id: 'test-ridgeline-layer',
      type: TraceType.RIDGELINE,
      title: 'Delivery times by cohort',
      axes: { x: { label: 'Days' } },
      data: GROUPS,
    }) as RidgelineTrace;

    expect(trace.description.dataTable.headers).toEqual(['Group', 'Days', 'Density']);
    expect(nonEmptyState(trace).text.cross?.label).toBe('Density');
  });

  test('caps the table and says it did', () => {
    // A KDE is conventionally evaluated on 512 grid points per group, so a
    // ten-group ridgeline is five thousand rows of an estimator's evaluation
    // grid -- re-rounded on every press of `d` and held in the store.
    const dense: ViolinKdePoint[][] = [0, 1].map(group =>
      Array.from({ length: 600 }, (_, index) => ({
        x: `g${group}`,
        y: index,
        density: index / 1000,
      })));
    const description = ridgeline(0, 0, dense).description;

    expect(description.dataTable.rows).toHaveLength(1000);
    expect(description.stats.find(stat => stat.label === 'Table rows')?.value)
      .toBe('first 1000 of 1200');
  });

  test('says nothing about the cap on a table that fits', () => {
    expect(ridgeline().description.stats
      .find(stat => stat.label === 'Table rows'))
      .toBeUndefined();
  });
});
