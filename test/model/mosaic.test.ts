import type { MaidrLayer, MosaicPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { MosaicTrace } from '@model/mosaic';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Three passenger classes by survival, as a mosaic draws them.
 *
 * The widths are deliberately uneven and deliberately *disagree* with the
 * heights: `First` has the best survival rate and the smallest share of the
 * ship, while `Third` has the worst rate and more than half the passengers.
 * A reading that gave only the heights would report the same table for a
 * ship of six first-class passengers and one of six hundred.
 */
const TABLE: MosaicPoint[][] = [
  [
    { x: 'First', y: 0.62, z: 'Survived', width: 0.15, count: 203 },
    { x: 'Second', y: 0.41, z: 'Survived', width: 0.13, count: 118 },
    { x: 'Third', y: 0.25, z: 'Survived', width: 0.32, count: 178 },
  ],
  [
    { x: 'First', y: 0.38, z: 'Died', width: 0.15, count: 122 },
    { x: 'Second', y: 0.59, z: 'Died', width: 0.13, count: 167 },
    { x: 'Third', y: 0.75, z: 'Died', width: 0.32, count: 528 },
  ],
];

/**
 * Create a minimal mosaic layer for model-only tests.
 * @param data The table the layer carries
 * @param orientation Which way the chart is drawn
 * @returns Mosaic layer definition
 */
function createLayer(
  data: MosaicPoint[][] = TABLE,
  orientation: Orientation = Orientation.VERTICAL,
): MaidrLayer {
  return {
    id: 'test-mosaic-layer',
    type: TraceType.MOSAIC,
    title: 'Survival by class',
    orientation,
    axes: { x: { label: 'Class' }, y: { label: 'Proportion' }, z: { label: 'Outcome' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: MosaicTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a mosaic trace positioned on one cell.
 * @param row Which series
 * @param col Which category
 * @param data The table the layer carries
 * @param orientation Which way the chart is drawn
 * @returns The positioned trace
 */
function mosaic(
  row = 0,
  col = 0,
  data: MosaicPoint[][] = TABLE,
  orientation: Orientation = Orientation.VERTICAL,
): MosaicTrace {
  const trace = TraceFactory.create(createLayer(data, orientation)) as MosaicTrace;
  trace.moveToIndex(row, col);
  return trace;
}

describe('mosaic registration', () => {
  test('the factory builds a MosaicTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(MosaicTrace);
  });

  test('it names itself a mosaic rather than a stacked bar', () => {
    expect(mosaic().description.chartType).toBe('Mosaic Plot');
  });

  test('it reads the segments a stacked bar would', () => {
    const { text } = nonEmptyState(mosaic(0, 0));

    expect(text.main.value).toBe('First');
    expect(text.cross?.value).toBe(0.62);
    expect(text.z).toEqual({ label: 'Outcome', value: 'Survived' });
  });
});

describe('the width is data, not layout', () => {
  test('announces the column share alongside the segment', () => {
    // The number a reader cannot get any other way, and without which a
    // category of six and one of six hundred read identically.
    expect(nonEmptyState(mosaic(0, 0)).text.asides)
      .toContainEqual({ label: 'Share of all', value: '15.0%' });
    expect(nonEmptyState(mosaic(0, 2)).text.asides)
      .toContainEqual({ label: 'Share of all', value: '32.0%' });
  });

  test('announces the same share on every segment of a column', () => {
    // The width belongs to the column, so a reader who arrives at the second
    // segment has not lost it.
    expect(nonEmptyState(mosaic(1, 2)).text.asides)
      .toContainEqual({ label: 'Share of all', value: '32.0%' });
  });

  test('reads the share from whichever segment declares it', () => {
    // A producer that puts the width only on the first segment of a column
    // is emitting something perfectly sensible.
    const sparse: MosaicPoint[][] = [
      [{ x: 'A', y: 0.6, z: 'Yes', width: 0.7 }],
      [{ x: 'A', y: 0.4, z: 'No' }],
    ];

    expect(nonEmptyState(mosaic(1, 0, sparse)).text.asides)
      .toContainEqual({ label: 'Share of all', value: '70.0%' });
  });

  test('says nothing when the layer declares no width', () => {
    // A mosaic without widths is a stacked bar, and inventing a share would
    // put a number in the announcement the chart does not contain.
    const bare: MosaicPoint[][] = [
      [{ x: 'A', y: 0.6, z: 'Yes' }],
      [{ x: 'A', y: 0.4, z: 'No' }],
    ];

    expect(nonEmptyState(mosaic(0, 0, bare)).text.asides).toBeUndefined();
  });
});

describe('the cell count travels when the table has one', () => {
  test('announces it on a cell', () => {
    expect(nonEmptyState(mosaic(1, 2)).text.asides)
      .toContainEqual({ label: 'Count', value: '528' });
  });

  test('says nothing on the summary row', () => {
    // The row the segmented bar appends is a column total, not a cell, so it
    // has no count of its own -- and the width still applies to it, since the
    // column is the same column.
    const summary = nonEmptyState(mosaic(2, 2));

    expect(summary.text.asides)
      .toEqual([{ label: 'Share of all', value: '32.0%' }]);
  });

  test('says nothing when the producer works from proportions', () => {
    const bare: MosaicPoint[][] = [
      [{ x: 'A', y: 0.6, z: 'Yes', width: 0.5 }],
      [{ x: 'A', y: 0.4, z: 'No', width: 0.5 }],
    ];

    expect(nonEmptyState(mosaic(0, 0, bare)).text.asides)
      .toEqual([{ label: 'Share of all', value: '50.0%' }]);
  });
});

describe('the description reports the marginal distribution', () => {
  test('names every column share', () => {
    // The axis a mosaic adds, and the one a reader cannot accumulate by
    // walking the segments: every column announces its own share, and
    // nothing says how they compare.
    const stats = mosaic().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Share of all observations'))
      .toBe('First 15.0%, Second 13.0%, Third 32.0%');
  });

  test('names the largest and smallest group', () => {
    // A conditional proportion computed from few observations and one
    // computed from many are announced identically; this is what separates
    // them.
    const stats = mosaic().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Largest group')).toBe('Third, 32.0%');
    expect(read('Smallest group')).toBe('Second, 13.0%');
  });

  test('totals the table when it carries counts', () => {
    const stats = mosaic().description.stats;

    expect(stats.find(stat => stat.label === 'Total observations')?.value)
      .toBe(1316);
  });

  test('withholds the total when only some columns carry counts', () => {
    // A partial sum announced as "Total observations" is a number the reader
    // will take for the size of the table.
    const partial: MosaicPoint[][] = [
      [
        { x: 'A', y: 0.6, z: 'Yes', width: 0.5, count: 30 },
        { x: 'B', y: 0.4, z: 'Yes', width: 0.5 },
      ],
      [
        { x: 'A', y: 0.4, z: 'No', width: 0.5, count: 20 },
        { x: 'B', y: 0.6, z: 'No', width: 0.5 },
      ],
    ];

    expect(mosaic(0, 0, partial).description.stats
      .find(stat => stat.label === 'Total observations')).toBeUndefined();
  });

  test('names the categories the way the chart is drawn', () => {
    // A horizontal layer carries its category on `y`. Reading a fixed field
    // would name the columns by their proportions.
    const horizontal: MosaicPoint[][] = [
      [
        { x: 0.62, y: 'First', z: 'Survived', width: 0.4 },
        { x: 0.25, y: 'Third', z: 'Survived', width: 0.6 },
      ],
      [
        { x: 0.38, y: 'First', z: 'Died', width: 0.4 },
        { x: 0.75, y: 'Third', z: 'Died', width: 0.6 },
      ],
    ];
    const stats = mosaic(0, 0, horizontal, Orientation.HORIZONTAL)
      .description
      .stats;

    expect(stats.find(stat => stat.label === 'Share of all observations')?.value)
      .toBe('First 40.0%, Third 60.0%');
  });
});
