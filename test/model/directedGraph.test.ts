import type { DirectedGraphPoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { DirectedGraphTrace } from '@model/directedGraph';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A residual block and a second block, as Keras' `plot_model` would draw a
 * small ResNet.
 *
 * Declared out of order on purpose -- the dense head first -- so the walk can
 * only come out input to output if the trace sorted it. The skip connection
 * from `input` to `block1/add` makes `input` a branch point and `add` a merge
 * point; seen from the top level, both edges arrive at the closed `block1`.
 *
 * Top level, topologically: input, block1, block2, dense.
 */
const RESNET: DirectedGraphPoint[] = [
  {
    id: 'dense',
    inputs: ['block2/pool'],
    attributes: { 'Layer type': 'Dense', 'Parameters': 650 },
  },
  { id: 'input', attributes: { 'Layer type': 'InputLayer', 'Output shape': '(None, 32, 32, 3)' } },
  { id: 'block1/conv1', label: 'conv1', path: ['block1'], inputs: ['input'] },
  { id: 'block1/conv2', label: 'conv2', path: ['block1'], inputs: ['block1/conv1'] },
  { id: 'block1/add', label: 'add', path: ['block1'], inputs: ['block1/conv2', 'input'] },
  { id: 'block2/conv', label: 'conv', path: ['block2'], inputs: ['block1/add'] },
  { id: 'block2/pool', label: 'pool', path: ['block2'], inputs: ['block2/conv'] },
];

/**
 * Create a minimal directed graph layer for model-only tests.
 * @param data The nodes the layer carries
 * @returns Directed graph layer definition
 */
function createLayer(data: DirectedGraphPoint[] = RESNET): MaidrLayer {
  return {
    id: 'test-dag-layer',
    type: TraceType.DIRECTED_GRAPH,
    title: 'Small ResNet',
    axes: { x: { label: 'Layer' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: DirectedGraphTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a directed graph trace sitting on its first item.
 * @param data The nodes the layer carries
 * @returns The entered trace
 */
function graph(data: DirectedGraphPoint[] = RESNET): DirectedGraphTrace {
  const trace = TraceFactory.create(createLayer(data)) as DirectedGraphTrace;
  // The first move is the initial entry, which lands rather than moves.
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * The name announced at the cursor.
 * @param trace The trace to read
 * @returns The item's name
 */
function at(trace: DirectedGraphTrace): string {
  return String(nonEmptyState(trace).text.main.value);
}

/**
 * Walk a sequence of moves and report the item each one landed on.
 * @param trace The trace to drive
 * @param directions The moves to make
 * @returns The item announced after each move, or null where it was refused
 */
function walk(trace: DirectedGraphTrace, ...directions: MovableDirection[]): (string | null)[] {
  return directions.map(direction => (trace.moveOnce(direction) ? at(trace) : null));
}

/**
 * An aside of the current announcement, by label.
 * @param trace The trace to read
 * @param label The aside to find
 * @returns Its value, or undefined when it was not said
 */
function aside(trace: DirectedGraphTrace, label: string): string | undefined {
  return nonEmptyState(trace).text.asides?.find(one => one.label === label)?.value;
}

/**
 * Read a description stat by label.
 * @param label The stat to find
 * @param data The nodes the layer carries
 * @returns Its value, or undefined
 */
function stat(label: string, data: DirectedGraphPoint[] = RESNET): unknown {
  return graph(data).description.stats.find(entry => entry.label === label)?.value;
}

describe('directed graph registration', () => {
  test('the factory builds a DirectedGraphTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(DirectedGraphTrace);
  });

  test('it names itself a directed graph', () => {
    expect(graph().description.chartType).toBe('Directed Graph');
  });
});

describe('the walk runs input to output, scope by scope', () => {
  test('it enters on the graph input at the top level', () => {
    const trace = graph();

    expect(at(trace)).toBe('input');
    expect(aside(trace, 'Role')).toBe('graph input');
  });

  test('left and right walk the top level in topological order', () => {
    // Declared dense-first; read input-first.
    expect(walk(graph(), 'FORWARD', 'FORWARD', 'FORWARD', 'FORWARD'))
      .toEqual(['block1', 'block2', 'dense', null]);
  });

  test('a scope starts closed and says how much is in it', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');

    expect(at(trace)).toBe('block1');
    expect(aside(trace, 'Scope')).toBe('3 nodes inside');
  });

  test('down opens a scope onto its first member, and up closes it again', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');

    expect(walk(trace, 'DOWNWARD', 'FORWARD', 'FORWARD', 'FORWARD', 'UPWARD'))
      .toEqual(['conv1', 'conv2', 'add', null, 'block1']);
  });

  test('left and right never leave the open scope', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    expect(trace.moveOnce('BACKWARD')).toBe(false);
    expect(at(trace)).toBe('conv1');
  });

  test('a node inside a scope is told where it is', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    expect(aside(trace, 'Path')).toBe('block1');
    expect(aside(trace, 'Order')).toBe('1 of 3');
  });

  test('ctrl moves reach the ends of the scope', () => {
    const trace = graph();

    expect(trace.moveToExtreme('FORWARD')).toBe(true);
    expect(at(trace)).toBe('dense');
    expect(trace.moveToExtreme('BACKWARD')).toBe(true);
    expect(at(trace)).toBe('input');
  });
});

describe('every move says how the node is connected', () => {
  test('the degree is announced as inputs and outputs', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(at(trace)).toBe('add');
    expect(aside(trace, 'Connections')).toBe('2 inputs, 1 output');
  });

  test('a merge point is announced, with what it merges', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(aside(trace, 'Role')).toBe('merge point');
    expect(aside(trace, 'From')).toBe('input, conv2');
  });

  test('a branch point is announced', () => {
    // a feeds b and c, which both feed d -- a diamond, flat.
    const diamond: DirectedGraphPoint[] = [
      { id: 'a' },
      { id: 'b', inputs: ['a'] },
      { id: 'c', inputs: ['a'] },
      { id: 'd', inputs: ['b', 'c'] },
    ];
    const trace = graph(diamond);

    expect(aside(trace, 'Connections')).toBe('0 inputs, 2 outputs');
    expect(aside(trace, 'Role')).toBe('graph input, branch point');
  });

  test('a link in a chain has no role to announce', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');

    expect(at(trace)).toBe('conv2');
    expect(aside(trace, 'Role')).toBeUndefined();
  });

  test('an edge into a closed scope arrives at the scope', () => {
    // add feeds block2/conv; from inside block1, block2 is still closed.
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(aside(trace, 'To')).toBe('block2');
  });

  test('a closed scope carries the edges of everything in it', () => {
    // Both the conv1 edge and the skip connection arrive at block1, once.
    const trace = graph();
    trace.moveOnce('FORWARD');

    expect(aside(trace, 'Connections')).toBe('1 input, 1 output');
  });

  test('the producer\'s attributes are announced in declared order', () => {
    const trace = graph();
    trace.moveToExtreme('FORWARD');

    const labels = nonEmptyState(trace).text.asides?.map(one => one.label) ?? [];
    expect(aside(trace, 'Layer type')).toBe('Dense');
    expect(aside(trace, 'Parameters')).toBe('650');
    expect(labels.indexOf('Layer type')).toBeLessThan(labels.indexOf('Parameters'));
  });

  test('a sink is announced as a graph output', () => {
    const trace = graph();
    trace.moveToExtreme('FORWARD');

    expect(aside(trace, 'Role')).toBe('graph output');
  });
});

