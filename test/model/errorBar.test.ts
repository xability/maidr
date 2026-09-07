import type { ErrorBarPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ErrorBarTrace } from '@model/errorBar';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Three group means with asymmetric intervals. Every number is distinct so a
 * reading that took the wrong section, or the wrong sample, cannot coincide
 * with the right one.
 */
const MEANS: ErrorBarPoint[] = [
  { x: 'control', y: 4.2, yMin: 3.8, yMax: 4.6 },
  { x: 'low dose', y: 5.1, yMin: 4.0, yMax: 6.6 },
  { x: 'high dose', y: 7.3, yMin: 7.1, yMax: 7.4 },
];

/**
 * A band with bounds and nothing between them.
 *
 * What Highcharts' `arearange` draws, and what `geom_ribbon`,
 * `Plot.areaY` with `y1`/`y2`, and `fill_between` without a centre line all
 * arrive as. There is no honest estimate to put at these samples: the
 * midpoint is a number the chart never draws, and either bound announced as
 * the estimate loses the other (#1047).
 */
const BAND: ErrorBarPoint[] = [
  { x: 'jan', yMin: 5, yMax: 15 },
  { x: 'feb', yMin: 30, yMax: 50 },
];

/**
 * Create a minimal error bar layer for model-only tests.
 * @param data The points the layer carries
 * @returns Error bar layer definition
 */
