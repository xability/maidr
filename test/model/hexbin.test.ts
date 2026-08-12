import type { HexbinPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { HexbinTrace } from '@model/hexbin';
import { TraceType } from '@type/grammar';

/**
 * Three staggered rows, offset by half a cell as a hex lattice is.
 *
 * Row 0 and row 2 sit at x = 0, 2, 4; row 1 sits at x = 1, 3. That is the
 * whole difficulty: bin 1 of row 0 is at x = 2 while bin 1 of row 1 is at
 * x = 3, so a vertical move by index drifts sideways.
 *
 * The counts are distinct so a drifted cursor announces a different number
 * rather than coincidentally the right one.
 */
const LATTICE: HexbinPoint[][] = [
  [
    { x: 0, y: 0, count: 3 },
    { x: 2, y: 0, count: 9 },
    { x: 4, y: 0, count: 1 },
  ],
  [
    { x: 1, y: 1, count: 5 },
    { x: 3, y: 1, count: 12 },
  ],
  [
    { x: 0, y: 2, count: 0 },
    { x: 2, y: 2, count: 7 },
    { x: 4, y: 2, count: 2 },
  ],
];

/**
 * Create a minimal hexbin layer for model-only tests.
 * @param data The lattice the layer carries
 * @returns Hexbin layer definition
 */
function createLayer(data: HexbinPoint[][] = LATTICE): MaidrLayer {
  return {
    id: 'test-hexbin-layer',
    type: TraceType.HEXBIN,
    title: 'Density',
    axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Count' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: HexbinTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a hexbin trace positioned on one bin.
 * @param row Which lattice row
 * @param col Which bin within it
 * @param data The lattice the layer carries
 * @returns The positioned trace
 */
function hexbin(
  row = 0,
  col = 0,
  data: HexbinPoint[][] = LATTICE,
): HexbinTrace {
  const trace = TraceFactory.create(createLayer(data)) as HexbinTrace;
  trace.moveToIndex(row, col);
  return trace;
}

describe('hexbin registration', () => {
  test('the factory builds a HexbinTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(HexbinTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(hexbin().description.chartType).toBe('Hexbin Plot');
  });
});

describe('a vertical move stays over the same x', () => {
  test('lands on the nearest bin, not the same index', () => {
    // From x = 2 in row 0, the nearest bin in row 1 is x = 1 or x = 3 -- both
    // one away, and the tie takes the earlier. By index it would be x = 3.
    const trace = hexbin(0, 1);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe(1);
  });

  test('does not drift over repeated moves', () => {
    // The failure a column index produces on a tall lattice: the cursor
    // slides off the feature it was following, half a cell per row, and
    // nothing in the announcement says so.
    const trace = hexbin(0, 1);
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');

    // Back to x = 2, where it started, rather than x = 4.
    expect(nonEmptyState(trace).text.main.value).toBe(2);
    expect(nonEmptyState(trace).text.z?.value).toBe(7);
  });

  test('stepping up and straight back down returns to the start', () => {
    // The tie-breaking rule exists for this: broken by "whichever the scan
    // reached last" it would depend on the direction of travel.
    const trace = hexbin(0, 1);
    const before = nonEmptyState(trace).text.main.value;

    trace.moveOnce('UPWARD');
    trace.moveOnce('DOWNWARD');

    expect(nonEmptyState(trace).text.main.value).toBe(before);
  });

  test('a move to a shorter row still lands inside it', () => {
    // Row 1 has two bins and row 0 has three, so index 2 does not exist
    // there. By index this is out of bounds; by nearest x it is a real bin.
    const trace = hexbin(0, 2);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe(3);
  });

  test('reports the bound at the edge of the lattice', () => {
    expect(hexbin(2, 0).moveOnce('UPWARD')).toBe(false);
    expect(hexbin(0, 0).moveOnce('DOWNWARD')).toBe(false);
  });

  test('a horizontal move is still the grid\'s own', () => {
    const trace = hexbin(0, 0);

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe(2);
  });
});

describe('a bin is announced by its centre', () => {
  test('gives the centre and the count, not a row and column', () => {
    // On a staggered lattice "column 1" is not a location: bin 1 of one row
    // and bin 1 of the next sit at different x.
    const { text } = nonEmptyState(hexbin(1, 1));

    expect(text.main.value).toBe(3);
    expect(text.cross.value).toBe(1);
    expect(text.z).toEqual({ label: 'Count', value: 12 });
  });
});

describe('the pitch is the count across the whole lattice', () => {
  test('one scale, so two bins of the same count sound the same', () => {
    const dense = nonEmptyState(hexbin(1, 1)).audio.freq;
    const sparse = nonEmptyState(hexbin(0, 2)).audio.freq;

    expect([dense.min, dense.max]).toEqual([sparse.min, sparse.max]);
    expect(dense.raw).toBe(12);
    expect(sparse.raw).toBe(1);
  });
});

describe('the description says what the cloud looks like', () => {
  const read = (label: string): unknown =>
    hexbin().description.stats.find(stat => stat.label === label)?.value;

  test('counts the bins that hold anything, not just the bins', () => {
    // A scatter spread evenly fills most of its lattice and a tight one
    // leaves most of it empty, which is not recoverable from the counts
    // without walking every cell.
    expect(read('Number of bins')).toBe(8);
    expect(read('Occupied bins')).toBe(7);
  });

  test('reports the total points binned', () => {
    expect(read('Total points')).toBe(39);
  });

  test('names the densest bin by its centre', () => {
    expect(read('Densest bin')).toBe('X 3, Y 1');
  });

  test('the min count ignores the empty bins', () => {
    // Counting an empty bin as the minimum would report a density the
    // occupied part of the chart does not have.
    expect(read('Min count')).toBe(1);
    expect(read('Max count')).toBe(12);
  });
});

describe('the first keypress enters the lattice', () => {
  /**
   * A trace nobody has navigated yet.
   * @returns The trace
   */
  function fresh(): HexbinTrace {
    return TraceFactory.create(createLayer()) as HexbinTrace;
  }

  test('a first press downward lands rather than falling off', () => {
    // The vertical branch computed row -1 from row 0 and reported out of
    // bounds, so a reader whose first key was Down heard the edge tone on a
    // chart they had not entered.
    const trace = fresh();

    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(nonEmptyState(trace).text.z?.value).toBe(3);
  });

  test('a first press upward lands on the first bin, not the second row', () => {
    // Stepping straight to row 1 skips row 0 entirely and seeds the anchor
    // from a bin the reader was never told about.
    const trace = fresh();

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(nonEmptyState(trace).text.z?.value).toBe(3);
  });
});

describe('a jump to the far row keeps the x too', () => {
  /**
   * A sparse lattice, which is what a hexbin is: an empty bin is not drawn,
   * so the rows hold different numbers of bins at different offsets. A
   * strongly diagonal cloud gives exactly this -- the bottom row occupies
   * the right of the field and the top row the left.
   *
   * Row 0 is the bottom, since UPWARD increments the row.
   */
  const SPARSE: HexbinPoint[][] = [
    [
      { x: 8, y: 0, count: 41 },
      { x: 10, y: 0, count: 42 },
    ],
    [
      { x: 1, y: 1, count: 11 },
      { x: 5, y: 1, count: 15 },
    ],
    [
      { x: 0, y: 2, count: 1 },
      { x: 2, y: 2, count: 2 },
      { x: 4, y: 2, count: 3 },
    ],
  ];

  test('lands under the bin it left, not at its index', () => {
    // Ctrl+Down from x = 4. The base grid carries the column index into the
    // far row, and index 2 clamps to the last bin there -- x = 10, the wrong
    // end of a row that does not reach x = 4 at all.
    const trace = hexbin(2, 2, SPARSE);

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe(8);
  });

  test('keeps the column the reader chose, not the one the lattice forced', () => {
    // A jump is still part of one vertical excursion. Where it lands is
    // decided by whatever the far row holds -- here x = 8, most of the field
    // from the x = 0 the reader picked -- so resuming from the landing bin
    // would strand them there.
    const trace = hexbin(2, 0, SPARSE);
    trace.moveOnce('DOWNWARD');
    trace.moveToExtreme('DOWNWARD');

    expect(nonEmptyState(trace).text.main.value).toBe(8);

    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).text.main.value).toBe(1);
  });

  test('a horizontal extreme ends the vertical walk', () => {
    // Choosing a new column is what ends it, whether by one step or by a
    // jump to the end of the row.
    const trace = hexbin(2, 0, SPARSE);
    trace.moveOnce('DOWNWARD');
    trace.moveToExtreme('FORWARD');

    expect(nonEmptyState(trace).text.main.value).toBe(5);

    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).text.main.value).toBe(4);
  });
});
