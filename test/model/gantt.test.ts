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
    expect(text.cross.label).toBe('Day');
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
    expect(text.cross.label).toBe('Task');
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

  test('the table names every interval, its ends and its length', () => {
    const { dataTable } = gantt().description;

    expect(dataTable?.headers).toEqual(['Task', 'Label', 'Start', 'End', 'Length']);
    expect(dataTable?.rows[0]).toEqual(['Design', 'Wireframes', 0, 30, 30]);
    expect(dataTable?.rows).toHaveLength(3);
  });
});