function createLayer(data: ErrorBarPoint[]): MaidrLayer {
  return {
    id: 'test-error-bar-layer',
    type: TraceType.ERROR_BAR,
    title: 'Response by dose',
    axes: { x: { label: 'Group' }, y: { label: 'Response' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: ErrorBarTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a trace and place the cursor.
 * @param data The points the layer carries
 * @param row Section row to land on
 * @param col Sample column to land on
 * @returns The positioned trace
 */
function at(data: ErrorBarPoint[], row: number, col: number): ErrorBarTrace {
  const trace = TraceFactory.create(createLayer(data)) as ErrorBarTrace;
  trace.moveToIndex(row, col);
  return trace;
}

describe('error bar registration', () => {
  test('the factory builds an ErrorBarTrace', () => {
    expect(TraceFactory.create(createLayer(MEANS))).toBeInstanceOf(ErrorBarTrace);
  });

  test('announces itself as an error bar chart', () => {
    expect(at(MEANS, 1, 0).description.chartType).toBe('Error Bar Chart');
  });
});

describe('sections', () => {
  test('lays the three magnitudes out bottom to top', () => {
    // Moving up the grid must move up the value axis, or the cursor's
    // direction contradicts the chart's.
    expect(at(MEANS, 0, 0).state).toMatchObject({ empty: false });
    expect(nonEmptyState(at(MEANS, 0, 0)).text.cross?.value).toBe(3.8);
    expect(nonEmptyState(at(MEANS, 1, 0)).text.cross?.value).toBe(4.2);
    expect(nonEmptyState(at(MEANS, 2, 0)).text.cross?.value).toBe(4.6);
  });

  test('names which magnitude is being read', () => {
    // Without this, 3.8 and 4.6 at one x are indistinguishable from two
    // separate samples.
    expect(nonEmptyState(at(MEANS, 0, 0)).text.section).toBe('lower bound');
    expect(nonEmptyState(at(MEANS, 1, 0)).text.section).toBe('value');
    expect(nonEmptyState(at(MEANS, 2, 0)).text.section).toBe('upper bound');
  });

  test('announces the sample alongside the magnitude', () => {
    const { text } = nonEmptyState(at(MEANS, 2, 2));

    expect(text.main.value).toBe('high dose');
    expect(text.cross?.value).toBe(7.4);
  });

  test('omits a bound the data never carries', () => {
    // A row the cursor can enter and hear nothing in reads as a broken chart,
    // not as an absent bound.
    const upperOnly: ErrorBarPoint[] = [
      { x: 'a', y: 1, yMax: 2 },
      { x: 'b', y: 3, yMax: 5 },
    ];
    const trace = TraceFactory.create(createLayer(upperOnly)) as ErrorBarTrace;
    trace.moveToIndex(0, 0);

    expect(nonEmptyState(trace).text.section).toBe('value');
    trace.moveToIndex(1, 0);
    expect(nonEmptyState(trace).text.section).toBe('upper bound');
  });

  test('keeps a bare estimate navigable with no bounds at all', () => {
    const bare: ErrorBarPoint[] = [{ x: 'a', y: 1 }, { x: 'b', y: 2 }];
    const trace = TraceFactory.create(createLayer(bare)) as ErrorBarTrace;
    trace.moveToIndex(0, 1);

    const { text } = nonEmptyState(trace);
    expect(text.section).toBe('value');
    expect(text.cross?.value).toBe(2);
  });

  test('omits the estimate a band never carries', () => {
    // The mirror of `omits a bound the data never carries`, and the whole of
    // #1047: a band draws two bounds and nothing between them, so a `value`
    // row would be one a cursor can enter and hear nothing in. The estimate
    // now earns its row the same way the bounds do -- by having been drawn.
    const trace = TraceFactory.create(createLayer(BAND)) as ErrorBarTrace;

    trace.moveToIndex(0, 0);
    expect(nonEmptyState(trace).text.section).toBe('lower bound');
    expect(nonEmptyState(trace).text.cross?.value).toBe(5);

    trace.moveToIndex(1, 0);
    expect(nonEmptyState(trace).text.section).toBe('upper bound');
    expect(nonEmptyState(trace).text.cross?.value).toBe(15);
  });

  test('gives a band two rows, not three', () => {
    // A third row of `NaN` was what the unconditional `value` section
    // produced, and it would be a third of every interval announcing nothing.
    const trace = TraceFactory.create(createLayer(BAND)) as ErrorBarTrace;

    trace.moveToIndex(1, 0);
    expect(nonEmptyState(trace).text.section).toBe('upper bound');

    // There is no row above the upper bound to reach.
    trace.moveToIndex(2, 0);
    expect(nonEmptyState(trace).text.section).toBe('upper bound');
  });

  test('pitches a band by its own bounds', () => {
    // The sonification question #1047 raised, answered by not needing an
    // answer: with no estimate there is no invented midpoint to pitch, and
    // the two bounds are themselves positions the chart drew. The scale runs
    // from the lowest bound drawn to the highest, exactly as it does when
    // there is an estimate.
    const trace = TraceFactory.create(createLayer(BAND)) as ErrorBarTrace;

    trace.moveToIndex(0, 0);
    const bottom = nonEmptyState(trace).audio;
    trace.moveToIndex(1, 1);
    const top = nonEmptyState(trace).audio;

    expect(bottom.freq.min).toBe(5);
    expect(bottom.freq.max).toBe(50);
    expect(bottom.freq.raw).toBe(5);
    expect(top.freq.raw).toBe(50);
  });
});

describe('horizontal orientation', () => {
  /**
   * Build a horizontally drawn trace at a position.
   * @param row Section row to land on
   * @param col Sample column to land on
   * @returns The positioned trace
   */
  function horizontal(row: number, col: number): ErrorBarTrace {
    const trace = TraceFactory.create({
      ...createLayer(MEANS),
      orientation: Orientation.HORIZONTAL,
    }) as ErrorBarTrace;
    trace.moveToIndex(row, col);
    return trace;
  }

  test('swaps which axis is announced as the main one', () => {
    const { text } = nonEmptyState(horizontal(1, 0));

    expect(text.main.label).toBe('Response');
    expect(text.cross?.label).toBe('Group');
  });

  test('names the real axis each value came from', () => {
    // The formatter service defaults to x/y when these are absent, which is
    // silently wrong for a layer whose two axes format differently: a
    // currency estimate would be announced as a bare number and the category
    // as currency.
    const { text } = nonEmptyState(horizontal(1, 0));

    expect(text.mainAxis).toBe('y');
    expect(text.crossAxis).toBe('x');
  });

  test('heads the table with the axes the announcement names', () => {
    // The announcement above reads the category as `Response` and the
    // magnitude as `Group` on this layer. Heading the same two columns the
    // other way round makes the dialog contradict the reading it exists for
    // a listener to check.
    const { dataTable } = horizontal(1, 0).description;

    expect(dataTable.headers).toEqual(['Response', 'Group', 'Lower', 'Upper']);
    expect(dataTable.rows[0]).toEqual(['control', 4.2, 3.8, 4.6]);
  });

  test('pans by where the point sits on screen', () => {
    // The grid stays sections-by-samples whichever way the chart is drawn, so
    // panning is where the swap has to happen: on a horizontal chart the
    // samples run down the page rather than across it.
    const { audio } = nonEmptyState(horizontal(0, 2));

    expect(audio.panning.x).toBe(0);
    expect(audio.panning.y).toBe(2);
  });

  test('keeps the grid shape, so autoplay stays paced by direction', () => {
    // Deliberately NOT transposed, matching `Candlestick.dimension`: up and
    // down walk the sections in both orientations, and `AutoplayState` is
    // keyed by direction, so a transposed grid would mis-pace autoplay and
    // mis-clamp the movement bounds.
    const vertical = nonEmptyState(at(MEANS, 0, 2)).audio.panning;
    const flipped = nonEmptyState(horizontal(0, 2)).audio.panning;

    expect(flipped.rows).toBe(vertical.rows);
    expect(flipped.cols).toBe(vertical.cols);
  });

  test('reads the same magnitudes as the vertical chart', () => {
    expect(nonEmptyState(horizontal(0, 0)).text.cross?.value).toBe(3.8);
    expect(nonEmptyState(horizontal(2, 0)).text.cross?.value).toBe(4.6);
    expect(nonEmptyState(horizontal(2, 0)).text.section).toBe('upper bound');
  });
});

describe('extrema navigation', () => {
  test('offers the highest and lowest estimate', () => {
    // The estimates are what a reader compares across samples, so they are
    // what "go to the extreme" has to mean. The bounds are a different
    // question -- widest interval is not largest value -- and ranking both in
    // one menu would leave the reader unable to tell which they jumped to.
    const targets = at(MEANS, 1, 0).getExtremaTargets();

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ type: 'max', value: 7.3, pointIndex: 2 });
    expect(targets[1]).toMatchObject({ type: 'min', value: 4.2, pointIndex: 0 });
  });

  test('lands on the estimate row, not on a bound', () => {
    // The base `navigateToExtrema` throws when `supportsExtrema` is set, so a
    // trace advertising extrema without this is worse than one that does not.
    // Starting from the upper bound proves the row is set rather than kept.
    const trace = at(MEANS, 2, 0);
    const [highest] = trace.getExtremaTargets();

    trace.navigateToExtrema(highest);

    const { text } = nonEmptyState(trace);
    expect(text.section).toBe('value');
    expect(text.cross?.value).toBe(7.3);
  });

  test('ranks a band across both its bounds', () => {
    // A band has no estimate, so the fallback row put `getExtremaTargets` on
    // `lower` alone: the highest *lower* bound was offered as the maximum --
    // 30 at feb, when the chart's highest drawn point is feb's upper bound at
    // 50, which the trace's own `max` stat already reports. "Go to max" and
    // the description contradicted each other (#1133 review).
    const targets = at(BAND, 0, 0).getExtremaTargets();

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      type: 'max',
      value: 50,
      pointIndex: 1,
      segment: 'upper',
      label: 'Max upper bound at feb',
    });
    expect(targets[1]).toMatchObject({
      type: 'min',
      value: 5,
      pointIndex: 0,
      segment: 'lower',
      label: 'Min lower bound at jan',
    });
  });

  test('lands a band\'s maximum on its upper bound', () => {
    // The row has to follow the target's section, not the fallback: landing
    // on `lower` would announce feb's 30 under the name "max".
    const trace = at(BAND, 0, 0);
    const [highest] = trace.getExtremaTargets();

    trace.navigateToExtrema(highest);

    const { text } = nonEmptyState(trace);
    expect(text.section).toBe('upper bound');
    expect(text.cross?.value).toBe(50);
  });

  test('offers both ends of a one-sample band', () => {
    // Its two bounds share a column and a group, so a same-sample check that
    // did not compare the section would drop the minimum and report a band
    // with no spread at all.
    const single: ErrorBarPoint[] = [{ x: 'jan', yMin: 5, yMax: 15 }];
    const targets = at(single, 0, 0).getExtremaTargets();

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ type: 'max', value: 15 });
    expect(targets[1]).toMatchObject({ type: 'min', value: 5 });
  });

  test('offers one target when every estimate is equal', () => {
    // Naming the same sample as both the highest and the lowest would report
    // a spread the chart does not have.
    const flat: ErrorBarPoint[] = [
      { x: 'a', y: 5, yMin: 4, yMax: 6 },
      { x: 'b', y: 5, yMin: 3, yMax: 7 },
    ];
    const targets = at(flat, 1, 0).getExtremaTargets();

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ type: 'max', value: 5 });
  });
});

