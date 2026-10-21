import type { NetworkTrace } from '@model/network';
import type { MaidrLayer, NetworkPoint } from '@type/grammar';
import type { ChartObject, ChartObjectList, ObjectOrder } from '@type/objectList';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import * as graphCentrality from '@util/graphCentrality';
import { arrangeObjects } from '@util/objectList';

/**
 * A collaboration graph in two linked groups, plus a node linked to nobody --
 * the fixture `network.test.ts` walks.
 *
 * Degrees: Ada 4, Grace 2, Alan 2, Edsger 1, Barbara 1 -- then Tim 1, Vint 1
 * in the second group, and Ida alone, whose only link is to herself.
 */
const COLLAB: NetworkPoint[] = [
  { source: 'Edsger', target: 'Ada' },
  { source: 'Ada', target: 'Grace' },
  { source: 'Ada', target: 'Alan' },
  { source: 'Grace', target: 'Alan' },
  { source: 'Barbara', target: 'Ada' },
  { source: 'Tim', target: 'Vint' },
  { source: 'Ida', target: 'Ida' },
];

/**
 * The collaborations `examples/network.html` draws.
 *
 * Where degree order and the walk part: the walk finishes Ada's group, leaves
 * and all, before the second group, whose three nodes have two links each --
 * more than Edsger and Barbara.
 *
 * Walk: Ada 5, Grace 3, Alan 2, Katherine 2, Edsger 1, Barbara 1, then Tim,
 * Vint and Radia at 2.
 */
const PAGE: NetworkPoint[] = [
  { source: 'Edsger', target: 'Ada' },
  { source: 'Ada', target: 'Grace' },
  { source: 'Ada', target: 'Alan' },
  { source: 'Grace', target: 'Alan' },
  { source: 'Barbara', target: 'Ada' },
  { source: 'Ada', target: 'Katherine' },
  { source: 'Grace', target: 'Katherine' },
  { source: 'Tim', target: 'Vint' },
  { source: 'Vint', target: 'Radia' },
  { source: 'Tim', target: 'Radia' },
];

/**
 * Two triangles joined through a node of their own.
 *
 * The bridge is where centrality and degree part: it has fewer links than
 * the two corners it joins, yet every path from one triangle to the other
 * runs through it, so it is the most between -- while the corners, a step
 * nearer their own triangles, are the closest to everyone.
 */
const BARBELL: NetworkPoint[] = [
  { source: 'a1', target: 'a2' },
  { source: 'a2', target: 'a3' },
  { source: 'a3', target: 'a1' },
  { source: 'b1', target: 'b2' },
  { source: 'b2', target: 'b3' },
  { source: 'b3', target: 'b1' },
  { source: 'a1', target: 'bridge' },
  { source: 'bridge', target: 'b1' },
];

/**
 * Create a minimal network layer for model-only tests.
 * @param data The links the layer carries
 * @returns Network layer definition
 */
function createLayer(data: NetworkPoint[] = COLLAB): MaidrLayer {
  return {
    id: 'test-network-layer',
    type: TraceType.NETWORK,
    title: 'Collaborations',
    axes: { x: { label: 'Person' }, y: { label: 'Links' } },
    data,
  };
}

/**
 * Build a network trace the reader has not entered yet.
 * @param data The links the layer carries
 * @returns The trace
 */
function fresh(data: NetworkPoint[] = COLLAB): NetworkTrace {
  return TraceFactory.create(createLayer(data)) as NetworkTrace;
}

/**
 * Build a network trace sitting on its first node.
 * @param data The links the layer carries
 * @returns The entered trace
 */
function network(data: NetworkPoint[] = COLLAB): NetworkTrace {
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
function listOf(trace: NetworkTrace): ChartObjectList {
  const list = trace.getObjectList();
  if (list === null) {
    throw new Error('Expected an object list');
  }
  return list;
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: NetworkTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
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
  return labelsOf(arrangeObjects(withDeferred(list, option.order), option.order, filter));
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
  return list.objects.map((object, at) => ({
    ...object,
    measures: { ...object.measures, [order.measure]: values[at] },
  }));
}

/**
 * Labels of a run of objects.
 * @param objects The objects
 * @returns Their labels
 */
function labelsOf(objects: readonly ChartObject[]): string[] {
  return objects.map(object => object.label);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the network lists every node', () => {
  test('it is a list of nodes, counted as nodes', () => {
    const list = listOf(network());

    expect(list.title).toBe('Nodes');
    expect(list.count(8)).toBe('8 nodes');
    expect(list.count(1)).toBe('1 node');
  });

  test('every node is listed in the order the arrows walk them, the isolated one included', () => {
    expect(labelsOf(listOf(network()).objects))
      .toEqual(['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Tim', 'Vint', 'Ida']);
  });

  test('each node carries its degree as the announcement gives it', () => {
    const trace = network();
    const ada = listOf(trace).objects[0];
    const { text } = nonEmptyState(trace);

    expect(ada.value).toEqual({ label: 'Links', value: 4, axis: 'y' });
    expect(text.cross).toEqual({ label: ada.value?.label, value: ada.value?.value });
    expect(text.crossAxis).toBe(ada.value?.axis);
  });

  test('each node is placed in its group, as every move says', () => {
    const objects = listOf(network()).objects;

    expect(objects[0].detail).toBe('Group 1');
    expect(objects[5].detail).toBe('Group 2');
    expect(objects[7].detail).toBe('Group 3');
  });

  test('a chart in one piece names no group', () => {
    const one: NetworkPoint[] = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
    ];

    expect(listOf(network(one)).objects.map(object => object.detail))
      .toEqual([undefined, undefined, undefined]);
  });

  test('a chart with no links has nothing to list', () => {
    expect(fresh([]).getObjectList()).toBeNull();
  });
});

