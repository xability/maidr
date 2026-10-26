import type { LinePoint, MaidrLayer, StepDirection } from '@type/grammar';
import type { NonEmptyTraceState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { AreaTrace } from '@model/area';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Two revenue streams over three quarters. The numbers are chosen so every
 * total is distinct from every series value, so an assertion on a total
 * cannot pass by coincidentally reading a band height instead.
 */
const SUBSCRIPTIONS: LinePoint[] = [
  { x: 'Q1', y: 10, z: 'Subscriptions' },
  { x: 'Q2', y: 20, z: 'Subscriptions' },
  { x: 'Q3', y: 30, z: 'Subscriptions' },
];

const SERVICES: LinePoint[] = [
  { x: 'Q1', y: 5, z: 'Services' },
  { x: 'Q2', y: 20, z: 'Services' },
  { x: 'Q3', y: 70, z: 'Services' },
];

/** Column totals of the two series above: 15, 40, 100. */
const TOTALS = [15, 40, 100];

/**
 * `Services` as it would arrive if the line launched a quarter late: its own
 * first point is Q2, so its local column indices are shifted by one against
 * the series above. Totals looked up by column index rather than by x break
 * exactly here.
 */
const LATE_START: LinePoint[] = [
  { x: 'Q2', y: 20, z: 'Services' },
  { x: 'Q3', y: 70, z: 'Services' },
];

/**
 * A third, thin band, so the top and the bottom of a stack are not also the
 * bands beside the cursor.
 */
const LICENCES: LinePoint[] = [
  { x: 'Q1', y: 1, z: 'Licences' },
  { x: 'Q2', y: 2, z: 'Licences' },
  { x: 'Q3', y: 3, z: 'Licences' },
];

/**
 * Create a minimal area layer for model-only tests.
 * @param type The area variant to author
 * @param data Points, nested one array per series
 * @returns Area layer definition for AreaTrace
 */
function createAreaLayer(type: TraceType, data: LinePoint[][]): MaidrLayer {
  return {
    id: 'test-area-layer',
    type,
    title: 'Revenue',
    axes: {
      x: { label: 'Quarter' },
      y: { label: 'Revenue' },
    },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: AreaTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Which band the cursor is on, as the announcement names it.
 * @param trace The trace to read
 * @returns The band's name, or whatever stands in its place
 */
function bandAt(trace: AreaTrace): unknown {
  return nonEmptyState(trace).text.z?.value;
}

/**
 * Move the cursor to a given column of the first series.
 * @param trace The trace to move
 * @param col Zero-based column index to land on
 */
function moveToColumn(trace: AreaTrace, col: number): void {
  trace.moveOnce('UPWARD');
  for (let i = 0; i < col; i++) {
    trace.moveOnce('FORWARD');
  }
}

describe('area trace registration', () => {
  test.each([
    [TraceType.AREA],
    [TraceType.STACKED_AREA],
    [TraceType.NORMALIZED_AREA],
  ])('the factory builds an AreaTrace for %s', (type) => {
    const trace = TraceFactory.create(createAreaLayer(type, [SUBSCRIPTIONS]));

    expect(trace).toBeInstanceOf(AreaTrace);
  });

  test.each([
    [TraceType.AREA, 'area'],
    [TraceType.STACKED_AREA, 'stacked area'],
    [TraceType.NORMALIZED_AREA, '100% stacked area'],
  ])('%s announces itself as "%s"', (type, expected) => {
    const trace = TraceFactory.create(
      createAreaLayer(type, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).plotType).toBe(expected);
  });
});

describe('unstacked area', () => {
  test('reads a point as a line does, with no running total', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 1);

    const { text } = nonEmptyState(trace);
    expect(text.cross?.value).toBe(20);
    // Bands that do not stack have no total to report; announcing one would
    // claim an aggregate the chart never draws.
    expect(text.stack).toBeUndefined();
  });

  test('carries no total statistics in the description', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    const labels = trace.description.stats.map(stat => stat.label);
    expect(labels).not.toContain('Total range');
    // Bands that do not stack draw no total, so the table has no column for
    // one either.
    expect(trace.description.dataTable.headers).toEqual([
      'Quarter',
      'Revenue',
      'Band',
    ]);
  });

  test('describes its series as bands rather than as lines', () => {
    // The chart type is announced as an area and then described in the line's
    // words, in three places at once: the summary labels, the series column
    // and the spoken group label.
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    const labels = trace.description.stats.map(stat => stat.label);

    expect(labels).toContain('Number of bands');
    expect(labels).toContain('Points per band');
    expect(labels).toContain('Band names');
    expect(labels).not.toContain('Number of lines');
    expect(labels).not.toContain('Points per line');
  });
});