describe('the rotor follows the edges in their direction', () => {
  test('both edge units are offered when the graph has edges', () => {
    const keys = graph().getRotorFilterUnits().map(unit => unit.key);

    expect(keys).toContain('outputs');
    expect(keys).toContain('inputs');
  });

  test('neither is offered on a graph with no edges', () => {
    const keys = graph([{ id: 'a' }, { id: 'b' }]).getRotorFilterUnits().map(unit => unit.key);

    expect(keys).not.toContain('outputs');
    expect(keys).not.toContain('inputs');
  });

  test('outputs steps downstream', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    expect(trace.moveToRotorFilter('outputs', 'right')).toBe(true);
    expect(at(trace)).toBe('conv2');
  });

  test('inputs steps upstream, enumerating every input in order', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(trace.moveToRotorFilter('inputs', 'right')).toBe(true);
    expect(at(trace)).toBe('input');
    expect(trace.moveToRotorFilter('inputs', 'right')).toBe(true);
    expect(at(trace)).toBe('conv2');
    expect(trace.moveToRotorFilter('inputs', 'right')).toBe(false);
  });

  test('a graph input has no inputs to step to', () => {
    const trace = graph();

    expect(trace.moveToRotorFilter('inputs', 'right')).toBe(false);
    expect(at(trace)).toBe('input');
  });
});

