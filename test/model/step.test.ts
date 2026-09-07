import type { MaidrLayer, StepDirection, StepPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { StepTrace } from '@model/step';
import { TraceType } from '@type/grammar';

/**
 * A four-stage hypnogram: one hour awake, two hours of N2, then REM. The runs
 * matter more than the values — this is the shape every assertion below leans
 * on.
 */
const HYPNOGRAM: StepPoint[] = [
  { x: 0, y: 3, label: 'Awake' },
  { x: 1, y: 1, label: 'N2' },
  { x: 2, y: 1, label: 'N2' },
  { x: 3, y: 2, label: 'REM' },
];

/**
 * Create a minimal step layer for model-only tests.
 * @param data Step data points, nested one array per series
 * @param stepDirection Optional step convention to author on the layer
 * @returns Step layer definition for StepTrace
 */
function createStepLayer(
  data: StepPoint[][],
  stepDirection?: StepDirection,
): MaidrLayer {
  return {
    id: 'test-step-layer',
    type: TraceType.STEP,
    title: 'Hypnogram',
    axes: {
      x: { label: 'Time' },
      y: { label: 'Sleep stage' },
    },
    ...(stepDirection ? { stepDirection } : {}),
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: StepTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

describe('step trace registration', () => {
  test('the factory builds a StepTrace for a step layer', () => {
    const trace = TraceFactory.create(createStepLayer([HYPNOGRAM]));

    expect(trace).toBeInstanceOf(StepTrace);
    expect(trace.traceType).toBe(TraceType.STEP);
  });

  test('announces itself as a step plot rather than as a line', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));
    trace.moveOnce('FORWARD');

    expect(nonEmptyState(trace).plotType).toBe('step');
  });

  test('names the chart type in the description', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));

    expect(trace.description.chartType).toBe('Step Plot');
  });
});

describe('step trace ordinal levels', () => {
  test('announces the level name instead of the numeric level', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));
    trace.moveOnce('FORWARD');

    const { text } = nonEmptyState(trace);
    expect(text.cross).toEqual({ label: 'Sleep stage', value: 'Awake' });
    expect(text.main).toEqual({ label: 'Time', value: 0 });
  });

  test('falls back to the numeric level when the data names none', () => {
    const trace = new StepTrace(createStepLayer([[
      { x: 0, y: 3 },
      { x: 1, y: 1 },
    ]]));
    trace.moveOnce('FORWARD');

    expect(nonEmptyState(trace).text.cross).toEqual({ label: 'Sleep stage', value: 3 });
  });

  test('sonifies and brailles the numeric level, not the name', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));
    trace.moveOnce('FORWARD');

    const { audio, braille } = nonEmptyState(trace);
    expect(audio.freq).toEqual({ min: 1, max: 3, raw: 3 });
    expect(braille).toMatchObject({
      empty: false,
      values: [[3, 1, 1, 2]],
      min: [1],
      max: [3],
    });
  });
});

