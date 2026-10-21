import type { TreemapTrace } from '@model/treemap';
import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { ChartObject, ChartObjectList, ObjectSortOption } from '@type/objectList';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { arrangeObjects } from '@util/objectList';

/**
 * Two continents and their countries, with only the leaves declared -- the
 * fixture `treemap.test.ts` reads, so the two files describe one tree.
 *
 * Europe totals 150 and Asia 1577. Europe comes first in the outline and
 * last but one by value, so a sort that fell back to the chart's order would
 * show it.
 */
const NATIONS: TreemapPoint[] = [
  { x: 'France', y: 67, path: ['Europe'] },
  { x: 'Germany', y: 83, path: ['Europe'] },
  { x: 'Japan', y: 125, path: ['Asia'] },
  { x: 'India', y: 1400, path: ['Asia'] },
  { x: 'Korea', y: 52, path: ['Asia'] },
];

/**
 * An org chart: three levels and no magnitude anywhere, which is what a
 * Highcharts organization chart produces (#1153).
 *
 * Cy has one report to Bo's two, so a sort by team size and the outline
 * disagree about whether Cy comes before Engineering.
 */
const ORG: TreemapPoint[] = [
  { x: 'Ada' },
  { x: 'Bo', path: ['Ada'] },
  { x: 'Cy', path: ['Ada'] },
  { x: 'Engineering', path: ['Ada', 'Bo'] },
  { x: 'Design', path: ['Ada', 'Bo'] },
  { x: 'Finance', path: ['Ada', 'Cy'] },
];

/**
 * Create a minimal hierarchy layer for model-only tests.
 * @param data The nodes the layer carries
 * @param type Which layout the layer declares
 * @returns The layer definition
 */
function createLayer(data: TreemapPoint[], type: TraceType = TraceType.TREEMAP): MaidrLayer {
  return {
    id: 'test-treemap-layer',
    type,
    title: 'Population by region',
    axes: { x: { label: 'Region' }, y: { label: 'Population' } },
    data,
  };
}

/**
 * Build a trace the reader has not entered yet.
 * @param data The nodes the layer carries
 * @param type Which layout the layer declares
 * @returns The trace, still on its initial entry
 */
function fresh(data: TreemapPoint[] = NATIONS, type?: TraceType): TreemapTrace {
  return TraceFactory.create(createLayer(data, type)) as TreemapTrace;
}

/**
 * Build a trace sitting on its first top-level node, as after one keypress.
 * @param data The nodes the layer carries
 * @returns The entered trace
 */
