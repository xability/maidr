import type { LineTrace } from '@model/line';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { RadarTrace } from '@model/radar';
import { TraceType } from '@type/grammar';

/**
 * Four spokes, two series. Four is the number that makes the angles exact --
 * 12, 3, 6 and 9 o'clock -- so the panning can be asserted as values rather
 * than as inequalities, and a sweep that stayed linear cannot coincide with
 * one that goes round.
 */
const SPECS: LinePoint[][] = [
  [
    { x: 'speed', y: 8, z: 'model A' },
    { x: 'range', y: 4, z: 'model A' },
    { x: 'comfort', y: 6, z: 'model A' },
    { x: 'price', y: 9, z: 'model A' },
  ],
  [
    { x: 'speed', y: 5, z: 'model B' },
    { x: 'range', y: 7, z: 'model B' },
    { x: 'comfort', y: 3, z: 'model B' },
    { x: 'price', y: 2, z: 'model B' },
  ],
];

/**
 * Create a minimal radar layer for model-only tests.
 * @param type Which of the two circular types to declare
 * @param data The spokes the layer carries
 * @returns Radar layer definition
 */
function createLayer(
  type: TraceType = TraceType.RADAR,
  data: LinePoint[][] = SPECS,
): MaidrLayer {
  return {
    id: 'test-radar-layer',
    type,
    title: 'Model comparison',
    axes: { x: { label: 'Attribute' }, y: { label: 'Score' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: RadarTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a radar trace positioned on one spoke of one series.
 * @param row Which series
 * @param col Which spoke
 * @param type Which of the two circular types to declare
 * @param data The spokes the layer carries
 * @returns The positioned trace
 */
function radar(
  row = 0,
  col = 0,
  type: TraceType = TraceType.RADAR,
  data: LinePoint[][] = SPECS,
): RadarTrace {
  const trace = TraceFactory.create(createLayer(type, data)) as RadarTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * The stereo position the audio service will compute from a state.
 *
 * It reads the pan as `interpolate(x, 0, cols - 1, -1, 1)`, so asserting on
 * `panning.x` alone would pass for a trace that got `cols` wrong -- and `cols`
 * is the half of the pair that makes the arithmetic land on `sin θ`.
 *
 * Takes the audio state rather than the trace state so the tones of an
 * intersection chord, which are audio states in their own right, can be
 * measured by the same arithmetic as the cursor's own tone.
 * @param audio The audio state to read
 * @returns The pan, from -1 (hard left) to 1 (hard right)
 */
function pan(audio: AudioState): number {
  const { x, cols } = audio.panning;
  return (x / (cols - 1)) * 2 - 1;
}

/**
 * The pan of a positioned trace's own tone.
 * @param state The trace state to read
 * @returns The pan, from -1 (hard left) to 1 (hard right)
 */
function panOf(state: NonEmptyTraceState): number {
  return pan(state.audio);
}

describe('radar registration', () => {
  test('the factory builds a RadarTrace for both circular types', () => {
    expect(TraceFactory.create(createLayer(TraceType.RADAR)))
      .toBeInstanceOf(RadarTrace);
    expect(TraceFactory.create(createLayer(TraceType.POLAR_AREA)))
      .toBeInstanceOf(RadarTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(radar().description.chartType).toBe('Radar Chart');
    expect(radar(0, 0, TraceType.POLAR_AREA).description.chartType)
      .toBe('Polar Area Chart');
  });

  test('does not report itself as a line plot', () => {
    // It extends the line trace, which names itself 'single line' or
    // 'multiline' -- and that is what the instruction text and the layer
    // switch announce. A reader told they are on a line plot has been told
    // the wrong chart.
    expect(nonEmptyState(radar()).plotType).toBe('radar');
    expect(nonEmptyState(radar(0, 0, TraceType.POLAR_AREA)).plotType)
      .toBe('polar area');
  });
});

describe('navigation is the multi-line model', () => {
  test('walks spokes across and series up', () => {
    // Series zero is the bottom row, as it is for any multi-line layer, so
    // UPWARD reaches the next series -- in series order, not by value.
    const trace = radar();

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('range');
    expect(nonEmptyState(trace).text.cross?.value).toBe(7);
  });

  test('up and down follow series order, not value', () => {
    // Alice is the higher at Math and the lower at History. By value, Up
    // reached Bob at History and Down did at Math, and the other way said "No
    // more data to display" with Bob one press away.
    const grades: LinePoint[][] = [
      ['Math', 'Science', 'English', 'History'].map((x, index) => (
        { x, y: [85, 90, 80, 70][index], z: 'Alice' })),
      ['Math', 'Science', 'English', 'History'].map((x, index) => (
        { x, y: [70, 75, 85, 80][index], z: 'Bob' })),
    ];
    const trace = radar(0, 0, TraceType.RADAR, grades);

    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(trace.row).toBe(1);
    expect(nonEmptyState(trace).text.cross?.value).toBe(70);
    expect(trace.moveOnce('UPWARD')).toBe(false);

    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(trace.row).toBe(0);
    expect(nonEmptyState(trace).text.cross?.value).toBe(70);
    expect(nonEmptyState(trace).braille).toMatchObject({ row: 0 });
  });

  test('a series without the spoke is passed over, and a gap at it is landed on', () => {
    const series = (name: string, values: (number | null)[]): LinePoint[] =>
      ['Math', 'Science'].map((x, index) => ({ x, y: values[index] as number, z: name }));
    const trace = radar(0, 0, TraceType.RADAR, [
      series('A', [5, 6]),
      [{ x: 'Science', y: 4, z: 'B' }],
      series('C', [null, 7]),
      series('D', [3, 2]),
    ]);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(trace.row).toBe(2);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(trace.row).toBe(3);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(trace.row).toBe(2);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(trace.row).toBe(0);
  });

  test('control and up and down reach the last and first series', () => {
    // At speed, model A (8) is above model B (5): the line chart's extreme
    // went to A, from which Up could still move.
    const trace = radar(0, 0);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(trace.row).toBe(1);
    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(trace.row).toBe(0);
    expect(trace.moveToExtreme('FORWARD')).toBe(true);
    expect(trace.col).toBe(3);
  });

  test('stops at the last spoke rather than wrapping', () => {
    // The outline is closed, so wrapping would arguably read better -- but
    // every other trace stops at its bounds, and a reader who has learned
    // that would be silently looped without being told. Changing it is a
    // decision for the whole navigation model, not for one trace.
    const trace = radar(0, 3);

    expect(trace.moveOnce('FORWARD')).toBe(false);
  });
});

describe('the sweep goes round rather than across', () => {
  test('places four spokes at the quarters of the circle', () => {
    // 12 o'clock centre, 3 o'clock hard right, 6 o'clock centre again,
    // 9 o'clock hard left. A linear pan would give -1, -1/3, 1/3, 1.
    expect(panOf(nonEmptyState(radar(0, 0)))).toBeCloseTo(0);
    expect(panOf(nonEmptyState(radar(0, 1)))).toBeCloseTo(1);
    expect(panOf(nonEmptyState(radar(0, 2)))).toBeCloseTo(0);
    expect(panOf(nonEmptyState(radar(0, 3)))).toBeCloseTo(-1);
  });

  test('returns to where it started, which a line never does', () => {
    // The property that makes a circle audible: the first and third spokes
    // of a four-spoke chart sit at the same stereo position.
    const first = panOf(nonEmptyState(radar(0, 0)));
    const opposite = panOf(nonEmptyState(radar(0, 2)));

    expect(first).toBeCloseTo(opposite);
  });

  test('gives every series the same angles', () => {
    // A spoke is a place on the chart, not a place in a series.
    for (let col = 0; col < 4; col++) {
      expect(panOf(nonEmptyState(radar(0, col))))
        .toBeCloseTo(panOf(nonEmptyState(radar(1, col))));
    }
  });

  test('keeps the series index in the panning it does not use for stereo', () => {
    // `y` and `rows` are carried through to the tone but not read for the
    // stereo position, so they stay honest rather than being zeroed.
    const { panning } = nonEmptyState(radar(1, 0)).audio;

    expect(panning.y).toBe(1);
    expect(panning.rows).toBe(2);
  });
});

describe('a refused move is heard from where the spoke is', () => {
  /**
   * The empty state a refused move pushes to observers.
   * @param trace The positioned trace
   * @param direction The move to refuse
   * @returns The pushed state's audio
   */
  function refused(trace: RadarTrace, direction: 'FORWARD' | 'BACKWARD' | 'UPWARD' | 'DOWNWARD'): AudioState {
    const pushed: unknown[] = [];
    trace.addObserver({ update: state => pushed.push(state) });

    expect(trace.moveOnce(direction)).toBe(false);

    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ empty: true, type: 'trace' });
    return { panning: (pushed[0] as { audio: AudioState['panning'] }).audio } as AudioState;
  }

  test('the boundary tone pans where the spoke\'s own tone does', () => {
    // Down from the first series is refused on every spoke. Panned by the
    // spoke's index, the chord swept from hard left to hard right while the
    // spoke's tone went round: 3 o'clock chimed left of centre, and 9
    // o'clock hard right.
    for (let col = 0; col < 4; col++) {
      const point = panOf(nonEmptyState(radar(0, col)));

      expect(pan(refused(radar(0, col), 'DOWNWARD'))).toBeCloseTo(point, 10);
    }
  });

  test('the first and last spokes chime where they sit, not at the ends of a row', () => {
    expect(pan(refused(radar(0, 0), 'BACKWARD'))).toBeCloseTo(0, 10);
    expect(pan(refused(radar(1, 3), 'FORWARD'))).toBeCloseTo(-1, 10);
    expect(pan(refused(radar(1, 1), 'UPWARD'))).toBeCloseTo(1, 10);
  });

  test('a radar with no points still answers a refused move', () => {
    const trace = TraceFactory.create(createLayer(TraceType.RADAR, [[]])) as RadarTrace;

    expect(() => trace.notifyOutOfBounds()).not.toThrow();
  });
});

describe('spoke angles', () => {
  test('are taken from the longest series, not the first', () => {
    // A ragged chart is not what a radar is for, but a producer can emit one,
    // and a column with no angle would pan to whatever `undefined`
    // interpolates to.
    const ragged: LinePoint[][] = [
      [{ x: 'a', y: 1 }, { x: 'b', y: 2 }],
      [{ x: 'a', y: 3 }, { x: 'b', y: 4 }, { x: 'c', y: 5 }],
    ];
    const trace = radar(1, 2, TraceType.RADAR, ragged);

    expect(Number.isFinite(panOf(nonEmptyState(trace)))).toBe(true);
  });

  test('divide the circle evenly whatever the values are', () => {
    // Unlike a pie, whose angles follow from the shares. Doubling one spoke's
    // value must not move any spoke.
    const doubled = SPECS.map(series =>
      series.map((point, index) =>
        index === 0 ? { ...point, y: Number(point.y) * 2 } : point),
    );

    for (let col = 0; col < 4; col++) {
      expect(panOf(nonEmptyState(radar(0, col, TraceType.RADAR, doubled))))
        .toBeCloseTo(panOf(nonEmptyState(radar(0, col))));
    }
  });
});

describe('the description dialog', () => {
  test('names series and spokes rather than lines and points', () => {
    // The dialog renders these labels literally, so inheriting the line
    // trace's wording tells a reader opening it that they are on a chart with
    // "lines" -- the same misdescription the spoken plot type avoids, one
    // dialog further along.
    const labels = radar().description.stats.map(stat => stat.label);

    expect(labels).toContain('Number of series');
    expect(labels).toContain('Spokes per series');
    expect(labels).toContain('Series names');
    expect(labels).not.toContain('Number of lines');
    expect(labels).not.toContain('Points per line');
  });

  test('heads the data table with the series rather than the line', () => {
    expect(radar().description.dataTable?.headers).toEqual([
      'Attribute',
      'Score',
      'Series',
    ]);
  });

  test('counts a polar area\'s sectors rather than its spokes', () => {
    // Both circular types share this trace, and a polar area draws wedges. It
    // is announced as a `polar area` and then had its spokes counted.
    const labels = radar(0, 0, TraceType.POLAR_AREA).description.stats.map(stat => stat.label);

    expect(labels).toContain('Sectors per series');
    expect(labels).not.toContain('Spokes per series');
  });

  test('names the categories in the order they are drawn', () => {
    // A radar has few categories and they are its whole vocabulary, so a
    // reader opening `d` before navigating was given a count and no names --
    // and the order decides the outline's shape outright.
    expect(radar().description.stats).toContainEqual({
      label: 'Spokes, in order',
      value: 'speed, range, comfort, price',
    });
  });

  test('names numeric categories without grouping them in thousands', () => {
    const binned: LinePoint[][] = [[
      { x: 10000, y: 1 },
      { x: 20000, y: 2 },
      { x: 30000, y: 3 },
    ]];

    expect(radar(0, 0, TraceType.POLAR_AREA, binned).description.stats).toContainEqual({
      label: 'Sectors, in order',
      value: '10000, 20000, 30000',
    });
  });

  test('names a polar area\'s categories under its own noun', () => {
    expect(radar(0, 0, TraceType.POLAR_AREA).description.stats).toContainEqual({
      label: 'Sectors, in order',
      value: 'speed, range, comfort, price',
    });
  });

  test('does not report an extent across a circle', () => {
    // Inherited from the line, the x extent names the first and last column.
    // On a circle those two are neighbours, so "speed to price" describes a
    // sweep the chart never makes.
    expect(radar().description.stats.map(stat => stat.label))
      .not
      .toContain('Attribute range');
  });

  test('names an unnamed series after the series, not after a line', () => {
    // `Series names: Line 1, Line 2`, in a column headed `Series`, named a
    // chart type the reader is not on and offered an index where a name was
    // promised.
    const unnamed: LinePoint[][] = [
      [{ x: 'speed', y: 8 }, { x: 'range', y: 4 }],
      [{ x: 'speed', y: 5 }, { x: 'range', y: 7 }],
    ];

    expect(radar(0, 0, TraceType.RADAR, unnamed).description.stats)
      .toContainEqual({ label: 'Series names', value: 'Series 1, Series 2' });
  });

  test('leaves a line chart\'s own wording alone', () => {
    // The labels are parameterised on `LineTrace`, so this is what says the
    // parameterisation did not change the chart it is named after.
    const line = TraceFactory.create({
      id: 'l',
      type: TraceType.LINE,
      title: 't',
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: SPECS,
    }) as LineTrace;
    const labels = line.description.stats.map(stat => stat.label);

    expect(labels).toContain('Number of lines');
    expect(labels).toContain('Points per line');
  });
});

describe('what a series is called out loud', () => {
  test('is what the dialog calls it, not the line\'s "Group"', () => {
    // The rename landed in the dialog and not in speech, so a radar announced
    // "Group is model A" on every move under a description headed `Series` --
    // two words for one referent, which is the defect the rename removes.
    const state = nonEmptyState(radar(0, 0));

    expect(state.text.z).toEqual({ label: 'Series', value: 'model A' });
  });
});

describe('an intersection is heard from where the spoke is', () => {
  /** Two series meeting on the third spoke, at 6 o'clock. */
  const MEETING: LinePoint[][] = [
    [
      { x: 'speed', y: 8, z: 'model A' },
      { x: 'range', y: 4, z: 'model A' },
      { x: 'comfort', y: 6, z: 'model A' },
      { x: 'price', y: 9, z: 'model A' },
    ],
    [
      { x: 'speed', y: 5, z: 'model B' },
      { x: 'range', y: 7, z: 'model B' },
      { x: 'comfort', y: 6, z: 'model B' },
      { x: 'price', y: 2, z: 'model B' },
    ],
  ];

  test('every tone in the chord pans to the spoke, not across the sweep', () => {
    // The chord's panning is built where the intersection is found, which is
    // a different place from the tone for the cursor's own point. If only the
    // latter went round the circle, two series meeting at 6 o'clock would be
    // heard at centre by one route and hard right by the other.
    const state = nonEmptyState(radar(0, 2, TraceType.RADAR, MEETING));

    expect(state.intersections).toHaveLength(2);
    for (const intersection of state.intersections ?? []) {
      expect(pan(intersection)).toBeCloseTo(Math.sin(Math.PI), 10);
    }
  });

  test('the chord arrives from one place, and `group` tells the tones apart', () => {
    // An intersection is one point several series share, so a chord that
    // spread its tones across the field would place that point somewhere the
    // chart does not have.
    const state = nonEmptyState(radar(0, 2, TraceType.RADAR, MEETING));
    const pans = new Set((state.intersections ?? []).map(pan));

    expect(pans.size).toBe(1);
    expect((state.intersections ?? []).map(i => i.group)).toEqual([0, 1]);
  });
});

describe('where the Go To dialog says two outlines cross', () => {
  /** Mermaid's radar example: Alice and Bob across six subjects. */
  const GRADES: LinePoint[][] = [
    ['Math', 'Science', 'English', 'History', 'Geography', 'Art'].map((x, index) => (
      { x, y: [85, 90, 80, 70, 75, 90][index], z: 'Alice' })),
    ['Math', 'Science', 'English', 'History', 'Geography', 'Art'].map((x, index) => (
      { x, y: [70, 75, 85, 80, 90, 85][index], z: 'Bob' })),
  ];

  test('between the spokes it lies between, not on the nearer one', () => {
    // Alice goes 90 -> 80 and Bob 75 -> 85 from Science to English, so the
    // outlines cross between those spokes. It was offered "at x=English".
    const trace = radar(0, 0, TraceType.RADAR, GRADES);
    const crossings = trace.getExtremaTargets().filter(target => target.type === 'intersection');

    expect(crossings.map(target => target.label)).toEqual([
      'Slope intersection at x between Science and English, y=82.5',
      'Slope intersection at x between Geography and Art, y=86.25',
    ]);
    // Choosing one still lands on the nearer spoke, the nearest point there is.
    expect(crossings.map(target => target.pointIndex)).toEqual([2, 5]);
  });
});

describe('the rest of the reading is unchanged', () => {
  test('pitch still tracks the value', () => {
    const { audio } = nonEmptyState(radar(0, 0));

    expect(audio.freq.raw).toBe(8);
  });

  test('braille is one row per series', () => {
    const { braille } = nonEmptyState(radar());

    expect(braille.empty).toBe(false);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }
    expect(braille.values).toEqual([[8, 4, 6, 9], [5, 7, 3, 2]]);
  });

  test('the spoke and its value are announced', () => {
    const { text } = nonEmptyState(radar(1, 2));

    expect(text.main.value).toBe('comfort');
    expect(text.cross?.value).toBe(3);
  });
});
