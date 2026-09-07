import type { GanttPoint, MaidrLayer } from '@type/grammar';
import type { AudioState, NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { GanttTrace } from '@model/gantt';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Two lanes over a 100-unit axis.
 *
 * The lengths are all distinct and none equals another's start, so a reading
 * that confused a length with a position cannot coincide with the right
 * answer. `Build` starts exactly where `Design`'s first interval ends, which
 * is the handover a schedule is read for, and runs past `Design`'s second,
 * which is the overlap.
 */
const LANES: GanttPoint[][] = [
  [
    { x: 'Design', start: 0, end: 30, label: 'Wireframes' },
    { x: 'Design', start: 60, end: 75, label: 'Revisions' },
  ],
  [
    { x: 'Build', start: 30, end: 100, label: 'Implementation' },
  ],
];

/**
 * Create a minimal gantt layer for model-only tests.
 * @param points The lanes the layer carries
 * @param unit What a unit of the axis is called, or null for a chart that
 *   names none. Null rather than undefined because an explicit `undefined`
 *   argument selects the default, which is the opposite of what the caller
 *   passing it means.
 * @param orientation Which way the bars run, when the chart declares one
 * @returns Gantt layer definition
 */
function createLayer(
  points: GanttPoint[][] = LANES,
  unit: string | null = 'days',
  orientation?: Orientation,
): MaidrLayer {
  return {
    id: 'test-gantt-layer',
    type: TraceType.GANTT,
    title: 'Project schedule',
    // Declared as the real axes carry them for a chart drawn the default way
    // up: lanes along x, the schedule along y. A horizontal chart declares the
    // opposite, which is what the orientation test below builds.
    axes: { x: { label: 'Task' }, y: { label: 'Day' } },
    ...(orientation === undefined ? {} : { orientation }),
    data: unit === null ? { points } : { points, unit },
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: GanttTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a gantt trace positioned on one interval of one lane.
 * @param row Which lane
 * @param col Which interval
 * @param points The lanes the layer carries
 * @param unit What a unit of the axis is called, or null for none
 * @param orientation Which way the bars run, when the chart declares one
 * @returns The positioned trace
 */
function gantt(
  row = 0,
  col = 0,
  points: GanttPoint[][] = LANES,
  unit: string | null = 'days',
  orientation?: Orientation,
): GanttTrace {
  const trace = TraceFactory.create(
    createLayer(points, unit, orientation),
  ) as GanttTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * The stereo position the audio service will compute from an audio state.
 *
 * It reads the pan as `interpolate(x, 0, cols - 1, -1, 1)`, so asserting on
 * `panning.x` alone would pass for a trace that got `cols` wrong -- and `cols`
 * is the half of the pair that turns a fraction of the axis into a pan.
 * @param audio The audio state to read
 * @returns The pan, from -1 (hard left) to 1 (hard right)
 */
function pan(audio: AudioState): number {
  const { x, cols } = audio.panning;
  return (x / (cols - 1)) * 2 - 1;
}

describe('gantt registration', () => {
  test('the factory builds a GanttTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(GanttTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(gantt().description.chartType).toBe('Gantt Chart');
  });
});

describe('an interval is a span, not a magnitude', () => {
  test('pitch carries the length rather than either end', () => {
    // The fact a gantt is drawn to compare. A trace that pitched the start
    // would make a late short task sound like a long one.
    const { audio } = nonEmptyState(gantt(0, 0));

    expect(audio.freq.raw).toBe(30);
  });

  test('the length is scaled against every lane, not each lane alone', () => {
    // Per-lane scaling would put the longest task of an otherwise empty lane
    // at the same pitch as the longest task of a busy one.
    const { audio } = nonEmptyState(gantt(1, 0));

    expect(audio.freq.min).toBe(15);
    expect(audio.freq.max).toBe(70);
  });

  test('the announcement gives both ends and the length', () => {
    const { text } = nonEmptyState(gantt(0, 0));

    expect(text.main.value).toBe('Design, Wireframes');
    expect(text.crossRange).toEqual({ min: 0, max: 30 });
    expect(text.z?.label).toBe('Length');
    expect(text.z?.value).toBe('30 days');
  });

  test('an unnamed interval is announced by its lane alone', () => {
    const bare: GanttPoint[][] = [[{ x: 'Design', start: 0, end: 30 }]];

    expect(nonEmptyState(gantt(0, 0, bare)).text.main.value).toBe('Design');
  });

  test('a chart with no unit announces the length without inventing one', () => {
    const { text } = nonEmptyState(gantt(0, 0, LANES, null));

    expect(text.z?.value).toBe(30);
  });
});

describe('which axis is which follows the orientation', () => {
  test('a chart drawn the default way up names the lane on x', () => {
    const { text } = nonEmptyState(gantt());

    expect(text.main.label).toBe('Task');
    expect(text.cross?.label).toBe('Day');
    expect(text.mainAxis).toBe('x');
    expect(text.crossAxis).toBe('y');
  });

  test('a chart whose bars run left to right names the lane on y', () => {
    // The ordinary way a gantt is drawn, and the reason this is checked: with
    // the axes taken verbatim the announcement reads "Day is Design" -- the
    // lane announced under the schedule's own label, and the schedule under
    // the lane's. Both are wrong and neither raises anything.
    const { text } = nonEmptyState(
      gantt(0, 0, LANES, 'days', Orientation.HORIZONTAL),
    );

    expect(text.main.label).toBe('Day');
    expect(text.cross?.label).toBe('Task');
    expect(text.mainAxis).toBe('y');
    expect(text.crossAxis).toBe('x');
  });
});

describe('position is carried in the pan, not in the column index', () => {
  test('the axis maps onto the whole stereo field', () => {
    // 0 of 100 is hard left, 100 of 100 is hard right.
    expect(pan(nonEmptyState(gantt(0, 0)).audio)).toBeCloseTo(-1);
    expect(pan(nonEmptyState(gantt(1, 0)).audio)).toBeCloseTo(-0.4);
  });

  test('two lanes starting together sound together', () => {
    // The overlap question, answered by ear. `Design`'s second interval and
    // `Build`'s only one both start at a different time, so the property is
    // asserted on a chart built for it rather than on the shared fixture.
    const simultaneous: GanttPoint[][] = [
      [{ x: 'Design', start: 10, end: 20 }],
      [{ x: 'Build', start: 10, end: 90 }],
    ];

    expect(pan(nonEmptyState(gantt(0, 0, simultaneous)).audio))
      .toBeCloseTo(pan(nonEmptyState(gantt(1, 0, simultaneous)).audio));
  });

  test('a column index would have placed them apart', () => {
    // The reason the pan is not the column index: `Design`'s second interval
    // and `Build`'s first are columns 1 and 0, but the first starts at 60 and
    // the second at 30, so an index-based sweep would report the later task
    // as the earlier one.
    const later = pan(nonEmptyState(gantt(0, 1)).audio);
    const earlier = pan(nonEmptyState(gantt(1, 0)).audio);

    expect(later).toBeGreaterThan(earlier);
  });

  test('a chart occupying one instant pans to centre rather than dividing by zero', () => {
    const instant: GanttPoint[][] = [[{ x: 'Launch', start: 5, end: 5 }]];
    const { audio } = nonEmptyState(gantt(0, 0, instant));

    expect(Number.isFinite(pan(audio))).toBe(true);
    expect(pan(audio)).toBeCloseTo(0);
  });
});

describe('navigation walks lanes and intervals', () => {
  test('forward walks a lane and up reaches the next', () => {
    const trace = gantt();

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('Design, Revisions');
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
  });

  test('stops at the end of a lane rather than continuing into the next', () => {
    expect(gantt(1, 0).moveOnce('FORWARD')).toBe(false);
  });
});

describe('braille is a length profile, one row per lane', () => {
  test('carries the lengths the pitch carries', () => {
    const { braille } = nonEmptyState(gantt());

    expect(braille.empty).toBe(false);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }
    expect(braille.values).toEqual([[30, 15], [70]]);
  });
});

describe('a lane with nothing booked is enterable, not a crash', () => {
  /** Two lanes, the second holding nothing, and named so it can say so. */
  const WITH_EMPTY: GanttPoint[][] = [
    [{ x: 'Design', start: 0, end: 30, label: 'Wireframes' }],
    [],
  ];

  test('arrowing onto it produces a state rather than throwing', () => {
    // The data shape is nested precisely so an empty lane exists, and
    // `MovableGrid` bounds-checks the row count without checking that the
    // destination row has any columns -- so the cursor lands on a column that
    // is not there and every getter indexing it blindly throws. The whole
    // state push goes with it: audio, braille and highlight are computed in
    // the same object literal as the text.
    const trace = gantt(0, 0, WITH_EMPTY);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(() => trace.state).not.toThrow();
  });

  test('says the lane is empty rather than that the chart has ended', () => {
    // Borrowing the out-of-bounds cue would tell a reader they had left the
    // chart when they have not: the lane is a real row of the schedule and
    // its emptiness is the data.
    const trace = gantt(0, 0, WITH_EMPTY);
    trace.moveOnce('UPWARD');
    const state = nonEmptyState(trace);

    expect(state.empty).toBe(false);
    expect(state.text.z).toEqual({ label: 'Intervals', value: 0 });
  });

  test('has no length to pitch, so it sounds like a gap', () => {
    // `NaN` is how this codebase says "the point exists to navigate to, it
    // just has no value". A number here would put a length on a lane that
    // holds none.
    const trace = gantt(0, 0, WITH_EMPTY);
    trace.moveOnce('UPWARD');

    expect(Number.isNaN(Number(nonEmptyState(trace).audio.freq.raw))).toBe(true);
  });

  test('names itself from the declared lane names', () => {
    // A populated lane names itself from its intervals' `x`. An empty lane
    // holds no interval and so has nowhere to carry one -- which is why the
    // layer can declare them.
    const trace = TraceFactory.create({
      id: 'l',
      type: TraceType.GANTT,
      title: 'Project schedule',
      axes: { x: { label: 'Task' }, y: { label: 'Day' } },
      data: { points: WITH_EMPTY, unit: 'days', lanes: ['Design', 'Launch'] },
    }) as GanttTrace;
    trace.moveToIndex(0, 0);
    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).text.main.value).toBe('Launch');
  });

  test('names an undeclared empty lane positionally rather than nothing', () => {
    const trace = gantt(0, 0, WITH_EMPTY);
    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).text.main.value).toBe('Lane 2');
  });

  test('a declared name never overrides a lane that names itself', () => {
    // Both present is the ordinary case for a chart with one empty lane, and
    // a producer must not be able to make them disagree.
    const trace = TraceFactory.create({
      id: 'l',
      type: TraceType.GANTT,
      title: 'Project schedule',
      axes: { x: { label: 'Task' }, y: { label: 'Day' } },
      data: { points: WITH_EMPTY, lanes: ['WRONG', 'Launch'] },
    }) as GanttTrace;
    trace.moveToIndex(0, 0);

    expect(nonEmptyState(trace).text.main.value).toBe('Design, Wireframes');
  });
});