describe('a node is found again by its name', () => {
  test('keys are the names, unique, and the same on a rebuild', () => {
    const first = listOf(network()).objects.map(object => object.key);
    const second = listOf(network()).objects.map(object => object.key);

    expect(new Set(first).size).toBe(first.length);
    expect(second).toEqual(first);
    expect(first).toContain('Ida');
    expect(first.some(key => /^\d+,\d+$/.test(key))).toBe(false);
  });

  test('choosing a node moves the cursor to it, wherever it sits', () => {
    const trace = network();

    for (const object of listOf(trace).objects) {
      expect(trace.moveToObject(object.key)).toBe(true);
      expect(nonEmptyState(trace).text.main.value).toBe(object.label);
    }
  });

  test('a key no node has moves nowhere', () => {
    const trace = network();

    expect(trace.moveToObject('Nobody')).toBe(false);
    expect(nonEmptyState(trace).text.main.value).toBe('Ada');
  });

  test('a jump ends the link walk, so the next step walks the chosen node\'s links', () => {
    // The walk from Ada stepped to Grace. Jumping to Grace by name lands on
    // the cell that walk left, and without the reset the next step carried on
    // through Ada's links to Alan; Grace's own first link is Ada.
    const trace = network();
    trace.moveToRotorFilter('links', 'right');
    trace.moveToObject('Grace');

    expect(trace.moveToRotorFilter('links', 'right')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('Ada');
  });
});

describe('the sorts', () => {
  test('it opens on the alphabet, then degree both ways, centrality, and the walk', () => {
    expect(listOf(network()).sorts.map(sort => sort.label)).toEqual([
      'Name, A to Z',
      'Links, highest first',
      'Links, lowest first',
      'Betweenness, highest first',
      'Closeness, highest first',
      'By group, most links first',
    ]);
  });

  test('by name, the nodes run A to Z', () => {
    expect(arranged(listOf(network()), 'name'))
      .toEqual(['Ada', 'Alan', 'Barbara', 'Edsger', 'Grace', 'Ida', 'Tim', 'Vint']);
  });

  test('by degree, highest first, the second group\'s nodes pass the first\'s leaves', () => {
    expect(arranged(listOf(network(PAGE)), 'degree-descending')).toEqual([
      'Ada',
      'Grace',
      'Alan',
      'Katherine',
      'Tim',
      'Vint',
      'Radia',
      'Edsger',
      'Barbara',
    ]);
  });

  test('by degree, lowest first, ties keep the walk\'s order', () => {
    expect(arranged(listOf(network(PAGE)), 'degree-ascending')).toEqual([
      'Edsger',
      'Barbara',
      'Alan',
      'Katherine',
      'Tim',
      'Vint',
      'Radia',
      'Grace',
      'Ada',
    ]);
  });

  test('by degree, lowest first, an isolated node leads', () => {
    expect(arranged(listOf(network()), 'degree-ascending')[0]).toBe('Ida');
  });

  test('by betweenness, the bridge outranks the better-linked corners', () => {
    const list = listOf(network(BARBELL));

    expect(arranged(list, 'degree-descending').slice(0, 3)).toEqual(['a1', 'b1', 'a2']);
    expect(arranged(list, 'betweenness-descending').slice(0, 3)).toEqual(['bridge', 'a1', 'b1']);
  });

  test('by closeness, the corners come first, then the bridge between them', () => {
    expect(arranged(listOf(network(BARBELL)), 'closeness-descending'))
      .toEqual(['a1', 'b1', 'bridge', 'a2', 'a3', 'b2', 'b3']);
  });

  test('the walk\'s own order is offered last, group by group', () => {
    expect(arranged(listOf(network(PAGE)), 'chart')).toEqual([
      'Ada',
      'Grace',
      'Alan',
      'Katherine',
      'Edsger',
      'Barbara',
      'Tim',
      'Vint',
      'Radia',
    ]);
  });

  test('degree is not offered where every node has the same', () => {
    const ring: NetworkPoint[] = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'A' },
    ];
    const ids = listOf(network(ring)).sorts.map(sort => sort.id);

    expect(ids).not.toContain('degree-descending');
    expect(ids).not.toContain('degree-ascending');
    expect(listOf(network(ring)).measures.map(measure => measure.id)).not.toContain('degree');
  });

  test('centrality is not offered below three nodes, where nothing can be between', () => {
    const list = listOf(network([{ source: 'A', target: 'B' }]));

    expect(list.sorts.map(sort => sort.id)).toEqual(['name', 'chart']);
    expect(list.deferred).toBeUndefined();
  });

  test('centrality is not offered on a graph too large to walk from every node', () => {
    const pairs: NetworkPoint[] = Array.from({ length: 1600 }, (_unused, at) => ({
      source: `p${at}`,
      target: `q${at}`,
    }));
    const list = listOf(network(pairs));

    expect(list.sorts.map(sort => sort.id)).not.toContain('betweenness-descending');
    expect(list.sorts.map(sort => sort.id)).not.toContain('closeness-descending');
    expect(list.objects).toHaveLength(3200);
  });

  test('degree is spoken with each node, and centrality is not', () => {
    expect(listOf(network()).measures).toEqual([
      { id: 'degree', label: 'Links', spoken: true },
      { id: 'betweenness', label: 'Betweenness', spoken: false },
      { id: 'closeness', label: 'Closeness', spoken: false },
    ]);
  });
});