describe('the edges are read as declared, and no further', () => {
  test('an unknown input, a self input and a repeated input are dropped', () => {
    const data: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['a', 'ghost'] },
      { id: 'b', inputs: ['a', 'a'] },
    ];

    expect(stat('Number of edges', data)).toBe(1);
    expect(aside(graph(data), 'Connections')).toBe('0 inputs, 1 output');
  });

  test('a cycle is reported rather than ordered as though it were not one', () => {
    const data: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['b'] },
      { id: 'b', inputs: ['a'] },
    ];

    expect(stat('Cycle', data)).toBeDefined();
    expect(walk(graph(data), 'FORWARD', 'FORWARD')).toEqual(['b', null]);
  });

  test('an acyclic graph reports no cycle', () => {
    expect(stat('Cycle')).toBeUndefined();
  });

  test('scopes sharing a name under different parents stay apart', () => {
    const data: DirectedGraphPoint[] = [
      { id: 'a/x/n', label: 'n', path: ['a', 'x'] },
      { id: 'b/x/n', label: 'n', path: ['b', 'x'], inputs: ['a/x/n'] },
    ];

    expect(stat('Scopes', data)).toBe(4);
  });
});

describe('the modalities agree with the announcement', () => {
  test('the pitch is the node\'s connection count', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');

    const audio = nonEmptyState(trace).audio;
    expect(audio.freq.raw).toBe(2);
  });

  test('braille has one row per depth of nesting', () => {
    const braille = nonEmptyState(graph()).braille;
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.values).toHaveLength(2);
    expect((braille.values as number[][])[0]).toHaveLength(4);
  });

  test('a closed scope publishes every node in it for a canvas highlight', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');

    expect([...trace.highlightedPointIndices].sort()).toEqual([2, 3, 4]);
  });
});

describe('the description', () => {
  test('counts the graph and names its ends', () => {
    expect(stat('Number of nodes')).toBe(7);
    expect(stat('Number of edges')).toBe(7);
    expect(stat('Scopes')).toBe(2);
    expect(stat('Graph inputs')).toBe('1: input');
    expect(stat('Graph outputs')).toBe('1: dense');
    expect(stat('Branch points')).toBe(1);
    expect(stat('Merge points')).toBe(1);
  });

  test('gives the top level in reading order', () => {
    expect(stat('Top level')).toBe('input, block1, block2, dense');
  });

  test('tabulates every node input to output, with its attributes', () => {
    const table = graph().description.dataTable;

    expect(table.headers).toEqual(['Path', 'Layer', 'Inputs', 'Outputs', 'Layer type', 'Parameters', 'Output shape']);
    expect(table.rows.map(row => row[1])).toEqual(['input', 'conv1', 'conv2', 'add', 'conv', 'pool', 'dense']);
    expect(table.rows[3]).toEqual(['block1', 'add', 'block1 > conv2, input', 'block2 > conv', '', '', '']);
  });
});
