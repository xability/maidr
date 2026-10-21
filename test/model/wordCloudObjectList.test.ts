import type { WordCloudTrace } from '@model/wordCloud';
import type { MaidrLayer, WordCloudPoint } from '@type/grammar';
import type { ChartObject, ChartObjectList, ObjectSortOption } from '@type/objectList';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { arrangeObjects } from '@util/objectList';

/**
 * Terms authored in an order that is neither alphabetical nor by weight --
 * the fixture `wordCloud.test.ts` reads -- so no two of the list's orders
 * coincide.
 */
const TERMS: WordCloudPoint[] = [
  { x: 'neural', y: 128 },
  { x: 'machine', y: 412 },
  { x: 'gradient', y: 57 },
  { x: 'tensor', y: 233 },
];

/**
 * Create a minimal word cloud layer for model-only tests.
 * @param data The terms the layer carries
 * @returns Word cloud layer definition
 */
function createLayer(data: WordCloudPoint[]): MaidrLayer {
  return {
    id: 'test-word-cloud-layer',
    type: TraceType.WORD_CLOUD,
    title: 'Terms in the abstracts',
    axes: { x: { label: 'Term' }, y: { label: 'Occurrences' } },
    data,
  };
}

/**
 * Build a word cloud trace the reader has not entered yet.
 * @param data The terms the layer carries
 * @returns The trace
 */
function cloud(data: WordCloudPoint[] = TERMS): WordCloudTrace {
  return TraceFactory.create(createLayer(data)) as WordCloudTrace;
}

/**
 * Read the trace's object list, asserting it offers one.
 * @param trace The trace to read
 * @returns The list
 */