describe('stacked area', () => {
  test('announces the band value and the running total as separate numbers', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 1);

    const { text } = nonEmptyState(trace);
    // The regression this trace type exists to prevent: read as a line, the
    // announcement carried 20 alone with nothing to say whether that was the
    // band's height or the stack's top edge.
    expect(text.cross?.value).toBe(20);
    expect(text.stack?.value).toBe(TOTALS[1]);
  });

  test('reports the point share of the total', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 2);

    expect(nonEmptyState(trace).text.stack?.share).toBeCloseTo(30 / 100);
  });

  test('totals every series, not only the ones below the cursor', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 0);

    expect(nonEmptyState(trace).text.stack?.value).toBe(TOTALS[0]);
  });

  test('describes the range of the stack, not only of the tallest band', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    // One stat, not two: a 100% stacked area's totals are equal by
    // construction, and a pair reporting the same number twice hands the
    // reader a range and then a point.
    expect(trace.description.stats).toContainEqual({
      label: 'Total range',
      value: '15 to 100',
    });
  });

  test('reads a normalized area as a constant rather than as a span', () => {
    const normalized: LinePoint[][] = [
      [{ x: 'Q1', y: 40, z: 'Subscriptions' }, { x: 'Q2', y: 60, z: 'Subscriptions' }],
      [{ x: 'Q1', y: 60, z: 'Services' }, { x: 'Q2', y: 40, z: 'Services' }],
    ];
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.NORMALIZED_AREA, normalized),
    ) as AreaTrace;

    expect(trace.description.stats).toContainEqual({
      label: 'Total range',
      value: 'constant 100',
    });
  });

  test('carries the running total beside each band height in the table', () => {
    // The second magnitude the chart draws. It is announced on every move, and
    // the table was the one surface where recovering it meant summing
    // interleaved rows by hand.
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    const { headers, rows } = trace.description.dataTable;

    expect(headers).toEqual(['Quarter', 'Revenue', 'Band', 'Total']);
    expect(rows[0]).toEqual(['Q1', 10, 'Subscriptions', TOTALS[0]]);
    expect(rows[3]).toEqual(['Q1', 5, 'Services', TOTALS[0]]);
  });

  test('matches series by x value rather than by column index', () => {
    // `Services` starts a quarter late. Indexing by column would add its Q2
    // value to the Q1 column and announce 30 as the Q1 stack height.
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, LATE_START]),
    ) as AreaTrace;
    moveToColumn(trace, 0);

    expect(nonEmptyState(trace).text.stack?.value).toBe(10);
  });

  test('reports the total for the x the cursor is actually on, in a short series', () => {
    // A series that starts late holds its own points at its own column
    // indices: `LATE_START[0]` is Q2, not Q1. Looking the total up by column
    // index rather than by x therefore reports Q1's total while the cursor
    // sits on Q2 — and, worse than being wrong, it yields a share above 100%,
    // which no stacked chart can draw.
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, LATE_START]),
    ) as AreaTrace;
    trace.moveToIndex(1, 0);

    const { text } = nonEmptyState(trace);
    expect(text.main.value).toBe('Q2');
    expect(text.cross?.value).toBe(20);
    expect(text.stack?.value).toBe(TOTALS[1]);
    expect(text.stack?.share).toBeCloseTo(20 / 40);
  });

  test('totals an x that the first series does not carry at all', () => {
    // The reference series stops at Q2 while another runs to Q3. Building the
    // totals from the first series alone leaves Q3 with no total, so the
    // cursor lands on a real point and hears nothing about the stack it is in.
    const short: LinePoint[] = [
      { x: 'Q1', y: 10, z: 'Subscriptions' },
      { x: 'Q2', y: 20, z: 'Subscriptions' },
    ];
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [short, LATE_START]),
    ) as AreaTrace;
    trace.moveToIndex(1, 1);

    const { text } = nonEmptyState(trace);
    expect(text.main.value).toBe('Q3');
    expect(text.stack?.value).toBe(70);
  });

  test('stays silent about the share when the total is zero', () => {
    const positive: LinePoint[] = [{ x: 'Q1', y: 5, z: 'Inflow' }];
    const negative: LinePoint[] = [{ x: 'Q1', y: -5, z: 'Outflow' }];
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [positive, negative]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    const { text } = nonEmptyState(trace);
    expect(text.stack?.value).toBe(0);
    // 5 / 0 is Infinity; announcing "Infinity% of it" is worse than silence.
    expect(text.stack?.share).toBeUndefined();
  });
});

