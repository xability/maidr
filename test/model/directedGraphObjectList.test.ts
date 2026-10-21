import type { DirectedGraphTrace } from '@model/directedGraph';
import type { DirectedGraphPoint, MaidrLayer } from '@type/grammar';
import type { ChartObject, ChartObjectList, ObjectOrder } from '@type/objectList';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import * as graphCentrality from '@util/graphCentrality';
import { arrangeObjects } from '@util/objectList';

/**
 * A residual block and a second block, as Keras' `plot_model` would draw a
 * small ResNet -- the graph `directed-graph.test.ts` walks, with the
 * parameter counts and layer types `examples/directed-graph.html` declares.
 *
 * Declared dense-first, so the list can only come out input to output if the
 * trace sorted it. Seen from the top level, both of `input`'s edges arrive at
 * the closed `block1`; inside it, `add` merges `conv2` with the skip from
 * `input`. One count is a string, as a producer that formats its numbers
 * sends them.
 *
 * Outline: input, block1 (conv1, conv2, add), block2 (conv, pool), dense.
 */
const RESNET: DirectedGraphPoint[] = [
  { id: 'dense', inputs: ['block2/pool'], attributes: { 'Layer type': 'Dense', 'Parameters': 650 } },
  { id: 'input', attributes: { 'Layer type': 'InputLayer', 'Parameters': 0 } },
  {
    id: 'block1/conv1',
    label: 'conv1',
    path: ['block1'],
    inputs: ['input'],
    attributes: { 'Layer type': 'Conv2D', 'Parameters': 448 },
  },
  {
    id: 'block1/conv2',
    label: 'conv2',
    path: ['block1'],
    inputs: ['block1/conv1'],
    attributes: { 'Layer type': 'Conv2D', 'Parameters': '435' },
  },
  {
    id: 'block1/add',
    label: 'add',
    path: ['block1'],
    inputs: ['block1/conv2', 'input'],
    attributes: { 'Layer type': 'Add', 'Parameters': 0 },
  },
  {
    id: 'block2/conv',
    label: 'conv',
    path: ['block2'],
    inputs: ['block1/add'],
    attributes: { 'Layer type': 'Conv2D', 'Parameters': 224 },
  },
  {
    id: 'block2/pool',
    label: 'pool',
    path: ['block2'],
    inputs: ['block2/conv'],
    attributes: { 'Layer type': 'Pooling', 'Parameters': 0 },
  },
];

/**
 * s feeds a, which branches to b and c; they merge again at d, which feeds t;
 * e stands apart. Flat, and with every role on a different node, so no role
 * filter shows what another already does.
 */
