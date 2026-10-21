import type { PieTrace } from '@model/pie';
import type { MaidrLayer } from '@type/grammar';
import type { ChartObject, ChartObjectList, ObjectSortOption } from '@type/objectList';
import type { TraceState } from '@type/state';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { PieDirection, TraceType } from '@type/grammar';
import { arrangeObjects } from '@util/objectList';

/** A slice as a test declares it: a gap is `null`, as a producer sends one. */
interface Slice {
  x: string | number;
  y: number | null;
}

/**
 * The values of `examples/pie.html` -- 120 units, not 100, so a share can
 * only come from the model dividing it out -- under names authored out of
 * alphabetical order, so the walk, the alphabet and both share orders all
 * differ.
 */
const FRUIT: Slice[] = [
  { x: 'Cherries', y: 30 },
  { x: 'Apples', y: 45 },
  { x: 'Dates', y: 25 },
  { x: 'Bananas', y: 20 },
];

/**
 * Builds a pie layer. A gap is passed as `null`, which is what a producer with
 * no measurement for a slice emits; `PiePoint.y` is declared numeric but is
 * parsed from JSON, so `null` really does arrive there — hence the cast.
 */
function pieLayer(
  data: Slice[],
  direction?: PieDirection,
): MaidrLayer {
  return {
    id: 'slices',
    type: TraceType.PIE,
    title: 'Fruit sales',
    axes: { x: { label: 'Fruit' }, y: { label: 'Units sold' } },
    data: data.map(({ x, y }) => ({ x, y: y as number })),
    ...(direction === undefined ? {} : { direction }),
  };
}

/** Builds a pie the reader has not entered yet. */
function pie(
  data: Slice[] = FRUIT,
  direction?: PieDirection,
): PieTrace {
  return TraceFactory.create(pieLayer(data, direction)) as PieTrace;
}

/** Reads the pie's object list, asserting it offers one. */
function listOf(trace: PieTrace): ChartObjectList {
  const list = trace.getObjectList();
  if (list === null) {
    throw new Error('expected an object list');
  }
  return list;
}

/** Names the objects, in the order given. */
function labels(objects: readonly ChartObject[]): string[] {
  return objects.map(object => object.label);
}

/** Finds one of the list's sorts by id. */
function sort(list: ChartObjectList, id: string): ObjectSortOption {
  const found = list.sorts.find(option => option.id === id);
  if (found === undefined) {
    throw new Error(`expected a sort ${id}`);
  }
  return found;
}

/** The labels the list shows under one sort and filter. */
function shown(list: ChartObjectList, sortId: string, filter: string | null = null): string[] {
  return labels(arrangeObjects(list.objects, sort(list, sortId).order, filter));
}

/** Narrows the trace state union to the populated case. */
function stateOf(trace: PieTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state;
}

describe('pie object list contents', () => {
  it('lists every slice clockwise, as the arrows walk them', () => {
    const list = listOf(pie());

    expect(labels(list.objects)).toEqual(['Cherries', 'Apples', 'Dates', 'Bananas']);
    expect(list.objects.map(object => [object.row, object.col]))
      .toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
  });

  it('lists a counterclockwise pie in its clockwise walk', () => {
    const list = listOf(pie(FRUIT, PieDirection.COUNTERCLOCKWISE));

    expect(labels(list.objects)).toEqual(['Bananas', 'Dates', 'Apples', 'Cherries']);
    expect(list.objects.map(object => object.col)).toEqual([0, 1, 2, 3]);
  });

  it('calls the objects slices, and counts them', () => {
    const list = listOf(pie());

    expect(list.title).toBe('Slices');
    expect(list.count(4)).toBe('4 slices');
    expect(list.count(1)).toBe('1 slice');
  });

  it('gives each slice its value on the y axis and its share as announced', () => {
    const [cherries] = listOf(pie()).objects;

    expect(cherries.value).toEqual({ label: 'Units sold', value: 30, axis: 'y' });
    expect(cherries.detail).toBe('Percentage: 25.0%');
  });

  it('offers no list for a pie with no slices', () => {
    expect(pie([]).getObjectList()).toBeNull();
  });

  it('offers no list once the pie is disposed', () => {
    const trace = pie();

    trace.dispose();

    expect(trace.getObjectList()).toBeNull();
  });
});