describe('stacked area: up and down follow the stack', () => {
  // The first series is the bottom band and each one after it is drawn on top
  // of the one before, as a stacked bar's segments are. Ranked by their own
  // values, as a line's series are, Up from the bottom band at Q1 -- 10 under
  // 5 -- said "No more data to display" with a band drawn above it, Down went
  // up the drawing to that band, and at Q3 -- 30 under 70 -- the same keys
  // went the other way.

  test('up moves to the band stacked on top, whatever the two values are', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    const moved = trace.moveOnce('UPWARD');

    expect(moved).toBe(true);
    expect(bandAt(trace)).toBe('Services');
    expect(trace.isMovable('UPWARD')).toBe(false);
  });

  test('down moves to the band underneath, and stops at the bottom band', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveToIndex(1, 0);

    const moved = trace.moveOnce('DOWNWARD');

    expect(moved).toBe(true);
    expect(bandAt(trace)).toBe('Subscriptions');
    expect(trace.isMovable('DOWNWARD')).toBe(false);
  });

  test('moves the same way at every x', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;

    const upFrom = (col: number): unknown => {
      trace.moveToIndex(0, col);
      trace.moveOnce('UPWARD');
      return bandAt(trace);
    };

    expect([upFrom(0), upFrom(1), upFrom(2)]).toEqual(['Services', 'Services', 'Services']);
  });

  test('control and up reach the top band, control and down the bottom band', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES, LICENCES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    trace.moveToExtreme('UPWARD');
    const top = bandAt(trace);
    trace.moveToExtreme('DOWNWARD');
    const bottom = bandAt(trace);

    expect(top).toBe('Licences');
    expect(bottom).toBe('Subscriptions');
  });

  test('a 100% stacked area moves the same way', () => {
    // Q2 is 60 under 40: Up has to reach the smaller share drawn above.
    const normalized: LinePoint[][] = [
      [{ x: 'Q1', y: 40, z: 'Desktop' }, { x: 'Q2', y: 60, z: 'Desktop' }],
      [{ x: 'Q1', y: 60, z: 'Mobile' }, { x: 'Q2', y: 40, z: 'Mobile' }],
    ];
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.NORMALIZED_AREA, normalized),
    ) as AreaTrace;
    trace.moveToIndex(0, 1);

    const moved = trace.moveOnce('UPWARD');

    expect(moved).toBe(true);
    expect(bandAt(trace)).toBe('Mobile');
  });

  test('an area whose bands overlap still moves by value', () => {
    // Unstacked bands are drawn at their own values, as lines are, so the
    // higher value is the one drawn higher.
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
  });
});