const DIAMOND: DirectedGraphPoint[] = [
  { id: 's' },
  { id: 'a', inputs: ['s'] },
  { id: 'b', inputs: ['a'] },
  { id: 'c', inputs: ['a'] },
  { id: 'd', inputs: ['b', 'c'] },
  { id: 't', inputs: ['d'] },
  { id: 'e' },
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
 * Build a directed graph trace the reader has not entered yet.
 * @param data The nodes the layer carries
 * @returns The trace
 */
function fresh(data: DirectedGraphPoint[] = RESNET): DirectedGraphTrace {
  return TraceFactory.create(createLayer(data)) as DirectedGraphTrace;
}

/**
 * Build a directed graph trace sitting on its first item.
 * @param data The nodes the layer carries
 * @returns The entered trace
 */
function graph(data: DirectedGraphPoint[] = RESNET): DirectedGraphTrace {
  const trace = fresh(data);
  // The first move is the initial entry, which lands rather than moves.
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Read the trace's object list, asserting it has one.
 * @param trace The trace to read
 * @returns The list
 */
function listOf(trace: DirectedGraphTrace): ChartObjectList {
  const list = trace.getObjectList();
  if (list === null) {
    throw new Error('Expected an object list');
  }
  return list;
}

/**
 * The name announced at the cursor.
 * @param trace The trace to read
 * @returns The item's name
 */
function at(trace: DirectedGraphTrace): string {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return String(state.text.main.value);
}

/**
 * The key of the listed item with a label, which the tests choose items by.
 * @param list The list
 * @param label The item's label
 * @returns Its key
 */
function keyOf(list: ChartObjectList, label: string): string {
  const object = list.objects.find(one => one.label === label);
  if (object === undefined) {
    throw new Error(`Expected an item called ${label}`);
  }
  return object.key;
}

/**
 * The labels of a list arranged by one of its sorts, the way the dialog
 * arranges it.
 * @param list The list
 * @param sort The id of the sort
 * @param filter The id of the filter, or null for every object
 * @returns The labels, in the order shown
 */
function arranged(list: ChartObjectList, sort: string, filter: string | null = null): string[] {
  const option = list.sorts.find(one => one.id === sort);
  if (option === undefined) {
    throw new Error(`Expected the sort ${sort}`);
  }
  return arrangeObjects(withDeferred(list, option.order), option.order, filter)
    .map(object => object.label);
}

/**
 * The objects with a deferred measure filled in, as the dialog fills it in
 * when the reader first chooses its sort.
 * @param list The list
 * @param order The order about to be applied
 * @returns The objects, measured
 */
function withDeferred(list: ChartObjectList, order: ObjectOrder): ChartObject[] {
  if (order.kind !== 'measure') {
    return [...list.objects];
  }
  const thunk = list.deferred?.[order.measure];
  if (thunk === undefined) {
    return [...list.objects];
  }
  const values = thunk();
  return list.objects.map((object, index) => ({
    ...object,
    measures: { ...object.measures, [order.measure]: values[index] },
  }));
}

/**
 * The labels of a list's filters.
 * @param list The list
 * @returns The labels, in the order offered
 */
function filterLabels(list: ChartObjectList): string[] {
  return list.filters.map(filter => filter.label);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the graph lists every node and every scope', () => {
  test('it is a list of nodes, counted as nodes', () => {
    const list = listOf(graph());

    expect(list.title).toBe('Nodes');
    expect(list.count(9)).toBe('9 nodes');
  });

  test('the items run in outline order: each scope, then what it holds', () => {
    expect(listOf(graph()).objects.map(object => object.label))
      .toEqual(['input', 'block1', 'conv1', 'conv2', 'add', 'block2', 'conv', 'pool', 'dense']);
  });

  test('each item says where it sits, how it is connected and what it is in the flow', () => {
    const details = new Map(listOf(graph()).objects.map(object => [object.label, object.detail]));

    expect(details.get('input')).toBe('0 inputs, 1 output, graph input');
    expect(details.get('block1')).toBe('3 nodes inside, 1 input, 1 output');
    expect(details.get('conv1')).toBe('block1, 1 input, 1 output');
    expect(details.get('add')).toBe('block1, 2 inputs, 1 output, merge point');
    expect(details.get('dense')).toBe('1 input, 0 outputs, graph output');
  });

  test('items that would read alike are told apart by their ids', () => {
    const twins: DirectedGraphPoint[] = [
      { id: 'g/first', label: 'n', path: ['g'] },
      { id: 'g/second', label: 'n', path: ['g'], inputs: ['g/first'] },
      { id: 'g/other', label: 'm', path: ['g'] },
    ];
    const details = listOf(graph(twins)).objects.map(object => object.detail);

    expect(details[1]).toBe('g, g/first, 0 inputs, 1 output, graph input');
    expect(details[2]).toBe('g, g/second, 1 input, 0 outputs, graph output');
    expect(details[3]).not.toContain('g/other');
  });

  test('no item carries a value of its own', () => {
    expect(listOf(graph()).objects.every(object => object.value === undefined)).toBe(true);
  });

  test('a graph with no nodes has nothing to list', () => {
    expect(fresh([]).getObjectList()).toBeNull();
  });
});

describe('an item is found again by its id or its path', () => {
  test('keys are unique, the same on a rebuild, and never a cell', () => {
    const first = listOf(graph()).objects.map(object => object.key);
    const second = listOf(graph()).objects.map(object => object.key);

    expect(new Set(first).size).toBe(first.length);
    expect(second).toEqual(first);
    expect(first.some(key => /^\d+,\d+$/.test(key))).toBe(false);
  });

  test('a node is keyed by its id and a scope by its path', () => {
    const keys = listOf(graph()).objects.map(object => object.key);

    expect(keys[0]).toBe(JSON.stringify(['node', 'input', 0]));
    expect(keys[1]).toBe(JSON.stringify(['scope', 'block1']));
    expect(keys[2]).toBe(JSON.stringify(['node', 'block1/conv1', 0]));
  });

  test('a repeated id stays two items', () => {
    const repeated: DirectedGraphPoint[] = [
      { id: 'x' },
      { id: 'x' },
      { id: 'y', inputs: ['x'] },
    ];
    const keys = listOf(graph(repeated)).objects.map(object => object.key);

    expect(new Set(keys).size).toBe(3);
  });

  test('choosing an item moves the cursor to it, however deep it sits', () => {
    const trace = graph();

    for (const object of listOf(trace).objects) {
      expect(trace.moveToObject(object.key)).toBe(true);
      expect(at(trace)).toBe(object.label);
    }
  });

  test('a key no item has moves nowhere', () => {
    const trace = graph();

    expect(trace.moveToObject(JSON.stringify(['node', 'ghost', 0]))).toBe(false);
    expect(at(trace)).toBe('input');
  });

  test('a jump ends the edge walk, so the next step follows the chosen item\'s edges', () => {
    // The walk from conv1 stepped to conv2. Jumping to conv2 lands on the cell
    // that walk left, and without the reset the next step carried on through
    // conv1's outputs -- it has no second one -- rather than conv2's.
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveToRotorFilter('outputs', 'right');
    trace.moveToObject(keyOf(listOf(trace), 'conv2'));

    expect(trace.moveToRotorFilter('outputs', 'right')).toBe(true);
    expect(at(trace)).toBe('add');
  });
});

describe('the sorts', () => {
  test('it opens on the graph order, then the name, connections, betweenness and parameters', () => {
    expect(listOf(graph()).sorts.map(sort => sort.label)).toEqual([
      'Graph order',
      'Name, A to Z',
      'Connections, highest first',
      'Betweenness, highest first',
      'Parameters, highest first',
    ]);
  });

  test('by graph order, input to output, scope by scope', () => {
    expect(arranged(listOf(graph()), 'chart'))
      .toEqual(['input', 'block1', 'conv1', 'conv2', 'add', 'block2', 'conv', 'pool', 'dense']);
  });

  test('by name, numbers inside names count as numbers', () => {
    expect(arranged(listOf(graph()), 'name'))
      .toEqual(['add', 'block1', 'block2', 'conv', 'conv1', 'conv2', 'dense', 'input', 'pool']);
  });

  test('by connections, as each item is announced, the merge first', () => {
    expect(arranged(listOf(graph()), 'connections-descending'))
      .toEqual(['add', 'block1', 'conv1', 'conv2', 'block2', 'conv', 'pool', 'input', 'dense']);
  });

  test('by betweenness, on the declared edges, the scopes last', () => {
    // Every route from the input to the head runs through add and on through
    // block2; conv1 carries only the long arm of the skip.
    expect(arranged(listOf(graph()), 'betweenness-descending'))
      .toEqual(['add', 'conv', 'pool', 'conv2', 'conv1', 'input', 'dense', 'block1', 'block2']);
  });

  test('by a numeric attribute, the string count included and the scopes last', () => {
    expect(arranged(listOf(graph()), 'attr:Parameters-descending'))
      .toEqual(['dense', 'conv1', 'conv2', 'conv', 'input', 'add', 'pool', 'block1', 'block2']);
  });

  test('connections are spoken with each item, the rest are not', () => {
    expect(listOf(graph()).measures).toEqual([
      { id: 'connections', label: 'Connections', spoken: true },
      { id: 'betweenness', label: 'Betweenness', spoken: false },
      { id: 'attr:Parameters', label: 'Parameters', spoken: false },
    ]);
  });

  test('betweenness is not offered on a fan, where no node is between two others', () => {
    const fan: DirectedGraphPoint[] = [
      { id: 'a' },
      { id: 'b', inputs: ['a'] },
      { id: 'c', inputs: ['a'] },
      { id: 'd', inputs: ['a'] },
    ];
    const list = listOf(graph(fan));

    expect(list.sorts.map(sort => sort.id)).not.toContain('betweenness-descending');
  });

  test('betweenness is not offered on a chain, which has nothing to broker', () => {
    const chain: DirectedGraphPoint[] = [
      { id: 'a' },
      { id: 'b', inputs: ['a'] },
      { id: 'c', inputs: ['b'] },
      { id: 'd', inputs: ['c'] },
    ];

    const list = listOf(graph(chain));

    expect(list.sorts.map(sort => sort.id)).not.toContain('betweenness-descending');
    expect(list.measures.map(measure => measure.id)).not.toContain('betweenness');
    expect(list.deferred).toBeUndefined();
  });

  test('betweenness is not offered below three nodes', () => {
    const pair: DirectedGraphPoint[] = [{ id: 'a' }, { id: 'b', inputs: ['a', 'a'] }];

    expect(listOf(graph(pair)).sorts.map(sort => sort.id)).not.toContain('betweenness-descending');
  });

  test('an attribute is a sort only when every value is a number, and two nodes give one', () => {
    // Units has a word among its numbers, Rate an exponent, Trainable is a
    // flag, and Once is given by one node, which orders nothing.
    const mixed: DirectedGraphPoint[] = [
      { id: 'a', attributes: { Units: 32, Rate: 0.5, Once: 7, Trainable: true } },
      { id: 'b', attributes: { Units: 'n/a', Rate: '0.25', Trainable: false } },
      { id: 'c', attributes: { Units: 16, Rate: '1e3' } },
    ];

    expect(listOf(graph(mixed)).sorts.map(sort => sort.id)).toEqual(['chart', 'name']);
  });

  test('only the first three numeric attributes are sorts', () => {
    const many: DirectedGraphPoint[] = ['a', 'b'].map((id, at) => ({
      id,
      attributes: { One: at, Two: at, Three: at, Four: at },
    }));

    expect(listOf(graph(many)).sorts.map(sort => sort.label)).toEqual([
      'Graph order',
      'Name, A to Z',
      'One, highest first',
      'Two, highest first',
      'Three, highest first',
    ]);
  });
});

describe('betweenness waits for the sort that asks for it', () => {
  test('opening the list does not work it out', () => {
    const spy = jest.spyOn(graphCentrality, 'centrality');

    listOf(graph());

    expect(spy).not.toHaveBeenCalled();
  });

  test('it is worked out once, on the first ask, and kept', () => {
    const spy = jest.spyOn(graphCentrality, 'centrality');
    const trace = graph();

    const first = listOf(trace).deferred?.betweenness();
    const again = listOf(trace).deferred?.betweenness();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(again).toBe(first);
  });

  test('a scope has none', () => {
    const values = listOf(graph()).deferred?.betweenness() ?? [];

    expect(values).toHaveLength(9);
    expect(values[1]).toBeNaN();
    expect(values[5]).toBeNaN();
  });
});

describe('the filters', () => {
  test('before the reader has entered, nothing is relative to the cursor', () => {
    expect(filterLabels(listOf(fresh()))).toEqual([
      'Graph inputs',
      'Graph outputs',
      'Merge points',
      'Level 1',
      'Level 2',
      'Scopes',
      'Layer type: Conv2D',
    ]);
  });

  test('once on an item, what feeds it and what it feeds lead the filters', () => {
    const trace = graph();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    const list = listOf(trace);

    expect(at(trace)).toBe('add');
    expect(filterLabels(list).slice(0, 2)).toEqual(['Upstream of add', 'Downstream of add']);
    expect(arranged(list, 'chart', 'upstream-of-current')).toEqual(['input', 'conv1', 'conv2']);
    // Everything add's data reaches: the block it flows into, the nodes in
    // it, and on from there.
    expect(arranged(list, 'chart', 'downstream-of-current')).toEqual(['block2', 'conv', 'pool', 'dense']);
  });

  test('a path through a block reaches only what that path feeds', () => {
    // Two parallel paths through one block, as an Inception block has: x
    // feeds s1, which feeds A; s2 feeds B. Walking the block's edges as a
    // whole would make B downstream of x and x upstream of B.
    const trace = graph([
      { id: 'x' },
      { id: 'S/s1', label: 's1', path: ['S'], inputs: ['x'] },
      { id: 'S/s2', label: 's2', path: ['S'] },
      { id: 'A', inputs: ['S/s1'] },
      { id: 'B', inputs: ['S/s2'] },
    ]);
    const onX = listOf(trace);
    expect(at(trace)).toBe('x');

    expect(arranged(onX, 'chart', 'downstream-of-current')).toEqual(['S', 's1', 'A']);

    expect(trace.moveToObject(keyOf(onX, 'B'))).toBe(true);
    const onB = listOf(trace);
    expect(arranged(onB, 'chart', 'upstream-of-current')).toEqual(['S', 's2']);
  });

  test('a cursor filter that would show nothing is not offered', () => {
    // Nothing feeds the graph's input.
    const labels = filterLabels(listOf(graph()));

    expect(labels[0]).toBe('Downstream of input');
    expect(labels).not.toContain('Upstream of input');
  });

  test('a filter showing what an earlier one shows is not offered again', () => {
    // Upstream of block1 is input alone, which is also every graph input; the
    // more specific wording, offered first, is the one kept.
    const trace = graph();
    trace.moveOnce('FORWARD');
    const labels = filterLabels(listOf(trace));

    expect(labels.slice(0, 3))
      .toEqual(['Upstream of block1', 'Downstream of block1', 'Graph outputs']);
    expect(labels).not.toContain('Graph inputs');
  });

  test('the roles narrow to the items each one names', () => {
    const list = listOf(fresh(DIAMOND));

    expect(filterLabels(list)).toEqual([
      'Graph inputs',
      'Graph outputs',
      'Branch points',
      'Merge points',
      'Not connected',
    ]);
    expect(arranged(list, 'chart', 'graph-inputs')).toEqual(['s']);
    expect(arranged(list, 'chart', 'graph-outputs')).toEqual(['t']);
    expect(arranged(list, 'chart', 'branch-points')).toEqual(['a']);
    expect(arranged(list, 'chart', 'merge-points')).toEqual(['d']);
    expect(arranged(list, 'chart', 'not-connected')).toEqual(['e']);
  });

  test('a merge-and-branch point is in both lists', () => {
    const hub: DirectedGraphPoint[] = [
      { id: 'x' },
      { id: 'y' },
      { id: 'm', inputs: ['x', 'y'] },
      { id: 'p', inputs: ['m'] },
      { id: 'q', inputs: ['m'] },
    ];
    const list = listOf(fresh(hub));

    expect(arranged(list, 'chart', 'branch-points')).toEqual(['m']);
    expect(arranged(list, 'chart', 'merge-points')).toEqual(['m']);
    // The second is the same item again, so only one of them is offered.
    expect(filterLabels(list)).toEqual(['Graph inputs', 'Graph outputs', 'Branch points']);
  });

  test('the levels and the scopes narrow to the nesting', () => {
    const list = listOf(fresh());

    expect(arranged(list, 'chart', 'level-1')).toEqual(['input', 'block1', 'block2', 'dense']);
    expect(arranged(list, 'chart', 'scopes')).toEqual(['block1', 'block2']);
  });

  test('a flat graph offers no levels and no scopes', () => {
    const ids = listOf(fresh(DIAMOND)).filters.map(filter => filter.id);

    expect(ids).not.toContain('level-1');
    expect(ids).not.toContain('scopes');
  });

  test('a shared attribute value is a filter, and one held by a single node is not', () => {
    const list = listOf(fresh());
    const conv = list.filters.find(filter => filter.label === 'Layer type: Conv2D');

    expect(conv).toBeDefined();
    expect(arranged(list, 'chart', conv?.id ?? null)).toEqual(['conv1', 'conv2', 'conv']);
    expect(filterLabels(list)).not.toContain('Layer type: Dense');
  });

  test('only the first two attributes that are not numbers are filters', () => {
    // Every value splits the four nodes a different way, so nothing is
    // dropped as a repeat and only the cap can leave Device out.
    const nodes: DirectedGraphPoint[] = [
      { id: 'a', attributes: { Kind: 'Conv', Shape: '(None, 8)', Device: 'GPU' } },
      { id: 'b', attributes: { Kind: 'Conv', Shape: '(None, 2)', Device: 'CPU' } },
      { id: 'c', attributes: { Kind: 'Dense', Shape: '(None, 2)', Device: 'GPU' } },
      { id: 'd', attributes: { Kind: 'Dense', Shape: '(None, 8)', Device: 'CPU' } },
    ];

    expect(filterLabels(listOf(fresh(nodes)))).toEqual([
      'Kind: Conv',
      'Kind: Dense',
      'Shape: (None, 8)',
      'Shape: (None, 2)',
    ]);
  });
});
