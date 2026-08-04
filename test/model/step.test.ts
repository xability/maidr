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
    expect(nonEmptyState(trace).text.cross.value).toBe('N2');

    // Column 2 repeats N2, so the next transition is column 3, not column 2.
    expect(trace.moveToRotorFilter('transition', 'right')).toBe(true);
    expect(trace.col).toBe(3);
    expect(nonEmptyState(trace).text.cross.value).toBe('REM');
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