describe('stacked area: two bands of the same value are two bands', () => {
  // At Q2 both bands are 20, but the lower one is drawn up to 20 and the upper
  // one up to 40: they share no point of the drawing, and stacked bands never
  // cross. Read as lines, the point was announced as "intersection at
  // (Subscriptions, Services)" in place of the band's name.

  test('names the band the cursor is on', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 1);

    const lower = bandAt(trace);
    trace.moveOnce('UPWARD');
    const upper = bandAt(trace);

    expect(lower).toBe('Subscriptions');
    expect(upper).toBe('Services');
  });

  test('plays the band\'s own tone rather than a chord', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    const sent: TraceState[] = [];
    trace.addObserver({ update: state => sent.push(state as TraceState) });
    trace.moveOnce('UPWARD');

    trace.moveOnce('FORWARD');

    const landed = sent.at(-1);
    expect(landed?.empty).toBe(false);
    expect(landed && !landed.empty ? landed.intersections ?? null : 'empty').toBeNull();
  });

  test('offers no crossing to go to, and no crossing mode', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.STACKED_AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    const crossings = trace.getExtremaTargets().filter(target => target.type === 'intersection');

    expect(crossings).toEqual([]);
    expect(trace.supportsIntersectionMode()).toBe(false);
  });

  test('an area whose bands overlap still meets where its values do', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    moveToColumn(trace, 1);

    expect(bandAt(trace)).not.toBe('Subscriptions');
    expect(trace.supportsIntersectionMode()).toBe(true);
  });
});

describe('stepped area (#413)', () => {
  /**
   * A filled band whose boundary is a staircase. `line.shape` and a fill are
   * independent in every library that has both, so this is an ordinary chart
   * rather than a contrived one -- a stacked step area is the standard way to
   * draw a cumulative count that changes at discrete events.
   *
   * Read as a smoothly interpolated band it tells a reader the wrong thing
   * about every interval: that the value slid between samples, when it in
   * fact held and then jumped.
   * @param type The area variant to build
   * @param direction The step convention the producer declared
   * @returns A layer carrying both the fill and the step direction
   */
  function steppedLayer(type: TraceType, direction: StepDirection): MaidrLayer {
    return { ...createAreaLayer(type, [SUBSCRIPTIONS, SERVICES]), stepDirection: direction };
  }

  test('announces the step direction of a plain area', () => {
    const trace = TraceFactory.create(steppedLayer(TraceType.AREA, 'hv')) as AreaTrace;
    trace.moveOnce('UPWARD');

    const stats = trace.description.stats;
    expect(stats.map(stat => stat.label)).toContain('Step direction');
    expect(stats.find(stat => stat.label === 'Step direction')?.value).toBe(
      'value holds until the next x value, then jumps',
    );
  });

  test('announces it for a stacked area too, alongside the totals', () => {
    const trace = TraceFactory.create(
      steppedLayer(TraceType.STACKED_AREA, 'vh'),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    const labels = trace.description.stats.map(stat => stat.label);
    // Both facts, not one instead of the other: the fill and the shape are
    // orthogonal and a reader needs each.
    expect(labels).toContain('Step direction');
    expect(labels).toContain('Total range');
  });

  test('uses the same wording as a step trace', () => {
    const trace = TraceFactory.create(steppedLayer(TraceType.AREA, 'mid')) as AreaTrace;
    trace.moveOnce('UPWARD');

    expect(
      trace.description.stats.find(stat => stat.label === 'Step direction')?.value,
    ).toBe('value jumps midway between x values');
  });

  test('says nothing when the producer declares no shape', () => {
    const trace = TraceFactory.create(
      createAreaLayer(TraceType.AREA, [SUBSCRIPTIONS, SERVICES]),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    expect(trace.description.stats.map(stat => stat.label)).not.toContain(
      'Step direction',
    );
  });

  test('still reads as an area rather than a step', () => {
    // The fill is not replaced by the shape. A reader is told it is an area
    // *and* how it moves between samples.
    const trace = TraceFactory.create(
      steppedLayer(TraceType.STACKED_AREA, 'hv'),
    ) as AreaTrace;
    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).plotType).toBe('stacked area');
  });
});
