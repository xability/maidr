import type { MaidrLayer, VennPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { VennTrace } from '@model/venn';
import { TraceType } from '@type/grammar';

/** Three sets, every overlap named, as mermaid's own example draws them. */
const FEATURE: VennPoint[] = [
  { sets: ['Desirable'], size: 10 },
  { sets: ['Feasible'], size: 10 },
  { sets: ['Viable'], size: 8 },
  { sets: ['Desirable', 'Feasible'], size: 2.5, label: 'Buildable' },
  { sets: ['Feasible', 'Viable'], size: 2, label: 'Sustainable' },
  { sets: ['Desirable', 'Viable'], size: 2.5, label: 'Marketable' },
  { sets: ['Desirable', 'Feasible', 'Viable'], size: 1, label: 'Ship it' },
];

/**
 * Builds an entered Venn trace.
 * @param data - The regions
 * @returns The trace, on its first set
 */
function venn(data: VennPoint[] = FEATURE): VennTrace {
  const layer: MaidrLayer = { id: 'venn', type: TraceType.VENN, title: 'Features', data };
  const trace = TraceFactory.create(layer) as VennTrace;
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * The trace's populated state.
 * @param trace - The trace
 * @returns Its state
 */
function state(trace: VennTrace): NonEmptyTraceState {
  const current = trace.state;
  if (current.empty) {
    throw new Error('Expected a non-empty state');
  }
  return current;
}

/**
 * One aside of the announcement.
 * @param trace - The trace
 * @param label - The aside's label
 * @returns Its value
 */
function aside(trace: VennTrace, label: string): string | undefined {
  return state(trace).text.asides?.find(one => one.label === label)?.value;
}

describe('venn registration', () => {
  test('the factory builds a VennTrace that names itself', () => {
    const trace = venn();
    expect(trace).toBeInstanceOf(VennTrace);
    expect(trace.description.chartType).toBe('Venn Diagram');
  });
});

describe('the regions are read by how many sets they join', () => {
  test('it enters on the first set, with its size and what it overlaps', () => {
    const trace = venn();
    const text = state(trace).text;
    expect(text.main.value).toBe('Desirable');
    expect(text.cross?.value).toBe(10);
    expect(aside(trace, 'Overlaps')).toBe('Feasible, Viable');
  });

  test('down goes into the first overlap the set is part of, and up comes back', () => {
    const trace = venn();
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    expect(state(trace).text.main.value).toBe('Viable');
    trace.moveOnce('DOWNWARD');
    expect(state(trace).text.main.value).toBe('Desirable and Viable');
    expect(aside(trace, 'Name')).toBe('Marketable');
    expect(aside(trace, 'Share of its smallest set')).toBe('31.3%');
    trace.moveOnce('DOWNWARD');
    expect(state(trace).text.main.value).toBe('Desirable, Feasible and Viable');
    trace.moveOnce('UPWARD');
    expect(state(trace).text.main.value).toBe('Desirable and Viable');
    trace.moveOnce('UPWARD');
    expect(state(trace).text.main.value).toBe('Viable');
  });

  test('a set named only in an overlap still has a region of its own', () => {
    const trace = venn([{ sets: ['A'] }, { sets: ['A', 'B'], items: ['x'] }]);
    trace.moveOnce('FORWARD');
    expect(state(trace).text.main.value).toBe('B');
    expect(trace.description.stats.find(one => one.label === 'Number of sets')?.value).toBe(2);
  });

  test('a lone region in its row is panned to the centre, not hard left', () => {
    // A row of one region has no left or right. Counted as two columns, its
    // only region sat at the left edge and the position claimed a second one.
    const trace = venn();
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');

    const panning = state(trace).audio.panning;

    expect(state(trace).text.main.value).toBe('Desirable, Feasible and Viable');
    expect(panning).toEqual({ x: 0, y: 2, rows: 3, cols: 1 });
  });

  test('a row of several regions pans across all of them', () => {
    const trace = venn();

    const sets = state(trace).audio.panning.cols;
    trace.moveOnce('DOWNWARD');
    const pairs = state(trace).audio.panning.cols;

    expect(sets).toBe(3);
    expect(pairs).toBe(3);
  });

  test('a diagram of one set is centred', () => {
    const trace = venn([{ sets: ['Only'], size: 3 }]);

    expect(state(trace).audio.panning.cols).toBe(1);
  });

  test('without sizes the pitch is the item count, and no size is announced', () => {
    const trace = venn([{ sets: ['A'], items: ['a', 'b'] }, { sets: ['B'], items: ['c'] }]);
    expect(state(trace).audio.freq.raw).toBe(2);
    expect(state(trace).text.cross).toBeUndefined();
    expect(aside(trace, 'Items')).toBe('a, b');
  });
});

describe('the description', () => {
  test('counts the sets and overlaps and names the largest', () => {
    const stats = venn().description.stats;
    const value = (label: string): string | number | undefined =>
      stats.find(one => one.label === label)?.value;
    expect(value('Number of sets')).toBe(3);
    expect(value('Number of overlaps')).toBe(4);
    expect(value('Most sets in one overlap')).toBe(3);
    expect(value('Largest set')).toBe('Desirable, 10');
    expect(value('Largest overlap')).toBe('Desirable and Feasible, 2.5');
  });

  test('tabulates every region, sets first', () => {
    const rows = venn().description.dataTable.rows;
    expect(rows.map(row => row[0])).toEqual([
      'Desirable',
      'Feasible',
      'Viable',
      'Desirable and Feasible',
      'Desirable and Viable',
      'Feasible and Viable',
      'Desirable, Feasible and Viable',
    ]);
  });
});

describe('up goes back out the way the reader came down', () => {
  /** Mermaid's example: three teams, two pairwise overlaps and all three. */
  const TEAM: VennPoint[] = [
    { sets: ['Frontend'], size: 20 },
    { sets: ['Backend'], size: 12 },
    { sets: ['Data'], size: 9 },
    { sets: ['Frontend', 'Backend'], size: 5, label: 'Full stack' },
    { sets: ['Backend', 'Data'], size: 4, label: 'Pipelines' },
    { sets: ['Frontend', 'Backend', 'Data'], size: 1, label: 'Unicorns' },
  ];

  /** The team diagram, with the cursor on Data. */
  function onData(): VennTrace {
    const trace = venn(TEAM);
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    return trace;
  }

  const at = (trace: VennTrace): unknown => state(trace).text.main.value;

  test('from a set into its overlap and back onto that set, not the first one', () => {
    const trace = onData();
    trace.moveOnce('DOWNWARD');
    expect(at(trace)).toBe('Backend and Data');

    trace.moveOnce('UPWARD');

    expect(at(trace)).toBe('Data');
  });

  test('two levels down and two back, then the boundary', () => {
    const trace = onData();
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');
    expect(at(trace)).toBe('Frontend, Backend and Data');

    trace.moveOnce('UPWARD');
    expect(at(trace)).toBe('Backend and Data');
    trace.moveOnce('UPWARD');
    expect(at(trace)).toBe('Data');
    expect(trace.moveOnce('UPWARD')).toBe(false);
  });

  test('a sideways step onto an overlap still made of the set keeps the way back', () => {
    const trace = venn();
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');
    expect(state(trace).text.main.value).toBe('Feasible and Viable');

    trace.moveOnce('UPWARD');

    expect(state(trace).text.main.value).toBe('Viable');
  });

  test('a sideways step onto an overlap not made of it falls back to the first set', () => {
    const trace = venn();
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('BACKWARD');
    expect(state(trace).text.main.value).toBe('Desirable and Feasible');

    trace.moveOnce('UPWARD');

    expect(state(trace).text.main.value).toBe('Desirable');
  });

  test('control and up returns to the set the reader started down from', () => {
    const trace = onData();
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');

    trace.moveToExtreme('UPWARD');

    expect(at(trace)).toBe('Data');
  });

  test('a jump forgets the way down', () => {
    const trace = onData();
    trace.moveOnce('DOWNWARD');
    trace.moveToIndex(1, 1);

    trace.moveOnce('UPWARD');

    expect(at(trace)).toBe('Backend');
  });

  test('without a way down, up takes the first set as before', () => {
    const trace = venn(TEAM);
    trace.moveToIndex(2, 0);
    trace.moveOnce('UPWARD');
    expect(at(trace)).toBe('Frontend and Backend');

    trace.moveToIndex(2, 0);
    trace.moveToExtreme('UPWARD');
    expect(at(trace)).toBe('Frontend');
  });

  test('leaving the chart forgets the way down', () => {
    const trace = onData();
    trace.moveOnce('DOWNWARD');
    trace.resetToInitialEntry();
    trace.moveOnce('FORWARD');
    trace.moveToIndex(1, 1);

    trace.moveOnce('UPWARD');

    expect(at(trace)).toBe('Backend');
  });
});