describe('step trace description', () => {
  test('reports the runs, not just the points', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));
    const stats = new Map(
      trace.description.stats.map(stat => [stat.label, stat.value]),
    );

    expect(stats.get('Transitions')).toBe(2);
    expect(stats.get('Longest run')).toBe(2);
    expect(stats.get('Levels')).toBe('Awake, N2, REM');
  });

  test('prints the level name in the data table, not the code behind it', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));

    expect(trace.description.dataTable.rows).toEqual([
      [0, 'Awake'],
      [1, 'N2'],
      [2, 'N2'],
      [3, 'REM'],
    ]);
  });

  test('drops the magnitude stats when the y axis names its levels', () => {
    // The codes exist to drive the pitch, the braille and the range. Reported
    // as "Min value: 1, Max value: 3" two lines above `Awake, N2, REM`, with
    // no mapping between them, they invite the reading that one stage is three
    // times another.
    const labels = new StepTrace(createStepLayer([HYPNOGRAM]))
      .description
      .stats
      .map(stat => stat.label);

    expect(labels).not.toContain('Min value');
    expect(labels).not.toContain('Max value');
    expect(labels).toContain('Levels');
  });

  test('counts the distinct levels of a numeric staircase, which names none', () => {
    // A purely numeric step chart said nothing about levels at all, though how
    // many values the staircase takes is exactly what it encodes.
    const trace = new StepTrace(createStepLayer([[
      { x: 0, y: 3 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 3 },
    ]]));
    const stats = new Map(
      trace.description.stats.map(stat => [stat.label, stat.value]),
    );

    expect(stats.get('Distinct levels')).toBe(2);
    // The magnitudes are magnitudes here, so they stay.
    expect(stats.get('Min value')).toBe(1);
  });

  test('reports the step direction only when the data authors one', () => {
    const withoutDirection = new StepTrace(createStepLayer([HYPNOGRAM]));
    expect(
      withoutDirection.description.stats.some(stat => stat.label === 'Step direction'),
    ).toBe(false);

    const withDirection = new StepTrace(createStepLayer([HYPNOGRAM], 'vh'));
    expect(
      withDirection.description.stats.find(stat => stat.label === 'Step direction')?.value,
    ).toBe('value jumps at the current x value, then holds');
  });
});

describe('a step series with a missing epoch', () => {
  /** A level that never moves, with one epoch unmeasured in the middle. */
  const GAPPED = [
    { x: 0, y: 3 },
    { x: 1, y: null },
    { x: 2, y: 3 },
  ];

  test('does not count the absence as two level changes', () => {
    // `null !== 3` twice made one gap two transitions -- for a level that
    // never moved -- and inflated the count a reader uses to judge how
    // restless the night was.
    const stats = new Map(
      new StepTrace(createStepLayer([GAPPED])).description.stats.map(stat => [stat.label, stat.value]),
    );

    expect(stats.get('Transitions')).toBe(0);
  });

  test('does not let the absence break the run it sits inside', () => {
    const stats = new Map(
      new StepTrace(createStepLayer([GAPPED])).description.stats.map(stat => [stat.label, stat.value]),
    );

    expect(stats.get('Longest run')).toBe(2);
  });

  test('offers no transitions rotor, so it cannot stop on the absence', () => {
    // The same array drives the rotor, which would have stopped the reader
    // twice at a point with nothing to announce and called it a change.
    expect(new StepTrace(createStepLayer([GAPPED])).getRotorFilterUnits()).toEqual([]);
  });

  test('still sees a real change either side of one', () => {
    const trace = new StepTrace(createStepLayer([[
      { x: 0, y: 3 },
      { x: 1, y: null },
      { x: 2, y: 1 },
    ]]));

    expect(
      trace.description.stats.find(stat => stat.label === 'Transitions')?.value,
    ).toBe(1);
  });
});

describe('step trace transition navigation', () => {
  test('offers the transitions rotor unit when the level changes', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));

    expect(trace.getRotorFilterUnits()).toEqual([
      { key: 'transition', label: 'Transitions', noun: 'transitions' },
    ]);
  });

  test('offers no rotor unit for a series that never changes level', () => {
    const trace = new StepTrace(createStepLayer([[
      { x: 0, y: 1, label: 'N2' },
      { x: 1, y: 1, label: 'N2' },
    ]]));

    expect(trace.getRotorFilterUnits()).toEqual([]);
  });

  test('jumps forward to the point where the level changes', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));
    trace.moveOnce('FORWARD');

    expect(trace.moveToRotorFilter('transition', 'right')).toBe(true);
    expect(trace.col).toBe(1);
    expect(nonEmptyState(trace).text.cross?.value).toBe('N2');

    // Column 2 repeats N2, so the next transition is column 3, not column 2.
    expect(trace.moveToRotorFilter('transition', 'right')).toBe(true);
    expect(trace.col).toBe(3);
    expect(nonEmptyState(trace).text.cross?.value).toBe('REM');
  });

  test('jumps backward to the previous change and reports the boundary', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));
    trace.moveOnce('FORWARD');
    trace.moveToIndex(0, 3);

    expect(trace.moveToRotorFilter('transition', 'left')).toBe(true);
    expect(trace.col).toBe(1);

    expect(trace.moveToRotorFilter('transition', 'left')).toBe(false);
    expect(trace.col).toBe(1);
  });

  test('reports the boundary rather than moving past the last transition', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));
    trace.moveOnce('FORWARD');
    trace.moveToIndex(0, 3);

    expect(trace.moveToRotorFilter('transition', 'right')).toBe(false);
    expect(trace.col).toBe(3);
  });

  test('leaves unknown rotor units to the inherited handling', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM]));
    trace.moveOnce('FORWARD');

    expect(trace.moveToRotorFilter('bull', 'right')).toBe(false);
    expect(trace.col).toBe(0);
  });
});

