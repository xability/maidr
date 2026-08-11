import type { NotificationService } from '@service/notification';
import type { DumbbellData, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { DumbbellTrace } from '@model/dumbbell';
import { TraceFactory } from '@model/factory';
import { TextService } from '@service/text';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Life expectancy in two years, for three countries. One row rises, one falls
 * and one is unchanged, so the three directions the announcement distinguishes
 * are all present -- and every number is distinct, so a reading that took the
 * wrong end cannot coincide with the right one.
 */
const GAINS: DumbbellData = {
  startLabel: '1990',
  endLabel: '2020',
  points: [
    { x: 'Denmark', start: 71.2, end: 78.4 },
    { x: 'Latvia', start: 74.6, end: 69.5 },
    { x: 'Malta', start: 76.0, end: 76.0 },
  ],
};

/**
 * Create a minimal dumbbell layer for model-only tests.
 * @param data The pairs the layer carries
 * @param orientation Which way the chart is drawn
 * @returns Dumbbell layer definition
 */
function createLayer(
  data: DumbbellData,
  orientation?: Orientation,
): MaidrLayer {
  return {
    id: 'test-dumbbell-layer',
    type: TraceType.DUMBBELL,
    title: 'Life expectancy',
    axes: { x: { label: 'Country' }, y: { label: 'Years' } },
    orientation,
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: DumbbellTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a dumbbell trace positioned on one cell.
 * @param row Which end
 * @param col Which category
 * @param data The pairs the layer carries
 * @param orientation Which way the chart is drawn
 * @returns The positioned trace
 */
function dumbbell(
  row = 0,
  col = 0,
  data: DumbbellData = GAINS,
  orientation?: Orientation,
): DumbbellTrace {
  const trace = TraceFactory.create(
    createLayer(data, orientation),
  ) as DumbbellTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * Read the sentence a screen reader receives for the trace's current cell.
 *
 * The `TextState` a trace returns is an intermediate: which fields it fills
 * decides how `TextService` composes the sentence, so a field in the wrong
 * slot can leave every assertion on the state passing while the announcement
 * says something else.
 * @param trace The positioned trace
 * @returns The announcement, in the default verbose mode
 */
function announce(trace: DumbbellTrace): string {
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const text = new TextService(notification);
  const listener = jest.fn();
  const disposable = text.onChange(listener);

  text.update(trace.state);
  disposable.dispose();

  return (listener.mock.calls[0][0] as { value: string }).value;
}

describe('dumbbell registration', () => {
  test('the factory builds a DumbbellTrace', () => {
    expect(TraceFactory.create(createLayer(GAINS))).toBeInstanceOf(DumbbellTrace);
  });

  test('announces itself as a dumbbell', () => {
    expect(dumbbell().description.chartType).toBe('Dumbbell Chart');
  });
});

describe('navigation', () => {
  test('is two ends by however many categories', () => {
    const trace = dumbbell();

    // Down through both ends, then no further.
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(trace.moveOnce('UPWARD')).toBe(false);

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.moveOnce('FORWARD')).toBe(false);
  });

  test('enters on the starting end', () => {
    // The chart's own order, so a reader arriving at a row hears where it
    // began before hearing where it got to.
    expect(nonEmptyState(dumbbell()).text.section).toBe('1990');
  });

  test('keeps the ends in role order rather than by size', () => {
    // Latvia declined, so its finishing value is the *lower* of its pair.
    // Ordering rows by magnitude would put it on the row that held Denmark's
    // start, and the label under the cursor would flip mid-sweep.
    const declining = nonEmptyState(dumbbell(1, 1));

    expect(declining.text.section).toBe('2020');
    expect(declining.text.cross.value).toBe(69.5);
  });
});

describe('the change is the message', () => {
  test('names a rise by direction rather than by sign', () => {
    // "-3.1" asks the reader to hear a minus sign and work out which way it
    // points, on every row of the chart.
    expect(nonEmptyState(dumbbell(0, 0)).text.stack).toEqual({
      label: 'Increase',
      value: 7.2,
    });
  });

  test('names a fall', () => {
    expect(nonEmptyState(dumbbell(0, 1)).text.stack).toEqual({
      label: 'Decrease',
      value: 5.1,
    });
  });

  test('says neither when the pair did not move', () => {
    expect(nonEmptyState(dumbbell(0, 2)).text.stack).toEqual({
      label: 'Change',
      value: 0,
    });
  });

  test('carries the change at both ends of a row', () => {
    // A reader landing on either dot is asking the same question, and the one
    // who entered at the finish should not have to walk back to hear it.
    const start = nonEmptyState(dumbbell(0, 0)).text.stack;
    const end = nonEmptyState(dumbbell(1, 0)).text.stack;

    expect(end).toEqual(start);
  });

  test('does not spell out floating-point noise', () => {
    // 78.4 - 71.2 is 7.199999999999996 in IEEE 754, and a screen reader reads
    // every one of those digits.
    expect(nonEmptyState(dumbbell(0, 0)).text.stack?.value).toBe(7.2);
  });
});

describe('the announcement a reader hears', () => {
  test('names the category, the end, its value and the change', () => {
    // Asserted on the rendered sentence rather than on the `TextState`, since
    // a field in the wrong slot leaves the state looking correct.
    expect(announce(dumbbell(0, 0))).toBe(
      'Country is Denmark, 1990 Years is 71.2, Increase is 7.2',
    );
  });

  test('reads a decline the same way', () => {
    expect(announce(dumbbell(1, 1))).toBe(
      'Country is Latvia, 2020 Years is 69.5, Decrease is 5.1',
    );
  });

  test('falls back to naming the ends when the chart does not', () => {
    // Less than "1990" and "2020", but it still says which dot the cursor is
    // on -- the minimum a paired chart has to convey.
    const unnamed: DumbbellData = { points: GAINS.points };

    expect(announce(dumbbell(0, 0, unnamed))).toBe(
      'Country is Denmark, start Years is 71.2, Increase is 7.2',
    );
  });
});

describe('orientation', () => {
  test('swaps the axis labels when the categories run down the page', () => {
    const horizontal = nonEmptyState(dumbbell(0, 0, GAINS, Orientation.HORIZONTAL));

    expect(horizontal.text.main.label).toBe('Years');
    expect(horizontal.text.cross.label).toBe('Country');
    // Which real axis each value came from, so the formatter service picks
    // the right per-axis format.
    expect(horizontal.text.mainAxis).toBe('y');
    expect(horizontal.text.crossAxis).toBe('x');
  });

  test('keeps the grid ends-by-categories in both orientations', () => {
    // `AutoplayState` is keyed by direction, so a transposed dimension
    // mis-paces autoplay and mis-clamps the movement bounds.
    const horizontal = dumbbell(0, 0, GAINS, Orientation.HORIZONTAL);

    expect(horizontal.moveOnce('DOWNWARD')).toBe(false);
    expect(horizontal.moveOnce('UPWARD')).toBe(true);
    expect(horizontal.moveOnce('UPWARD')).toBe(false);
  });

  test('swaps the stereo position instead', () => {
    // Panning tracks where a point sits on screen, and a horizontal chart's
    // categories run down the page rather than across it.
    const { audio } = nonEmptyState(dumbbell(1, 2, GAINS, Orientation.HORIZONTAL));

    expect(audio.panning.x).toBe(1);
    expect(audio.panning.y).toBe(2);
  });
});

describe('audio', () => {
  test('pitches both ends on one scale', () => {
    // The two ends are the same quantity on the same axis, so the larger of a
    // pair has to sound higher. Per-row scaling would put them at the same
    // pitch and erase the gap by ear -- which is the whole chart.
    const start = nonEmptyState(dumbbell(0, 0)).audio.freq;
    const end = nonEmptyState(dumbbell(1, 0)).audio.freq;

    expect(start.min).toBe(end.min);
    expect(start.max).toBe(end.max);
    // Denmark's pair spans 71.2 to 78.4, and the scale spans the whole chart:
    // Latvia's 69.5 is the floor and Denmark's own 78.4 the ceiling.
    expect(start.min).toBe(69.5);
    expect(start.max).toBe(78.4);
    expect(start.raw).toBe(71.2);
    expect(end.raw).toBe(78.4);
  });
});

describe('braille', () => {
  test('renders one row per end', () => {
    const { braille } = nonEmptyState(dumbbell());

    expect(braille.empty).toBe(false);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }
    expect(braille.values).toEqual([
      [71.2, 74.6, 76.0],
      [78.4, 69.5, 76.0],
    ]);
    expect(braille.min).toEqual([71.2, 69.5]);
    expect(braille.max).toEqual([76.0, 78.4]);
  });
});

describe('extrema', () => {
  test('ranks the biggest mover each way, not the biggest value', () => {
    // The chart is drawn to show which rows moved and which way; the tallest
    // dot is a fact about the category rather than about the comparison.
    const targets = dumbbell().getExtremaTargets();

    expect(targets.map(target => target.label)).toEqual([
      'Largest increase at Denmark',
      'Largest decrease at Latvia',
    ]);
  });

  test('lands on the finishing end, where the change completed', () => {
    // `supportsExtrema` is true, so the base implementation throws: a trace
    // that advertises extrema without overriding both halves is worse than
    // one that does not advertise them.
    const trace = dumbbell();
    const [increase] = trace.getExtremaTargets();

    trace.navigateToExtrema(increase);

    const state = nonEmptyState(trace);
    expect(state.text.main.value).toBe('Denmark');
    expect(state.text.section).toBe('2020');
  });

  test('offers one target when every row moved the same way', () => {
    // Naming the same row as both extremes would report a spread the chart
    // does not have.
    const rising: DumbbellData = {
      points: [
        { x: 'a', start: 1, end: 2 },
        { x: 'b', start: 1, end: 2 },
      ],
    };

    expect(dumbbell(0, 0, rising).getExtremaTargets()).toHaveLength(1);
  });
});

describe('description', () => {
  test('counts the rows each way', () => {
    // What a sighted reader takes from the shape of the chart before reading
    // a single number.
    const { stats } = dumbbell().description;

    expect(stats).toContainEqual({ label: 'Increased', value: 1 });
    expect(stats).toContainEqual({ label: 'Decreased', value: 1 });
  });

  test('names the biggest mover each way', () => {
    const { stats } = dumbbell().description;

    expect(stats).toContainEqual({
      label: 'Largest increase',
      value: 'Denmark, 7.2',
    });
    expect(stats).toContainEqual({
      label: 'Largest decrease',
      value: 'Latvia, 5.1',
    });
  });

  test('heads the data table with the chart\'s own names for its ends', () => {
    const { dataTable } = dumbbell().description;

    expect(dataTable?.headers).toEqual(['Country', '1990', '2020', 'Change']);
    expect(dataTable?.rows[1]).toEqual(['Latvia', 74.6, 69.5, -5.1]);
  });
});