describe('pie object list sorts', () => {
  it('opens in clockwise order, then share both ways, then names', () => {
    const list = listOf(pie());

    expect(list.sorts.map(option => option.id))
      .toEqual(['chart', 'share-descending', 'share-ascending', 'name']);
    expect(list.sorts[0].label).toBe('Clockwise order');
    expect(sort(list, 'share-descending').label).toBe('Percentage, highest first');
  });

  it('puts the largest share first', () => {
    expect(shown(listOf(pie()), 'share-descending'))
      .toEqual(['Apples', 'Cherries', 'Dates', 'Bananas']);
  });

  it('puts the smallest share first', () => {
    expect(shown(listOf(pie()), 'share-ascending'))
      .toEqual(['Bananas', 'Dates', 'Cherries', 'Apples']);
  });

  it('sorts the slices by name', () => {
    expect(shown(listOf(pie()), 'name')).toEqual(['Apples', 'Bananas', 'Cherries', 'Dates']);
  });

  it('ranks a negative slice by the share of the circle it occupies', () => {
    // -40 is drawn as 40 of 130, larger than the 30 slice: ranked by its
    // signed value it would come last.
    const list = listOf(pie([{ x: 'Gain', y: 60 }, { x: 'Loss', y: -40 }, { x: 'Flat', y: 30 }]));

    expect(shown(list, 'share-descending')).toEqual(['Gain', 'Loss', 'Flat']);
  });

  it('withholds the share sorts when every slice is the same size', () => {
    const list = listOf(pie([{ x: 'B', y: 1 }, { x: 'A', y: 1 }]));

    expect(list.sorts.map(option => option.id)).toEqual(['chart', 'name']);
  });
});

describe('pie object list gaps', () => {
  const GAPPED = [{ x: 'Apples', y: 30 }, { x: 'Bananas', y: null }, { x: 'Cherries', y: 20 }];

  it('lists a gap with no value, and gathers it under no data', () => {
    const list = listOf(pie(GAPPED));

    const bananas = list.objects[1];

    expect(bananas.value).toBeUndefined();
    expect(bananas.detail).toBe('Percentage: missing');
    expect(list.filters).toEqual([{ id: 'no-data', label: 'No data' }]);
    expect(shown(list, 'chart', 'no-data')).toEqual(['Bananas']);
  });

  it('sorts a gap last whichever way the shares run', () => {
    const list = listOf(pie(GAPPED));

    expect(shown(list, 'share-descending')).toEqual(['Apples', 'Cherries', 'Bananas']);
    expect(shown(list, 'share-ascending')).toEqual(['Cherries', 'Apples', 'Bananas']);
  });

  it('offers no filter on a pie with no gaps', () => {
    expect(listOf(pie()).filters).toEqual([]);
  });
});

describe('pie object list keys', () => {
  /** One name on two slices, the larger declared second. */
  const REPEATED = [{ x: 'Other', y: 10 }, { x: 'Main', y: 50 }, { x: 'Other', y: 5 }];

  it('gives every slice a different key, none of them a cell', () => {
    const keys = listOf(pie(REPEATED)).objects.map(object => object.key);

    expect(new Set(keys).size).toBe(3);
    for (const key of keys) {
      expect(key).not.toMatch(/^\d+,\d+$/);
    }
  });

  it('gives the same keys when the same layer is built again', () => {
    expect(listOf(pie()).objects.map(object => object.key))
      .toEqual(listOf(pie()).objects.map(object => object.key));
  });

  it('keys a slice by the order it was authored in, whichever way the pie runs', () => {
    const keyOfValue = (list: ChartObjectList, value: number): string | undefined =>
      list.objects.find(object => object.value?.value === value)?.key;
    const clockwise = listOf(pie(REPEATED));
    const counterclockwise = listOf(pie(REPEATED, PieDirection.COUNTERCLOCKWISE));

    expect(keyOfValue(counterclockwise, 10)).toBe(keyOfValue(clockwise, 10));
    expect(keyOfValue(counterclockwise, 5)).toBe(keyOfValue(clockwise, 5));
  });
});

describe('pie object list moves', () => {
  it('lands on every slice and announces it by the name the list gives', () => {
    const trace = pie();
    const { objects } = listOf(trace);

    for (const object of objects) {
      expect(trace.moveToObject(object.key)).toBe(true);
      expect(stateOf(trace).text.main.value).toBe(object.label);
    }
  });

  it('lands on the slice chosen on a counterclockwise pie', () => {
    const trace = pie(FRUIT, PieDirection.COUNTERCLOCKWISE);
    const apples = listOf(trace).objects.find(object => object.label === 'Apples');
    if (apples === undefined) {
      throw new Error('expected Apples');
    }

    trace.moveToObject(apples.key);

    expect(stateOf(trace).text.main.value).toBe('Apples');
    expect(stateOf(trace).text.cross?.value).toBe(45);
  });

  it('refuses a key no slice has', () => {
    expect(pie().moveToObject('["Kiwis",0]')).toBe(false);
  });
});