describe('centrality waits for the sort that asks for it', () => {
  test('opening the list does not work it out', () => {
    const spy = jest.spyOn(graphCentrality, 'centrality');

    listOf(network());

    expect(spy).not.toHaveBeenCalled();
  });

  test('it is worked out once, on the first ask, and kept', () => {
    const spy = jest.spyOn(graphCentrality, 'centrality');
    const trace = network();
    const deferred = listOf(trace).deferred;

    const first = deferred?.betweenness();
    const again = deferred?.betweenness();
    const closeness = deferred?.closeness();
    const reopened = listOf(trace).deferred?.betweenness();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(again).toBe(first);
    expect(reopened).toBe(first);
    expect(closeness).toHaveLength(8);
  });

  test('it gives one value per listed node, in the list\'s order', () => {
    // Ada is the only node a shortest path runs through: Edsger and Barbara
    // reach everyone else by her.
    const values = listOf(network()).deferred?.betweenness() ?? [];

    expect(values).toHaveLength(8);
    expect(values[0]).toBeGreaterThan(0);
    expect(values.slice(1)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('the filters', () => {
  test('before the reader has entered, nothing is relative to the cursor', () => {
    expect(listOf(fresh()).filters.map(filter => filter.label))
      .toEqual(['Group 1', 'Group 2', 'Unlinked nodes']);
  });

  test('once on a node, its neighbours are a filter of their own, offered first', () => {
    const list = listOf(network());

    expect(list.filters.map(filter => filter.label))
      .toEqual(['Linked to Ada', 'Group 1', 'Group 2', 'Unlinked nodes']);
    expect(arranged(list, 'chart', 'linked-to-current'))
      .toEqual(['Grace', 'Alan', 'Edsger', 'Barbara']);
  });

  test('a node linked to nobody offers no neighbours to show', () => {
    const trace = network();
    trace.moveToObject('Ida');

    expect(listOf(trace).filters.map(filter => filter.id)).not.toContain('linked-to-current');
  });

  test('each group, and the unlinked nodes, narrow to their members', () => {
    const list = listOf(network());

    expect(arranged(list, 'name', 'group-2')).toEqual(['Tim', 'Vint']);
    expect(arranged(list, 'name', 'unlinked')).toEqual(['Ida']);
  });

  test('one group beside unlinked nodes is still worth a filter', () => {
    const lone: NetworkPoint[] = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'D', target: 'D' },
    ];

    expect(listOf(fresh(lone)).filters.map(filter => filter.label))
      .toEqual(['Group 1', 'Unlinked nodes']);
  });

  test('a chart in one piece offers no group, which would be all of it', () => {
    const one: NetworkPoint[] = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
    ];

    expect(listOf(fresh(one)).filters).toEqual([]);
  });

  test('only the ten largest groups are offered', () => {
    const pairs: NetworkPoint[] = Array.from({ length: 12 }, (_unused, at) => ({
      source: `p${at}`,
      target: `q${at}`,
    }));
    const labels = listOf(fresh(pairs)).filters.map(filter => filter.label);

    expect(labels).toHaveLength(10);
    expect(labels[9]).toBe('Group 10');
  });
});