describe('multi-series step trace', () => {
  const NIGHT_TWO: StepPoint[] = [
    { x: 0, y: 2, label: 'REM' },
    { x: 1, y: 3, label: 'Awake' },
    { x: 2, y: 1, label: 'N2' },
    { x: 3, y: 1, label: 'N2' },
  ];

  test('reports its group count so the instruction can name it', () => {
    // Context.getInstruction appends " with N groups" from groupCount. A step
    // trace calls itself 'step' rather than 'multiline', so the count is the
    // only thing telling a listener there is more than one night here.
    const trace = new StepTrace(createStepLayer([HYPNOGRAM, NIGHT_TWO]));
    trace.moveOnce('FORWARD');

    const state = nonEmptyState(trace);
    expect(state.plotType).toBe('step');
    expect(state.groupCount).toBe(2);
  });

  test('names the series the per-series stats belong to', () => {
    // Everything inherited above them is a fact about the whole layer, so an
    // unqualified "Transitions: 2" beside a second night with three read as
    // the chart's count -- and it changed as the reader moved, with nothing in
    // the dialog to say why.
    const named = (points: StepPoint[], z: string): StepPoint[] =>
      points.map(point => ({ ...point, z }));
    const trace = new StepTrace(createStepLayer([
      named(HYPNOGRAM, 'Night one'),
      named(NIGHT_TWO, 'Night two'),
    ]));
    const labels = trace.description.stats.map(stat => stat.label);

    expect(labels).toContain('Transitions in Night one');
    expect(labels).toContain('Longest run in Night one');
    expect(labels).not.toContain('Transitions');
  });

  test('lists every level the layer draws, not only the current series\' own', () => {
    // A stage drawn only in the second night still belongs in the list;
    // leaving it out reads as a chart that never reaches it.
    const trace = new StepTrace(createStepLayer([
      [{ x: 0, y: 3, label: 'Awake' }],
      [{ x: 0, y: 2, label: 'REM' }],
    ]));

    expect(
      trace.description.stats.find(stat => stat.label === 'Levels')?.value,
    ).toBe('Awake, REM');
  });

  test('offers the transitions unit when only one series ever changes level', () => {
    const flat: StepPoint[] = [
      { x: 0, y: 1, label: 'N2' },
      { x: 1, y: 1, label: 'N2' },
    ];
    const changing: StepPoint[] = [
      { x: 0, y: 1, label: 'N2' },
      { x: 1, y: 2, label: 'REM' },
    ];

    expect(new StepTrace(createStepLayer([flat, changing])).getRotorFilterUnits())
      .toHaveLength(1);
  });

  test('keeps transition jumps within the series the cursor is on', () => {
    const trace = new StepTrace(createStepLayer([HYPNOGRAM, NIGHT_TWO]));
    trace.moveOnce('FORWARD');
    trace.moveToIndex(1, 0);

    // NIGHT_TWO changes at columns 1 and 2, where HYPNOGRAM changes at 1 and 3.
    expect(trace.moveToRotorFilter('transition', 'right')).toBe(true);
    expect(trace.col).toBe(1);
    expect(trace.moveToRotorFilter('transition', 'right')).toBe(true);
    expect(trace.col).toBe(2);
    expect(trace.moveToRotorFilter('transition', 'right')).toBe(false);
  });
});
