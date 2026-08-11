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
    expect(nonEmptyState(at(MEANS, 0, 0)).text.cross.value).toBe(3.8);
    expect(nonEmptyState(at(MEANS, 1, 0)).text.cross.value).toBe(4.2);
    expect(nonEmptyState(at(MEANS, 2, 0)).text.cross.value).toBe(4.6);
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
    expect(text.cross.value).toBe(7.4);
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
    expect(text.cross.value).toBe(2);
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
    expect(text.cross.label).toBe('Group');
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
    expect(nonEmptyState(horizontal(0, 0)).text.cross.value).toBe(3.8);
    expect(nonEmptyState(horizontal(2, 0)).text.cross.value).toBe(4.6);
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
    expect(text.cross.value).toBe(7.3);
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

  test('tabulates each point with its bounds', () => {
    const { dataTable } = at(MEANS, 1, 0).description;

    expect(dataTable.headers).toEqual(['Group', 'Response', 'Lower', 'Upper']);
    expect(dataTable.rows[0]).toEqual(['control', 4.2, 3.8, 4.6]);
  });
});
