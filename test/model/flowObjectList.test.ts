import type { FlowTrace } from '@model/flow';
import type { FlowPoint, MaidrLayer } from '@type/grammar';
import type { ChartObjectList } from '@type/objectList';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { arrangeObjects } from '@util/objectList';

/**
 * The energy flow `flow.test.ts` walks, and `examples/sankey.html` draws.
 *
 * Stages: {Coal, Gas} -> {Losses, Electricity, Heat} -> {Homes, Industry}.
 * Throughput: Coal 56, Gas 18, Losses 8, Electricity 46, Heat 20, Homes 50,
 * Industry 16. The stages are of different heights, so the grid the cursor
 * walks has holes in it.
 */
const ENERGY: FlowPoint[] = [
  { source: 'Coal', target: 'Losses', value: 8 },
  { source: 'Coal', target: 'Electricity', value: 34 },
  { source: 'Coal', target: 'Heat', value: 14 },
  { source: 'Gas', target: 'Electricity', value: 12 },
  { source: 'Gas', target: 'Heat', value: 6 },
  { source: 'Electricity', target: 'Homes', value: 30 },
  { source: 'Electricity', target: 'Industry', value: 16 },
  { source: 'Heat', target: 'Homes', value: 20 },
];

/**
 * A chord diagram's ring with a source feeding it and a sink leaving it, so
 * nothing sorts into stages and both ends are still there to find.
 *
 * Throughput: Source 5, A 7 -- what the source sends and what comes back
 * round the ring -- B 4, C 3, Out 1.
 */
const TETHERED: FlowPoint[] = [
  { source: 'Source', target: 'A', value: 5 },
  { source: 'A', target: 'B', value: 4 },
  { source: 'B', target: 'C', value: 3 },
  { source: 'C', target: 'A', value: 2 },
  { source: 'C', target: 'Out', value: 1 },
];

/**
 * Create a minimal flow layer for model-only tests.
 * @param data The flows the layer carries
 * @param type Which of the three layouts the layer declares
 * @returns Flow layer definition
 */
function createLayer(
  data: FlowPoint[] = ENERGY,
  type: TraceType = TraceType.SANKEY,
): MaidrLayer {
  return {
    id: 'test-flow-layer',
    type,
    title: 'Energy flow',
    axes: { x: { label: 'Node' }, y: { label: 'Petajoules' } },
    data,
  };
}

/**
 * Build a flow trace sitting on its first node.
 * @param data The flows the layer carries
 * @param type Which layout the layer declares
 * @returns The entered trace
 */