function entered(data: TreemapPoint[] = NATIONS): TreemapTrace {
  const trace = fresh(data);
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Read the trace's object list, asserting it offers one.
 * @param trace The trace to read
 * @returns The list
 */
function listOf(trace: TreemapTrace): ChartObjectList {
  const list = trace.getObjectList();
  if (list === null) {
    throw new Error('Expected an object list');
  }
  return list;
}

/**
 * Name the objects, in the order given.
 * @param objects The objects
 * @returns Their labels
 */
function labels(objects: readonly ChartObject[]): string[] {
  return objects.map(object => object.label);
}

/**
 * Find one of the list's sorts by id.
 * @param list The list
 * @param id The sort's id
 * @returns The sort
 */
function sort(list: ChartObjectList, id: string): ObjectSortOption {
  const found = list.sorts.find(option => option.id === id);
  if (found === undefined) {
    throw new Error(`Expected a sort ${id}`);
  }
  return found;
}

/**
 * The labels the list shows under one sort and filter.
 * @param list The list
 * @param sortId The sort's id
 * @param filter The filter's id, or null for every object
 * @returns The labels, in the order shown
 */
function shown(list: ChartObjectList, sortId: string, filter: string | null = null): string[] {
  return labels(arrangeObjects(list.objects, sort(list, sortId).order, filter));
}

/**
 * Read the name the trace announces for where the cursor is.
 * @param trace The trace to read
 * @returns The announced main value
 */
function announced(trace: TreemapTrace): string {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return String(state.text.main.value);
}

describe('the tree is listed as an outline', () => {
  test('should list every node, each parent before its children', () => {
    const list = listOf(entered());

    expect(labels(list.objects)).toEqual([
      'Europe',
      'France',
      'Germany',
      'Asia',
      'Japan',
      'India',
      'Korea',
    ]);
  });

  test('should call the objects nodes, and count them', () => {
    const list = listOf(entered());

    expect(list.title).toBe('Nodes');
    expect(list.count(7)).toBe('7 nodes');
    expect(list.count(1)).toBe('1 node');
  });

  test('should give each node the value it is announced with, on the y axis', () => {
    const india = listOf(entered()).objects.find(object => object.label === 'India');

    expect(india?.value).toEqual({ label: 'Population', value: 1400, axis: 'y' });
  });

  test('should give a derived node its children\'s total', () => {
    const asia = listOf(entered()).objects.find(object => object.label === 'Asia');

    expect(asia?.value?.value).toBe(1577);
  });

  test('should say where a node sits, and nothing for a top-level one', () => {
    const list = listOf(entered([
      ...NATIONS,
      { x: 'Paris', y: 2, path: ['Europe', 'France'] },
    ]));

    const detail = (label: string): string | undefined =>
      list.objects.find(object => object.label === label)?.detail;

    expect(detail('Europe')).toBeUndefined();
    expect(detail('France')).toBe('Europe');
    expect(detail('Paris')).toBe('Europe > France');
  });

  test('should give no value to a tree that declares none', () => {
    const list = listOf(entered(ORG));

    expect(list.objects.every(object => object.value === undefined)).toBe(true);
    expect(list.measures.map(measure => measure.id)).toEqual(['children', 'descendants']);
  });

  test('should offer a list on every layout of the tree', () => {
    const outlines = [
      TraceType.TREEMAP,
      TraceType.SUNBURST,
      TraceType.ICICLE,
      TraceType.TREE,
      TraceType.PACK,
    ].map(type => labels(listOf(fresh(NATIONS, type)).objects));

    for (const outline of outlines) {
      expect(outline).toEqual(outlines[0]);
    }
  });

  test('should offer no list when the layer declares no node', () => {
    expect(fresh([]).getObjectList()).toBeNull();
  });
});

describe('the sorts are the comparisons the tree is drawn for', () => {
  test('should open in hierarchy order', () => {
    const [first] = listOf(entered()).sorts;

    expect(first.label).toBe('Hierarchy order');
    expect(first.order).toEqual({ kind: 'chart' });
  });

  test('should offer value both ways on a valued tree, then children, then names', () => {
    const list = listOf(entered());

    expect(list.sorts.map(option => option.id)).toEqual([
      'chart',
      'value-descending',
      'value-ascending',
      'children-descending',
      'name',
    ]);
    expect(sort(list, 'value-descending').label).toBe('Population, highest first');
  });

  test('should offer team size instead of value on a tree with no magnitudes', () => {
    const list = listOf(entered(ORG));

    expect(list.sorts.map(option => option.id)).toEqual([
      'chart',
      'descendants-descending',
      'children-descending',
      'name',
    ]);
  });

  test('should withhold the children sort where every node has the same number', () => {
    // A flat treemap -- a disk-usage chart -- is every rectangle a leaf, and
    // a sort by children would repeat the chart's order under another name.
    const list = listOf(entered([{ x: 'A', y: 1 }, { x: 'B', y: 2 }]));

    expect(list.sorts.map(option => option.id)).toEqual([
      'chart',
      'value-descending',
      'value-ascending',
      'name',
    ]);
  });

  test('should withhold the value sorts where every node has the same value', () => {
    const list = listOf(entered([{ x: 'A', y: 3 }, { x: 'B', y: 3 }]));

    expect(list.sorts.map(option => option.id)).toEqual(['chart', 'name']);
  });

  test('should put the largest nodes first, at any depth', () => {
    expect(shown(listOf(entered()), 'value-descending'))
      .toEqual(['Asia', 'India', 'Europe', 'Japan', 'Germany', 'France', 'Korea']);
  });

  test('should put the smallest nodes first', () => {
    expect(shown(listOf(entered()), 'value-ascending'))
      .toEqual(['Korea', 'France', 'Germany', 'Japan', 'Europe', 'India', 'Asia']);
  });

  test('should put the nodes with most children first', () => {
    // Asia's three before Europe's two, which the outline has the other way.
    expect(shown(listOf(entered()), 'children-descending'))
      .toEqual(['Asia', 'Europe', 'France', 'Germany', 'Japan', 'India', 'Korea']);
  });

  test('should put the largest teams first, counting everyone below', () => {
    // Cy leads one, which still beats the three who lead nobody, though the
    // outline reaches Engineering and Design first.
    expect(shown(listOf(entered(ORG)), 'descendants-descending'))
      .toEqual(['Ada', 'Bo', 'Cy', 'Engineering', 'Design', 'Finance']);
  });

  test('should sort the names alphabetically', () => {
    expect(shown(listOf(entered()), 'name'))
      .toEqual(['Asia', 'Europe', 'France', 'Germany', 'India', 'Japan', 'Korea']);
  });
});

describe('the filters are the tree\'s levels', () => {
  test('should offer each level, and drop leaves and branches where a level says the same', () => {
    // On a two-level tree every branch is on level 1 and every leaf on
    // level 2; the level is the more specific wording and is the one kept.
    const list = listOf(fresh());

    expect(list.filters.map(filter => filter.label)).toEqual(['Level 1', 'Level 2']);
    expect(shown(list, 'chart', 'level-2'))
      .toEqual(['France', 'Germany', 'Japan', 'India', 'Korea']);
  });

  test('should offer leaves and branches where they differ from every level', () => {
    const list = listOf(fresh([...NATIONS, { x: 'Antarctica', y: 0 }]));

    expect(list.filters.map(filter => filter.label))
      .toEqual(['Level 1', 'Level 2', 'Leaves', 'Branches']);
    expect(shown(list, 'chart', 'leaves'))
      .toEqual(['France', 'Germany', 'Japan', 'India', 'Korea', 'Antarctica']);
    expect(shown(list, 'chart', 'branches')).toEqual(['Europe', 'Asia']);
  });

  test('should keep branches on a deeper tree whose leaves are its last level', () => {
    const list = listOf(fresh(ORG));

    expect(list.filters.map(filter => filter.label))
      .toEqual(['Level 1', 'Level 2', 'Level 3', 'Branches']);
  });

  test('should offer no level on a tree of one level', () => {
    expect(listOf(fresh([{ x: 'A', y: 1 }, { x: 'B', y: 2 }])).filters).toEqual([]);
  });
});

describe('inside the current node', () => {
  test('should not be offered before the reader has moved', () => {
    const ids = listOf(fresh()).filters.map(filter => filter.id);

    expect(ids).not.toContain('inside-current');
  });

  test('should be offered first once the reader is on a node with children', () => {
    const trace = entered();

    const [first] = listOf(trace).filters;

    expect(first).toEqual({ id: 'inside-current', label: 'Inside Europe' });
  });

  test('should hold the current node\'s descendants at every depth', () => {
    const trace = entered(ORG);

    expect(shown(listOf(trace), 'chart', 'inside-current'))
      .toEqual(['Bo', 'Engineering', 'Design', 'Cy', 'Finance']);
  });

  test('should follow the cursor', () => {
    const trace = entered();
    trace.moveOnce('FORWARD');

    const list = listOf(trace);

    expect(list.filters[0].label).toBe('Inside Asia');
    expect(shown(list, 'value-descending', 'inside-current'))
      .toEqual(['India', 'Japan', 'Korea']);
  });

  test('should not be offered on a leaf', () => {
    const trace = entered();
    trace.moveOnce('DOWNWARD');

    expect(listOf(trace).filters.map(filter => filter.id)).not.toContain('inside-current');
  });
});

describe('each node keeps a key of its own', () => {
  test('should give every node a different key, none of them a cell', () => {
    const keys = listOf(entered()).objects.map(object => object.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).not.toMatch(/^\d+,\d+$/);
    }
  });

  test('should give the same keys when the same layer is built again', () => {
    const first = listOf(fresh()).objects.map(object => object.key);
    const second = listOf(entered()).objects.map(object => object.key);

    expect(second).toEqual(first);
  });

  test('should tell apart nodes of one name in different branches', () => {
    const list = listOf(fresh([
      { x: 'Other', y: 5, path: ['Europe'] },
      { x: 'Other', y: 7, path: ['Asia'] },
    ]));

    const others = list.objects.filter(object => object.label === 'Other');

    expect(others).toHaveLength(2);
    expect(others[0].key).not.toBe(others[1].key);
  });

  test('should tell apart a name declared as a number from the same name as text', () => {
    // `1` and `'1'` are two nodes, since the tree is keyed by the raw path;
    // keys rebuilt from the names would make them one.
    const list = listOf(fresh([{ x: 1, y: 2 }, { x: '1', y: 3 }]));

    expect(labels(list.objects)).toEqual(['1', '1']);
    expect(list.objects[0].key).not.toBe(list.objects[1].key);
  });
});

describe('choosing a node moves the cursor to it', () => {
  test('should land on every node and announce it by the name the list gives', () => {
    const trace = fresh();
    const { objects } = listOf(trace);

    for (const object of objects) {
      expect(trace.moveToObject(object.key)).toBe(true);
      expect(announced(trace)).toBe(object.label);
      expect([trace.row, trace.col]).toEqual([object.row, object.col]);
    }
  });

  test('should land on the right one of two nodes sharing a name', () => {
    const trace = fresh([
      { x: 'Other', y: 5, path: ['Europe'] },
      { x: 'Other', y: 7, path: ['Asia'] },
    ]);
    const asian = listOf(trace).objects.find(object => object.detail === 'Asia');
    if (asian === undefined) {
      throw new Error('Expected the Asian node');
    }

    trace.moveToObject(asian.key);

    const state = trace.state;
    expect(state.empty ? null : state.text.cross?.value).toBe(7);
  });

  test('should refuse a key no node has, and stay put', () => {
    const trace = entered();

    expect(trace.moveToObject('["nowhere",0]')).toBe(false);
    expect(announced(trace)).toBe('Europe');
  });
});