describe('the description says what a schedule is', () => {
  test('counts lanes and intervals separately', () => {
    const stats = gantt().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Number of lanes')).toBe(2);
    expect(read('Number of intervals')).toBe(3);
    expect(read('Shortest')).toBe('15 days');
    expect(read('Longest')).toBe('70 days');
    expect(read('Spans')).toBe('0 to 100');
  });

  test('says when a lane holds nothing, because navigating one is silent', () => {
    const withEmpty: GanttPoint[][] = [
      [{ x: 'Design', start: 0, end: 30 }],
      [],
    ];
    const stats = gantt(0, 0, withEmpty).description.stats;

    expect(stats.find(stat => stat.label === 'Empty lanes')?.value).toBe(1);
  });

  test('still says so when every lane holds nothing', () => {
    // The count used to sit inside the guard the length statistics need, so
    // the one schedule that is nothing but silence was the one that never
    // said so.
    const stats = gantt(0, 0, [[], []]).description.stats;

    expect(stats.find(stat => stat.label === 'Empty lanes')?.value).toBe(2);
  });

  test('reports missing rather than "NaN days" when an end does not parse', () => {
    // The unit turns the length into a *string*, so a NaN sails past both the
    // service's rounding and the dialog's blanking -- which test numbers --
    // and "Shortest: NaN days" is announced as a length the chart has.
    const unparseable = [[
      { x: 'Design', start: 0, end: '2025-03-15' },
    ]] as unknown as GanttPoint[][];
    const stats = gantt(0, 0, unparseable).description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Shortest')).toBe('missing');
    expect(read('Longest')).toBe('missing');
    expect(read('Spans')).toBe('missing');
  });

  test('names the fullest moment of the schedule', () => {
    // What overlaps what is what a schedule is read for. `Build` runs 30 to
    // 100 and `Design`'s second interval 60 to 75, so two things run at once
    // from 60.
    const stats = gantt().description.stats;

    expect(stats.find(stat => stat.label === 'Most intervals at once')?.value)
      .toBe('2 from 60');
  });

  test('says nothing about overlap when intervals only touch', () => {
    // A handover is not an overlap: one ends exactly where the next begins,
    // and reporting "2 at once" there would invent a clash the chart does not
    // draw.
    const backToBack: GanttPoint[][] = [
      [{ x: 'Design', start: 0, end: 30 }],
      [{ x: 'Build', start: 30, end: 60 }],
    ];
    const labels = gantt(0, 0, backToBack).description.stats.map(s => s.label);

    expect(labels).not.toContain('Most intervals at once');
  });

  test('the table names every interval, its ends and its length', () => {
    const { dataTable } = gantt().description;

    expect(dataTable?.headers).toEqual([
      'Task',
      'Label',
      'Start',
      'End',
      // The one column whose numbers are unit-bearing by definition, and the
      // only place the table said what they were counted in.
      'Length (days)',
    ]);
    expect(dataTable?.rows[0]).toEqual(['Design', 'Wireframes', 0, 30, 30]);
    expect(dataTable?.rows).toHaveLength(3);
  });

  test('heads the first column with the lane axis, not with x', () => {
    // Every real gantt adapter emits a horizontal chart, and a horizontal
    // chart runs its bars left to right -- which puts the dates on x and the
    // lanes on y, the way the google-charts binder authors them below. Headed
    // from x, the column of task names carried the label the dates belong to,
    // under an "Orientation: horizontal" line the dialog prints above it.
    const trace = TraceFactory.create({
      id: 'l',
      type: TraceType.GANTT,
      title: 'Project schedule',
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Day' }, y: { label: 'Task Name' } },
      data: { points: LANES, unit: 'days' },
    }) as GanttTrace;

    expect(trace.description.dataTable?.headers[0]).toBe('Task Name');
  });

  test('follows the orientation rather than the axis names', () => {
    // The shared fixture declares its axes for a chart drawn the default way
    // up -- lanes on x -- so asking it for a horizontal one is asking for the
    // swap alone. It lands on the schedule's label, which is what a layer
    // declaring an orientation it is not drawn at gets; the point is that the
    // header moves with the orientation, as `text.main.label` does.
    const { dataTable } = gantt(0, 0, LANES, 'days', Orientation.HORIZONTAL)
      .description;

    expect(dataTable?.headers[0]).toBe('Day');
  });

  test('keeps an empty lane in the table, named', () => {
    // The nested shape exists so a lane with nothing booked can be expressed,
    // and mapping over the intervals it does not have dropped the row from
    // the one place a reader reviews the whole schedule at once.
    const withEmpty: GanttPoint[][] = [
      [{ x: 'Design', start: 0, end: 30 }],
      [],
    ];
    const { dataTable } = gantt(0, 0, withEmpty).description;

    expect(dataTable?.rows).toHaveLength(2);
    expect(dataTable?.rows[1]).toEqual(['Lane 2', '', '', '', '']);
  });

  test('renders the ends through the chart\'s own axis format', () => {
    // A date-based schedule carries epoch counts on the axis and hands them
    // back as dates through the axis format -- which nothing between the
    // trace and the dialog resolves, so the table described numbers that
    // shared no digits with what navigating the same interval spoke.
    const trace = TraceFactory.create({
      id: 'l',
      type: TraceType.GANTT,
      title: 'Project schedule',
      axes: {
        x: { label: 'Task' },
        y: { label: 'Day', format: { function: 'return \'day \' + value' } },
      },
      data: { points: LANES, unit: 'days' },
    }) as GanttTrace;
    const { stats, dataTable } = trace.description;

    expect(dataTable?.rows[0]).toEqual(['Design', 'Wireframes', 'day 0', 'day 30', 30]);
    expect(stats.find(stat => stat.label === 'Spans')?.value)
      .toBe('day 0 to day 100');
  });

  test('rounds the fullest moment when the chart formats nothing', () => {
    // The count and the time are composed into one sentence, and the service
    // rounds a stat only when it is handed a bare number -- so an axis
    // position carrying float noise was spelled out in full beside `Spans`,
    // which rounds the same axis.
    const noisy: GanttPoint[][] = [
      [{ x: 'Design', start: 0, end: 1 }],
      // 0.30000000000000004 in IEEE 754, and the moment the second interval
      // joins the first.
      [{ x: 'Build', start: 0.1 + 0.2, end: 2 }],
    ];
    const stats = gantt(0, 0, noisy, null).description.stats;

    expect(stats.find(stat => stat.label === 'Most intervals at once')?.value)
      .toBe('2 from 0.3');
  });

  test('caps the table and says it did', () => {
    // A real schedule carries hundreds to thousands of tasks, and this was
    // the one table with no bound at all.
    const crowded: GanttPoint[][] = [
      Array.from({ length: 1200 }, (_unused, index) => ({
        x: 'Design',
        start: index,
        end: index + 1,
      })),
    ];
    const { stats, dataTable } = gantt(0, 0, crowded, null).description;

    expect(dataTable?.rows).toHaveLength(1000);
    expect(stats.find(stat => stat.label === 'Table rows')?.value)
      .toBe('first 1000 of 1200');
  });
});

describe('the announcement and the description read one length one way', () => {
  test('rounds the spoken length before it attaches the unit', () => {
    // Attaching the unit makes the value a string, which the formatter hands
    // back untouched -- so a fractional length was spoken in full while the
    // description's `Shortest`, `Longest` and Length column, the same number
    // under three more labels, all rounded it.
    const fractional: GanttPoint[][] = [
      [{ x: 'Design', start: 0, end: 1.23456 }],
    ];
    const trace = gantt(0, 0, fractional);
    const { stats } = trace.description;

    expect(nonEmptyState(trace).text.z?.value).toBe('1.23 days');
    expect(stats.find(stat => stat.label === 'Shortest')?.value).toBe('1.23 days');
  });
});