function listOf(trace: WordCloudTrace): ChartObjectList {
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
 * @param filter The filter's id, or null for every term
 * @returns The labels, in the order shown
 */
function shown(list: ChartObjectList, sortId: string, filter: string | null = null): string[] {
  return labels(arrangeObjects(list.objects, sort(list, sortId).order, filter));
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: WordCloudTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

describe('the terms are listed heaviest first', () => {
  test('should list every term in the order the arrows walk', () => {
    const list = listOf(cloud());

    expect(labels(list.objects)).toEqual(['machine', 'tensor', 'neural', 'gradient']);
    expect(list.objects.map(object => object.col)).toEqual([0, 1, 2, 3]);
  });

  test('should call the objects terms, and count them', () => {
    const list = listOf(cloud());

    expect(list.title).toBe('Terms');
    expect(list.count(4)).toBe('4 terms');
    expect(list.count(1)).toBe('1 term');
  });

  test('should give each term the weight it is announced with, on the y axis', () => {
    const [machine] = listOf(cloud()).objects;

    expect(machine.value).toEqual({ label: 'Occurrences', value: 412, axis: 'y' });
    expect(machine.detail).toBeUndefined();
  });

  test('should offer no list for a cloud with no terms', () => {
    expect(cloud([]).getObjectList()).toBeNull();
  });
});

describe('the sorts', () => {
  test('should open by weight, highest first, which is the chart\'s own order', () => {
    const [first] = listOf(cloud()).sorts;

    expect(first.label).toBe('Occurrences, highest first');
    expect(first.order).toEqual({ kind: 'measure', measure: 'weight', direction: 'descending' });
  });

  test('should offer weight both ways, then names', () => {
    const list = listOf(cloud());

    expect(list.sorts.map(option => option.id))
      .toEqual(['weight-descending', 'weight-ascending', 'name']);
  });

  test('should put the heaviest term first', () => {
    expect(shown(listOf(cloud()), 'weight-descending'))
      .toEqual(['machine', 'tensor', 'neural', 'gradient']);
  });

  test('should put the lightest term first', () => {
    expect(shown(listOf(cloud()), 'weight-ascending'))
      .toEqual(['gradient', 'neural', 'tensor', 'machine']);
  });

  test('should sort the terms by name', () => {
    expect(shown(listOf(cloud()), 'name'))
      .toEqual(['gradient', 'machine', 'neural', 'tensor']);
  });

  test('should leave only the alphabet when every term weighs the same', () => {
    const list = listOf(cloud([{ x: 'b', y: 3 }, { x: 'a', y: 3 }]));

    expect(list.sorts.map(option => option.id)).toEqual(['name']);
  });
});

describe('a term whose weight did not parse', () => {
  const WITH_GAP: WordCloudPoint[] = [{ x: 'alpha', y: 'n/a' }, ...TERMS];

  test('should be listed with no value, and gathered under no data', () => {
    const list = listOf(cloud(WITH_GAP));

    const alpha = list.objects.find(object => object.label === 'alpha');

    expect(alpha?.value).toBeUndefined();
    expect(list.filters).toEqual([{ id: 'no-data', label: 'No data' }]);
    expect(shown(list, 'name', 'no-data')).toEqual(['alpha']);
  });

  test('should come last whichever way the weights are sorted', () => {
    const list = listOf(cloud(WITH_GAP));

    expect(shown(list, 'weight-ascending').at(-1)).toBe('alpha');
    expect(shown(list, 'weight-descending').at(-1)).toBe('alpha');
  });

  test('should offer no filter on a cloud where every term has a weight', () => {
    expect(listOf(cloud()).filters).toEqual([]);
  });
});

describe('each term keeps a key of its own', () => {
  /** One term written twice, the lighter of the two first. */
  const REPEATED: WordCloudPoint[] = [
    { x: 'data', y: 5 },
    { x: 'model', y: 9 },
    { x: 'data', y: 7 },
  ];

  test('should give every term a different key, none of them a cell', () => {
    const keys = listOf(cloud(REPEATED)).objects.map(object => object.key);

    expect(new Set(keys).size).toBe(3);
    for (const key of keys) {
      expect(key).not.toMatch(/^\d+,\d+$/);
    }
  });

  test('should give the same keys when the same layer is built again', () => {
    expect(listOf(cloud(REPEATED)).objects.map(object => object.key))
      .toEqual(listOf(cloud(REPEATED)).objects.map(object => object.key));
  });

  test('should count a repeated term in the order it was written, not by weight', () => {
    // The first "data" written keeps its key when a change of weights moves
    // it ahead of the second in the walk.
    const reweighed: WordCloudPoint[] = [
      { x: 'data', y: 8 },
      { x: 'model', y: 9 },
      { x: 'data', y: 7 },
    ];
    const keyOfValue = (list: ChartObjectList, value: number): string | undefined =>
      list.objects.find(object => object.value?.value === value)?.key;

    expect(keyOfValue(listOf(cloud(reweighed)), 8)).toBe(keyOfValue(listOf(cloud(REPEATED)), 5));
    expect(keyOfValue(listOf(cloud(reweighed)), 7)).toBe(keyOfValue(listOf(cloud(REPEATED)), 7));
  });
});

describe('choosing a term moves the cursor to it', () => {
  test('should land on every term and announce it by the name the list gives', () => {
    const trace = cloud();
    const { objects } = listOf(trace);

    for (const object of objects) {
      expect(trace.moveToObject(object.key)).toBe(true);
      expect(nonEmptyState(trace).text.main.value).toBe(object.label);
    }
  });

  test('should land on the right one of two terms written the same', () => {
    const trace = cloud([{ x: 'data', y: 5 }, { x: 'model', y: 9 }, { x: 'data', y: 7 }]);
    const lighter = listOf(trace).objects.find(object => object.value?.value === 5);
    if (lighter === undefined) {
      throw new Error('Expected the lighter "data"');
    }

    trace.moveToObject(lighter.key);

    expect(nonEmptyState(trace).text.cross?.value).toBe(5);
  });

  test('should refuse a key no term has', () => {
    expect(cloud().moveToObject('["nothing",0]')).toBe(false);
  });
});