describe('audio', () => {
  test('scales every section against one range', () => {
    // The bounds and the estimate are the same quantity on the same axis, so
    // a bound has to sound higher than the estimate it sits above. Per-row
    // scaling would put them at the same pitch and erase the interval by ear.
    const lower = nonEmptyState(at(MEANS, 0, 0)).audio;
    const upper = nonEmptyState(at(MEANS, 2, 0)).audio;

    expect(lower.freq.min).toBe(upper.freq.min);
    expect(lower.freq.max).toBe(upper.freq.max);
    expect(lower.freq.raw).toBeLessThan(Number(upper.freq.raw));
  });

  test('spans the whole chart, not one section', () => {
    const { audio } = nonEmptyState(at(MEANS, 1, 0));

    expect(audio.freq.min).toBe(3.8);
    expect(audio.freq.max).toBe(7.4);
  });
});

describe('braille', () => {
  test('renders one row per section', () => {
    const { braille } = nonEmptyState(at(MEANS, 1, 1));

    expect(braille.empty).toBe(false);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }
    expect(braille.values).toHaveLength(3);
    expect(braille.values[1]).toEqual([4.2, 5.1, 7.3]);
    expect(braille.row).toBe(1);
    expect(braille.col).toBe(1);
  });
});

describe('description', () => {
  test('reports the interval widths, not only the value range', () => {
    // The width is what a reader judges when asking whether two estimates
    // differ, and it is not recoverable from the per-section ranges.
    const stats = at(MEANS, 1, 0).description.stats;

    // Exact, not approximate: the width is derived by subtraction, so it
    // carries float noise the source data does not (4.6 - 3.8 is
    // 0.30000000000000071), and a screen reader would spell every digit of
    // it out. Asserting the clean value is what holds that fix in place.
    expect(stats).toContainEqual({ label: 'Narrowest interval', value: 0.3 });
    expect(stats).toContainEqual({ label: 'Widest interval', value: 2.6 });
  });

  test('keeps an interval far below the noise threshold', () => {
    // Rounding to a fixed number of decimals would report this as zero,
    // which is a worse answer than the noise it was meant to remove.
    const tiny: ErrorBarPoint[] = [{ x: 'a', y: 1, yMin: 0.9995, yMax: 1.0005 }];
    const stats = (TraceFactory.create(createLayer(tiny)) as ErrorBarTrace)
      .description
      .stats;

    expect(stats).toContainEqual({ label: 'Narrowest interval', value: 0.001 });
  });

  test('stays silent about widths when nothing carries an interval', () => {
    const bare: ErrorBarPoint[] = [{ x: 'a', y: 1 }, { x: 'b', y: 2 }];
    const labels = (TraceFactory.create(createLayer(bare)) as ErrorBarTrace)
      .description
      .stats
      .map(stat => stat.label);

    expect(labels).not.toContain('Narrowest interval');
    expect(labels).not.toContain('Widest interval');
  });

  test('discards a width measured from a bound that is null', () => {
    // JSON carries `null` wherever TypeScript says optional, and `Number(null)`
    // is 0 -- so this used to report a width of 4.6, measured from a bound at
    // zero on the very sample whose lower row the trace refused to create.
    const halfBound: ErrorBarPoint[] = [
      { x: 'a', y: 4.2, yMin: null as unknown as number, yMax: 4.6 },
      { x: 'b', y: 5, yMin: 4.5, yMax: 5.7 },
    ];
    const stats = (TraceFactory.create(createLayer(halfBound)) as ErrorBarTrace)
      .description
      .stats;

    expect(stats).toContainEqual({ label: 'Narrowest interval', value: 1.2 });
    expect(stats).toContainEqual({ label: 'Widest interval', value: 1.2 });
  });

  test('says the estimates have no extent rather than an infinite one', () => {
    // `minMax` answers Infinity and -Infinity for an empty set by design, and
    // the dialog speaks those as words: "Min value is infinity" about a chart
    // that drew nothing at all.
    const stats = (TraceFactory.create(createLayer([])) as ErrorBarTrace)
      .description
      .stats;

    expect(stats).toContainEqual({ key: 'min', label: 'Min Response', value: 'missing' });
    expect(stats).toContainEqual({ key: 'max', label: 'Max Response', value: 'missing' });
  });

  test('reports the estimates own range beside the drawn extent', () => {
    // `Max value` is 7.4, an upper bound. A reader who has been navigating a
    // trace that calls the estimate "value" hears that as the largest
    // estimate, which is 7.3 -- and the estimates are what the extrema rank
    // over, so this is the range a jump to the maximum lands inside.
    const stats = at(MEANS, 1, 0).description.stats;

    expect(stats).toContainEqual({ key: 'max', label: 'Max Response', value: 7.4 });
    expect(stats).toContainEqual({ label: 'Estimate range', value: '4.2 to 7.3' });
  });

  test('leaves the estimate range out of a band, which has no estimate', () => {
    const labels = at(BAND, 0, 0).description.stats.map(stat => stat.label);

    expect(labels).not.toContain('Estimate range');
  });

  test('leaves it out of a chart that draws no bound to widen it', () => {
    // `Min value` and `Max value` already span exactly the estimates there,
    // so a third line reports the same two numbers under a third name.
    const bare: ErrorBarPoint[] = [{ x: 'a', y: 1 }, { x: 'b', y: 2 }];
    const stats = (TraceFactory.create(createLayer(bare)) as ErrorBarTrace)
      .description
      .stats;

    expect(stats).toContainEqual({ key: 'min', label: 'Min Response', value: 1 });
    expect(stats).toContainEqual({ key: 'max', label: 'Max Response', value: 2 });
    expect(stats.map(stat => stat.label)).not.toContain('Estimate range');
  });

  test('tabulates each point with its bounds', () => {
    const { dataTable } = at(MEANS, 1, 0).description;

    expect(dataTable.headers).toEqual(['Group', 'Response', 'Lower', 'Upper']);
    expect(dataTable.rows[0]).toEqual(['control', 4.2, 3.8, 4.6]);
  });

  test('gives a band no estimate column to leave empty', () => {
    // The trace already refuses a band a `value` row, a pitch and a section to
    // navigate into. A column of empty cells headed with the y axis label
    // reads as data the export lost rather than a centre line the chart never
    // drew.
    const { dataTable } = at(BAND, 0, 0).description;

    expect(dataTable.headers).toEqual(['Group', 'Lower', 'Upper']);
    expect(dataTable.rows[0]).toEqual(['jan', 5, 15]);
  });

  test('gives a bare estimate no bound columns to leave empty', () => {
    const bare: ErrorBarPoint[] = [{ x: 'a', y: 1 }, { x: 'b', y: 2 }];
    const { dataTable } = (TraceFactory.create(createLayer(bare)) as ErrorBarTrace)
      .description;

    expect(dataTable.headers).toEqual(['Group', 'Response']);
    expect(dataTable.rows[0]).toEqual(['a', 1]);
  });
});