function flow(data: FlowPoint[] = ENERGY, type: TraceType = TraceType.SANKEY): FlowTrace {
  const trace = TraceFactory.create(createLayer(data, type)) as FlowTrace;
  // The first move is the initial entry, which lands rather than moves.
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Read the trace's object list, asserting it has one.
 * @param trace The trace to read
 * @returns The list
 */
function listOf(trace: FlowTrace): ChartObjectList {
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
function nonEmptyState(trace: FlowTrace): NonEmptyTraceState {
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
  return arrangeObjects(list.objects, option.order, filter).map(object => object.label);
}

describe('a flow lists every node', () => {
  test('it is a list of nodes, counted as nodes', () => {
    const list = listOf(flow());

    expect(list.title).toBe('Nodes');
    expect(list.count(7)).toBe('7 nodes');
  });

  test('the nodes run stage by stage, down each stage', () => {
    expect(listOf(flow()).objects.map(object => object.label))
      .toEqual(['Coal', 'Gas', 'Losses', 'Electricity', 'Heat', 'Homes', 'Industry']);
  });

  test('each node carries its throughput as the announcement gives it', () => {
    const trace = flow();
    const coal = listOf(trace).objects[0];
    const { text } = nonEmptyState(trace);

    expect(coal.value).toEqual({ label: 'Petajoules', value: 56, axis: 'y' });
    expect(text.cross).toEqual({ label: coal.value?.label, value: coal.value?.value });
    expect(text.crossAxis).toBe(coal.value?.axis);
  });

  test('a sink carries what arrives, not its empty outflow', () => {
    const homes = listOf(flow()).objects.find(object => object.label === 'Homes');

    expect(homes?.value?.value).toBe(50);
  });

  test('each node is placed in its stage', () => {
    expect(listOf(flow()).objects.map(object => object.detail)).toEqual([
      'Stage 1',
      'Stage 1',
      'Stage 2',
      'Stage 2',
      'Stage 2',
      'Stage 3',
      'Stage 3',
    ]);
  });

  test('a chart in one stage names none', () => {
    expect(listOf(flow(TETHERED)).objects.every(object => object.detail === undefined)).toBe(true);
  });

  test('a chart with no flows has nothing to list', () => {
    const trace = TraceFactory.create(createLayer([])) as FlowTrace;

    expect(trace.getObjectList()).toBeNull();
  });
});

describe('a node is found again by its name', () => {
  test('keys are the names, unique, and the same on a rebuild', () => {
    const first = listOf(flow()).objects.map(object => object.key);
    const second = listOf(flow()).objects.map(object => object.key);

    expect(first).toEqual(['Coal', 'Gas', 'Losses', 'Electricity', 'Heat', 'Homes', 'Industry']);
    expect(second).toEqual(first);
    expect(first.some(key => /^\d+,\d+$/.test(key))).toBe(false);
  });

  test('choosing a node moves the cursor to it, holes in the grid and all', () => {
    const trace = flow();

    for (const object of listOf(trace).objects) {
      expect(trace.moveToObject(object.key)).toBe(true);
      expect(nonEmptyState(trace).text.main.value).toBe(object.label);
    }
  });

  test('a key no node has moves nowhere', () => {
    const trace = flow();

    expect(trace.moveToObject('Nuclear')).toBe(false);
    expect(nonEmptyState(trace).text.main.value).toBe('Coal');
  });

  test('a jump names no ribbon, because none was followed', () => {
    const trace = flow();
    trace.moveOnce('FORWARD');
    trace.moveToObject('Homes');

    expect((nonEmptyState(trace).text.asides ?? []).map(aside => aside.label))
      .not
      .toContain('Along');
  });

  test('a jump ends the flow walk, so the next step walks the chosen node\'s flows', () => {
    // The walk from Coal stepped to Electricity. Jumping to Electricity lands
    // on the cell that walk left, and without the reset the next step carried
    // on through Coal's flows to Heat; Electricity's own widest is to Homes.
    const trace = flow();
    trace.moveToRotorFilter('outgoing', 'right');
    trace.moveToObject('Electricity');

    expect(trace.moveToRotorFilter('outgoing', 'right')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('Homes');
  });
});

describe('the sorts of a chart in stages', () => {
  test('it opens on the stages, then throughput both ways, then the name', () => {
    expect(listOf(flow()).sorts.map(sort => sort.label)).toEqual([
      'Stage order',
      'Petajoules, highest first',
      'Petajoules, lowest first',
      'Name, A to Z',
    ]);
  });

  test('by stage, as the arrows reach them', () => {
    expect(arranged(listOf(flow()), 'chart'))
      .toEqual(['Coal', 'Gas', 'Losses', 'Electricity', 'Heat', 'Homes', 'Industry']);
  });

  test('by throughput, highest first, across the stages', () => {
    expect(arranged(listOf(flow()), 'throughput-descending'))
      .toEqual(['Coal', 'Homes', 'Electricity', 'Heat', 'Gas', 'Industry', 'Losses']);
  });

  test('by throughput, lowest first', () => {
    expect(arranged(listOf(flow()), 'throughput-ascending'))
      .toEqual(['Losses', 'Industry', 'Gas', 'Heat', 'Electricity', 'Homes', 'Coal']);
  });

  test('by name', () => {
    expect(arranged(listOf(flow()), 'name'))
      .toEqual(['Coal', 'Electricity', 'Gas', 'Heat', 'Homes', 'Industry', 'Losses']);
  });

  test('throughput is spoken with each node', () => {
    expect(listOf(flow()).measures).toEqual([
      { id: 'throughput', label: 'Petajoules', spoken: true },
    ]);
  });
});

describe('the sorts of a chart in one stage', () => {
  test('it opens on the busiest node, with no order to read the ring in', () => {
    expect(listOf(flow(TETHERED, TraceType.CHORD)).sorts.map(sort => sort.label)).toEqual([
      'Petajoules, highest first',
      'Petajoules, lowest first',
      'Name, A to Z',
      'Chart order',
    ]);
  });

  test('by throughput, highest first', () => {
    expect(arranged(listOf(flow(TETHERED)), 'throughput-descending'))
      .toEqual(['A', 'Source', 'B', 'C', 'Out']);
  });

  test('by throughput, lowest first', () => {
    expect(arranged(listOf(flow(TETHERED)), 'throughput-ascending'))
      .toEqual(['Out', 'C', 'B', 'Source', 'A']);
  });

  test('by name, and by the chart\'s own order', () => {
    const list = listOf(flow(TETHERED));

    expect(arranged(list, 'name')).toEqual(['A', 'B', 'C', 'Out', 'Source']);
    expect(arranged(list, 'chart')).toEqual(['Source', 'A', 'B', 'C', 'Out']);
  });

  test('throughput is not offered where every node carries the same', () => {
    const even: FlowPoint[] = [
      { source: 'A', target: 'B', value: 1 },
      { source: 'B', target: 'C', value: 1 },
      { source: 'C', target: 'A', value: 1 },
    ];
    const list = listOf(flow(even));

    expect(list.sorts.map(sort => sort.id)).toEqual(['name', 'chart']);
    expect(list.measures).toEqual([]);
  });
});

describe('the filters', () => {
  test('a chart in stages narrows to each stage, and to where the flow ends', () => {
    const list = listOf(flow());

    expect(list.filters.map(filter => filter.label))
      .toEqual(['Stage 1', 'Stage 2', 'Stage 3', 'Ending nodes']);
    expect(arranged(list, 'chart', 'stage-2')).toEqual(['Losses', 'Electricity', 'Heat']);
    expect(arranged(list, 'chart', 'sinks')).toEqual(['Losses', 'Homes', 'Industry']);
  });

  test('where the flow ends is the last stage exactly, it is not offered twice', () => {
    const chain: FlowPoint[] = [
      { source: 'A', target: 'B', value: 2 },
      { source: 'B', target: 'C', value: 1 },
    ];

    expect(listOf(flow(chain)).filters.map(filter => filter.label))
      .toEqual(['Stage 1', 'Stage 2', 'Stage 3']);
  });

  test('a chart in one stage narrows to where the flow starts and where it ends', () => {
    const list = listOf(flow(TETHERED));

    expect(list.filters.map(filter => filter.label)).toEqual(['Starting nodes', 'Ending nodes']);
    expect(arranged(list, 'chart', 'sources')).toEqual(['Source']);
    expect(arranged(list, 'chart', 'sinks')).toEqual(['Out']);
  });

  test('a ring with neither end offers no filter', () => {
    const ring: FlowPoint[] = [
      { source: 'A', target: 'B', value: 3 },
      { source: 'B', target: 'C', value: 2 },
      { source: 'C', target: 'A', value: 1 },
    ];

    expect(listOf(flow(ring, TraceType.CHORD)).filters).toEqual([]);
  });
});
