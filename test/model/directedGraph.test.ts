import type { DirectedGraphPoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
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
    expect(aside(trace, 'Size')).toBe('3 nodes inside');
  });

  test('a scope is announced as a scope, not by the noun for a node', () => {
    // The x axis names what a node is -- here a layer, on a Mermaid git
    // graph a commit -- so a scope announced by it was "Layer is block1",
    // "Commit is main": the wrong kind, before the size could correct it.
    const trace = graph();
    trace.moveOnce('FORWARD');

    expect(nonEmptyState(trace).text.main.label).toBe('Scope');
    expect(at(trace)).toBe('block1');
    expect(aside(trace, 'Scope')).toBeUndefined();
  });

  test('a node keeps the noun its producer gave it, inside a scope too', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    expect(at(trace)).toBe('conv1');
    expect(nonEmptyState(trace).text.main.label).toBe('Layer');
  });

  test('a scope whose nodes connect only to each other is not called not connected', () => {
    // An agent flow drawn as one scope holds the whole graph: no edge
    // crosses its boundary, and every step inside it is connected.
    const trace = graph([
      { id: 'a', path: ['flow'] },
      { id: 'b', path: ['flow'], inputs: ['a'] },
    ]);

    expect(at(trace)).toBe('flow');
    expect(aside(trace, 'Connections')).toBe('0 inputs, 0 outputs');
    expect(aside(trace, 'Role')).toBeUndefined();
  });

  test('a scope whose nodes have no edges at all is not connected', () => {
    const trace = graph([
      { id: 'a', path: ['g'] },
      { id: 'b', path: ['g'] },
    ]);

    expect(aside(trace, 'Role')).toBe('not connected');
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

  test('a ctrl move already at its end is refused, as up at the top and down on a leaf are', () => {
    // Left on the first item and right on the last replayed the item, as if
    // the cursor had moved.
    const trace = graph();

    const onInput = [trace.moveToExtreme('BACKWARD'), trace.moveToExtreme('UPWARD'), trace.moveToExtreme('DOWNWARD')];
    trace.moveToExtreme('FORWARD');
    const onDense = trace.moveToExtreme('FORWARD');

    expect(onInput).toEqual([false, false, false]);
    expect(onDense).toBe(false);
    expect(at(trace)).toBe('dense');
  });

  test('a ctrl move made on entering the graph lands on the first item and says so', () => {
    const trace = TraceFactory.create(createLayer()) as DirectedGraphTrace;

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

  test('an arrow move ends the walk, so coming back follows the item\'s own edges', () => {
    // The walk from conv1 stepped to conv2. Left and Right put the cursor back
    // on the cell that step left it on, and the next step carried on through
    // conv1's outputs -- it has no second one -- and said conv2 had none.
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveToRotorFilter('outputs', 'right');
    trace.moveOnce('BACKWARD');
    trace.moveOnce('FORWARD');

    expect(at(trace)).toBe('conv2');
    expect(trace.moveToRotorFilter('outputs', 'right')).toBe(true);
    expect(at(trace)).toBe('add');
  });

  test('a move to either end of the scope ends the walk as well', () => {
    // a feeds b and b feeds a. The walk from a steps to b; Ctrl+Left and
    // Ctrl+Right come back to b, whose own output is a.
    const trace = graph([
      { id: 'a', inputs: ['b'] },
      { id: 'b', inputs: ['a'] },
    ]);
    trace.moveToRotorFilter('outputs', 'right');
    trace.moveToExtreme('BACKWARD');
    trace.moveToExtreme('FORWARD');

    expect(at(trace)).toBe('b');
    expect(trace.moveToRotorFilter('outputs', 'right')).toBe(true);
    expect(at(trace)).toBe('a');
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

  test('edges declared as one drawn edge are counted once, and the rest one by one', () => {
    // A line between b and c drawn without an arrow, declared each way, and
    // an edge out of the scope s declared from both nodes it leaves.
    const data: DirectedGraphPoint[] = [
      { id: 'a' },
      { id: 'b', inputs: ['a', 'c'], inputEdges: [null, 'line'] },
      { id: 'c', inputs: ['b'], inputEdges: ['line'] },
      { id: 's1', path: ['s'], inputs: ['c'] },
      { id: 's2', path: ['s'], inputs: ['s1'] },
      { id: 'out', inputs: ['s1', 's2'], inputEdges: ['exit', 'exit'] },
    ];

    expect(stat('Number of edges', data)).toBe(5);
  });

  test('a line declared each way is no cycle, as nothing is drawn going round', () => {
    const data: DirectedGraphPoint[] = [
      { id: 'a' },
      { id: 'b', inputs: ['a', 'c'], inputEdges: [null, 'line'] },
      { id: 'c', inputs: ['b'], inputEdges: ['line'] },
    ];

    expect(stat('Cycle', data)).toBeUndefined();
    // Both ways are still edges a reader can follow.
    expect(aside(graph(data), 'Connections')).toBe('0 inputs, 1 output');
  });

  test('lines and one-way edges that close a loop between them are a cycle', () => {
    // a to b, a line from b to c, and c back to a: round and back to a.
    const closed: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['c'] },
      { id: 'b', inputs: ['a', 'c'], inputEdges: [null, 'line'] },
      { id: 'c', inputs: ['b'], inputEdges: ['line'] },
    ];
    // Three lines joined in a triangle.
    const triangle: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['b', 'c'], inputEdges: ['ab', 'ca'] },
      { id: 'b', inputs: ['a', 'c'], inputEdges: ['ab', 'bc'] },
      { id: 'c', inputs: ['b', 'a'], inputEdges: ['bc', 'ca'] },
    ];
    // A line and arrows that meet at d without coming back: a to b by the
    // line, and on to d two ways.
    const beside: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['b'], inputEdges: ['line'] },
      { id: 'b', inputs: ['a'], inputEdges: ['line'] },
      { id: 'c', inputs: ['b'] },
      { id: 'd', inputs: ['c', 'a'] },
      { id: 'e', inputs: ['d'] },
      { id: 'f', inputs: ['e'] },
    ];

    expect(stat('Cycle', closed)).toBeDefined();
    expect(stat('Cycle', triangle)).toBeDefined();
    expect(stat('Cycle', beside)).toBeUndefined();
  });

  test('an edge drawn beside a line, between the same two nodes, is an edge of its own and closes a loop', () => {
    // A line between a and b, and an arrow from a to b, declared with no id
    // or with one of its own; then two lines between a and b.
    const bare: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['b'], inputEdges: ['line'] },
      { id: 'b', inputs: ['a', 'a'], inputEdges: ['line', null] },
    ];
    const own: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['b'], inputEdges: ['line'] },
      { id: 'b', inputs: ['a', 'a'], inputEdges: ['line', 'arrow'] },
    ];
    const lines: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['b', 'b'], inputEdges: ['top', 'bottom'] },
      { id: 'b', inputs: ['a', 'a'], inputEdges: ['top', 'bottom'] },
    ];

    for (const data of [bare, own, lines]) {
      expect(stat('Number of edges', data)).toBe(2);
      expect(stat('Cycle', data)).toBeDefined();
    }
  });

  test('a self input is dropped with the drawn edge it names', () => {
    const data: DirectedGraphPoint[] = [
      { id: 'a', inputs: ['a'], inputEdges: ['loop'] },
      { id: 'b', inputs: ['a'] },
    ];

    expect(stat('Number of edges', data)).toBe(1);
    expect(stat('Cycle', data)).toBeUndefined();
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

  test('the pan runs across the item\'s own scope', () => {
    // Left and Right walk a scope's members and "Order is i of n" counts
    // them; the pan follows the same row rather than every item at the depth.
    const trace = graph();
    walk(trace, 'FORWARD', 'FORWARD', 'DOWNWARD');
    const conv = nonEmptyState(trace).audio.panning;
    walk(trace, 'FORWARD');
    const pool = nonEmptyState(trace).audio.panning;
    walk(trace, 'UPWARD', 'BACKWARD', 'DOWNWARD');
    const conv1 = nonEmptyState(trace).audio.panning;

    expect(conv).toMatchObject({ x: 0, cols: 2 });
    expect(pool).toMatchObject({ x: 1, cols: 2 });
    expect(conv1).toMatchObject({ x: 0, cols: 3 });
  });

  test('the state places the item in its scope and at its depth, as a tree places its node', () => {
    // What the position key reads. The pan carries the same two numbers as a
    // column and a row, which is how they were announced.
    const top = nonEmptyState(graph()).treePosition;
    const trace = graph();
    walk(trace, 'FORWARD', 'FORWARD', 'DOWNWARD', 'FORWARD');
    const pool = nonEmptyState(trace).treePosition;

    expect(top).toEqual({ index: 0, count: 4, level: 0, levels: 2 });
    expect(pool).toEqual({ index: 1, count: 2, level: 1, levels: 2, parent: 'block2' });
  });

  test('an item alone in its scope is centred, not hard left', () => {
    const trace = graph([
      { id: 'a/x', label: 'x', path: ['a'] },
      { id: 'a/y', label: 'y', path: ['a'], inputs: ['a/x'] },
    ]);

    expect(nonEmptyState(trace).audio.panning.cols).toBe(1);
  });

  test('the boundary tone sounds at the edge of the scope', () => {
    const trace = graph();
    walk(trace, 'FORWARD', 'FORWARD', 'DOWNWARD', 'FORWARD');
    const update = jest.fn();
    trace.addObserver({ update });

    expect(trace.moveOnce('FORWARD')).toBe(false);
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ empty: true, audio: { x: 1, cols: 2 } });
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
  /** A block diagram: Server's two edges both enter the storage block. */
  const BLOCKS: DirectedGraphPoint[] = [
    { id: 'client', label: 'Client' },
    { id: 'server', label: 'Server', inputs: ['client'] },
    { id: 'cache', label: 'Cache', path: ['storage'], inputs: ['server'] },
    { id: 'db', label: 'Database', path: ['storage'], inputs: ['server'] },
  ];

  /** A use case diagram: two actors, each linked to use cases inside one system. */
  const USE_CASES: DirectedGraphPoint[] = [
    { id: 'Customer' },
    { id: 'Clerk', label: 'Payment clerk' },
    { id: 'Browse', label: 'Browse catalogue', path: ['Shop'], inputs: ['Customer'] },
    { id: 'Checkout', label: 'Place order', path: ['Shop'], inputs: ['Customer'] },
    { id: 'Refund', label: 'Issue refund', path: ['Shop'], inputs: ['Clerk'] },
  ];

  /**
   * A state machine whose stop and quit leave the composite Running, as the
   * Mermaid adapter declares them: once from each state inside it.
   */
  const STATES: DirectedGraphPoint[] = [
    { id: 'root_start', label: 'start' },
    { id: 'Idle', inputs: ['root_start', 'Loading', 'Playing', 'Paused'] },
    { id: 'Running_start', label: 'start', path: ['Running'], inputs: ['Idle'] },
    { id: 'Loading', path: ['Running'], inputs: ['Running_start'] },
    { id: 'Playing', path: ['Running'], inputs: ['Loading', 'Paused'] },
    { id: 'Paused', path: ['Running'], inputs: ['Playing'] },
    { id: 'root_end', label: 'end', inputs: ['Loading', 'Playing', 'Paused'] },
  ];

  /**
   * How many items a stat counts: a bare 0, or the count before its names.
   * @param value The stat's value
   * @returns The count
   */
  function counted(value: unknown): number {
    return typeof value === 'number' ? value : Number(String(value).split(':')[0]);
  }

  test('counts the graph and names its ends', () => {
    expect(stat('Number of nodes')).toBe(7);
    expect(stat('Number of edges')).toBe(7);
    expect(stat('Scopes')).toBe(2);
    expect(stat('Graph inputs')).toBe('1: input');
    expect(stat('Graph outputs')).toBe('1: dense');
    expect(stat('Branch points')).toBe(0);
    expect(stat('Merge points')).toBe('1: block1 > add');
  });

  test('counts exactly what the list filters as branch and merge points', () => {
    // A move and the list's filters read each item as seen from its scope;
    // the summary counted the declared nodes by their own edges, and so
    // named points neither calls one.
    for (const data of [RESNET, BLOCKS, USE_CASES, STATES]) {
      const objects = graph(data).getObjectList()?.objects ?? [];
      const filtered = (group: string): number => objects.filter(one => one.groups?.includes(group)).length;

      expect(counted(stat('Branch points', data))).toBe(filtered('branch-points'));
      expect(counted(stat('Merge points', data))).toBe(filtered('merge-points'));
    }
  });

  test('counts no branch point where both edges enter one closed scope', () => {
    // Server's two edges both enter storage, so a move on it hears one
    // output and no role. The summary said "Branch points: 1: Server".
    const trace = graph(BLOCKS);
    trace.moveOnce('FORWARD');

    expect(at(trace)).toBe('Server');
    expect(aside(trace, 'Role')).toBeUndefined();
    expect(stat('Branch points', BLOCKS)).toBe(0);
    expect(stat('Merge points', BLOCKS)).toBe(0);
  });

  test('names a scope a move calls a merge point, and no actor it does not', () => {
    // Shop is announced as a merge point. Customer's two links both enter
    // Shop, so it is announced with one output, and is no branch point.
    const trace = graph(USE_CASES);
    trace.moveToExtreme('FORWARD');

    expect(at(trace)).toBe('Shop');
    expect(aside(trace, 'Role')).toBe('graph output, merge point');
    expect(stat('Merge points', USE_CASES)).toBe('1: Shop');
    expect(stat('Branch points', USE_CASES)).toBe(0);
  });

  test('names the states a move calls a branch or merge point, and not end', () => {
    // quit leaves Running from each state inside it, and every move reaches
    // end from Running alone, so end is no merge point. The summary named
    // it as one.
    const trace = graph(STATES);
    trace.moveToExtreme('FORWARD');

    expect(at(trace)).toBe('end');
    expect(aside(trace, 'Role')).toBe('graph output');
    expect(stat('Branch points', STATES)).toBe('4: Running, Running > Loading, Running > Playing, Running > Paused');
    expect(stat('Merge points', STATES)).toBe('2: Idle, Running > Playing');
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

  test('lists the copies of one drawn edge as the scope they leave or enter', () => {
    // Running's stop and quit, and Idle's start into it, each drawn once and
    // declared once for every state they leave or enter.
    const drawn: DirectedGraphPoint[] = [
      { id: 'Idle', inputs: ['Loading', 'Playing'], inputLabels: ['stop', 'stop'], inputEdges: ['stop', 'stop'] },
      { id: 'Loading', path: ['Running'], inputs: ['Idle'], inputLabels: ['start'], inputEdges: ['start'] },
      { id: 'Playing', path: ['Running'], inputs: ['Loading', 'Idle'], inputLabels: ['loaded', 'start'], inputEdges: [null, 'start'] },
      { id: 'end', inputs: ['Loading', 'Playing'], inputLabels: ['quit', 'stop'], inputEdges: ['quit', 'quit'] },
    ];
    const rows = graph(drawn).description.dataTable.rows;
    const row = (name: string): (string | number | number[])[] | undefined => rows.find(cells => cells[1] === name);

    expect(row('Idle')?.slice(2, 4)).toEqual(['Running (stop)', 'Running (start)']);
    // Copies whose labels differ are listed as the scope, unlabelled, as a
    // move would hear them.
    expect(row('end')?.[2]).toBe('Running');
    // Each copy still leads where it was declared to, from the state it leaves.
    expect(row('Loading')?.[3]).toBe('Idle (stop), Running > Playing (loaded), end (quit)');
  });

  test('lists an edge drawn beside the copies of one, between the same two nodes, by itself', () => {
    // Running's stop, declared from Loading and Paused, and Paused's own
    // reset to Idle, which the copy from Paused shares its two nodes with.
    const drawn: DirectedGraphPoint[] = [
      { id: 'Idle', inputs: ['Loading', 'Paused', 'Paused'], inputLabels: ['stop', 'stop', 'reset'], inputEdges: ['stop', 'stop', null] },
      { id: 'Loading', path: ['Running'], inputs: ['Idle'] },
      { id: 'Paused', path: ['Running'], inputs: ['Loading'] },
    ];
    const rows = graph(drawn).description.dataTable.rows;

    expect(rows.find(cells => cells[1] === 'Idle')?.[2]).toBe('Running (stop), Running > Paused (reset)');
    expect(stat('Number of edges', drawn)).toBe(4);
  });

  test('a graph with no scopes leaves out the Path column', () => {
    // Blank in every row, and the first column heads each row: a reader
    // moving down the Outputs column heard an empty header on every one.
    const table = graph([{ id: 'a' }, { id: 'b', inputs: ['a'] }]).description.dataTable;

    expect(table.headers).toEqual(['Layer', 'Inputs', 'Outputs']);
    expect(table.columnAxes).toEqual(['x', undefined, undefined]);
    expect(table.rows[0]).toEqual(['a', '', 'b']);
  });
});

describe('an edge label is heard wherever its edge is', () => {
  /** A flowchart decision: `check` goes to `ship` on yes and back to `fix` on no. */
  const DECISION: DirectedGraphPoint[] = [
    { id: 'start' },
    { id: 'check', inputs: ['start', 'fix'] },
    { id: 'ship', inputs: ['check'], inputLabels: ['yes'] },
    { id: 'fix', inputs: ['check'], inputLabels: ['no'] },
  ];

  test('the to list names each branch with its label', () => {
    const trace = graph(DECISION);
    trace.moveOnce('FORWARD');

    expect(at(trace)).toBe('check');
    expect(aside(trace, 'To')).toBe('ship (yes), fix (no)');
    expect(aside(trace, 'From')).toBe('start, fix');
  });

  test('the from list names the edge that arrives', () => {
    const trace = graph(DECISION);
    trace.moveOnce('FORWARD');
    trace.moveToRotorFilter('outputs', 'right');

    expect(at(trace)).toBe('ship');
    expect(aside(trace, 'From')).toBe('check (yes)');
  });

  test('a blank or missing label leaves the edge unnamed', () => {
    const trace = graph([
      { id: 'a' },
      { id: 'b', inputs: ['a', 'a'], inputLabels: ['', 'later'] },
      { id: 'c', inputs: ['a'], inputLabels: [null] },
      { id: 'd', inputs: ['a'], inputLabels: ['   '] },
    ]);

    expect(aside(trace, 'To')).toBe('b (later), c, d');
  });

  test('a numeric label is heard as written, zero included', () => {
    const trace = graph([
      { id: 'a' },
      { id: 'b', inputs: ['a'], inputLabels: [0] },
    ]);

    expect(aside(trace, 'To')).toBe('b (0)');
  });

  test('an edge declared twice keeps each distinct label, once', () => {
    const trace = graph([
      { id: 'a' },
      { id: 'b', inputs: ['a', 'a', 'a'], inputLabels: ['yes', 'retry', 'yes'] },
      { id: 'c', inputs: ['a', 'a'], inputLabels: ['yes, maybe', 'maybe'] },
    ]);

    expect(aside(trace, 'To')).toBe('b (yes; retry), c (yes, maybe; maybe)');
  });

  test('an edge into a closed scope is heard with its label, and so is the edge inside once it is open', () => {
    // The scope stands for one edge here, so its label names that edge and
    // nothing else -- a flowchart's `yes` into a subgraph, which was heard
    // as a bare "Shipping" beside its labelled `no`.
    const trace = graph([
      { id: 'a' },
      { id: 'g/b', label: 'b', path: ['g'], inputs: ['a'], inputLabels: ['go'] },
    ]);

    expect(at(trace)).toBe('a');
    expect(aside(trace, 'To')).toBe('g (go)');

    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    expect(at(trace)).toBe('b');
    expect(aside(trace, 'From')).toBe('a (go)');
  });

  test('edges into a closed scope that share one label are heard with it', () => {
    const trace = graph([
      { id: 'a' },
      { id: 'g/b', label: 'b', path: ['g'], inputs: ['a'], inputLabels: ['stop'] },
      { id: 'g/c', label: 'c', path: ['g'], inputs: ['a'], inputLabels: ['stop'] },
    ]);

    expect(aside(trace, 'To')).toBe('g (stop)');
  });

  test('edges out of a closed scope that share one label are heard with it, from either end', () => {
    // A state diagram's `Running --> [*] : quit`, which the producer expands
    // to an edge from every state inside Running.
    const trace = graph([
      { id: 'g/b', label: 'b', path: ['g'] },
      { id: 'g/c', label: 'c', path: ['g'] },
      { id: 'z', inputs: ['g/b', 'g/c'], inputLabels: ['quit', 'quit'] },
    ]);

    expect(at(trace)).toBe('g');
    expect(aside(trace, 'To')).toBe('z (quit)');

    trace.moveOnce('FORWARD');

    expect(at(trace)).toBe('z');
    expect(aside(trace, 'From')).toBe('g (quit)');
  });

  test('edges into a closed scope with different labels, or some unnamed, are heard without one', () => {
    // A label names every edge the scope stands for, or none of them: never
    // one of several as though it were all.
    const differ = graph([
      { id: 'a' },
      { id: 'g/b', label: 'b', path: ['g'], inputs: ['a'], inputLabels: ['write'] },
      { id: 'g/c', label: 'c', path: ['g'], inputs: ['a'], inputLabels: ['read'] },
    ]);
    const partly = graph([
      { id: 'a' },
      { id: 'g/b', label: 'b', path: ['g'], inputs: ['a'], inputLabels: ['go'] },
      { id: 'g/c', label: 'c', path: ['g'], inputs: ['a'] },
    ]);

    expect(aside(differ, 'To')).toBe('g');
    expect(aside(partly, 'To')).toBe('g');
  });

  test('an edge from inside an open scope into another closed one is heard with its label', () => {
    const trace = graph([
      { id: 's/a', label: 'a', path: ['s'] },
      { id: 't/b', label: 'b', path: ['t'], inputs: ['s/a'], inputLabels: ['go'] },
    ]);

    expect(at(trace)).toBe('s');
    expect(aside(trace, 'To')).toBe('t (go)');

    trace.moveOnce('DOWNWARD');

    expect(at(trace)).toBe('a');
    expect(aside(trace, 'To')).toBe('t (go)');
  });

  test('an edge into a closed scope declared twice keeps both its labels', () => {
    const trace = graph([
      { id: 'a' },
      { id: 'g/b', label: 'b', path: ['g'], inputs: ['a', 'a'], inputLabels: ['yes', 'retry'] },
    ]);

    expect(aside(trace, 'To')).toBe('g (yes; retry)');
  });

  test('fewer labels than inputs leaves the rest unnamed', () => {
    const trace = graph([
      { id: 'a' },
      { id: 'b' },
      { id: 'c', inputs: ['a', 'b'], inputLabels: ['only'] },
    ]);
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(at(trace)).toBe('c');
    expect(aside(trace, 'From')).toBe('a (only), b');
  });

  test('the description tabulates the labels', () => {
    const table = graph(DECISION).description.dataTable;
    const name = table.headers.indexOf('Layer');
    const outputs = table.headers.indexOf('Outputs');
    const check = table.rows.find(row => row[name] === 'check');

    expect(check?.[outputs]).toBe('ship (yes), fix (no)');
  });
});
