import type { ChoroplethTrace } from '@model/choropleth';
import type { ChoroplethPoint, MaidrLayer } from '@type/grammar';
import type { ChartObject, ChartObjectList, ObjectSortOption } from '@type/objectList';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { arrangeObjects } from '@util/objectList';

/**
 * Six western states, with real centroids and real shared borders -- the
 * fixture `choropleth.test.ts` reads.
 *
 * The map walks them south to north in two bands, California, Nevada and
 * Utah, then Oregon, Washington and Idaho, which is neither alphabetical nor
 * by value. California is above every state it touches and Washington below
 * every one, and three states border four others where the rest border two.
 */
const WEST: ChoroplethPoint[] = [
  { x: 'Washington', y: 10, lat: 47.4, lon: -120.5, neighbors: ['Oregon', 'Idaho'] },
  { x: 'Idaho', y: 30, lat: 44.4, lon: -114.6, neighbors: ['Washington', 'Oregon', 'Nevada', 'Utah'] },
  { x: 'Oregon', y: 20, lat: 43.9, lon: -120.6, neighbors: ['Washington', 'Idaho', 'Nevada', 'California'] },
  { x: 'Utah', y: 85, lat: 39.5, lon: -111.7, neighbors: ['Idaho', 'Nevada'] },
  { x: 'Nevada', y: 90, lat: 39.3, lon: -116.6, neighbors: ['Oregon', 'Idaho', 'Utah', 'California'] },
  { x: 'California', y: 95, lat: 37.2, lon: -119.4, neighbors: ['Oregon', 'Nevada'] },
];

/**
 * A map carrying one region the layer gave no value for -- `NaN` is what
 * `Number(point.y)` leaves of an absent value.
 */
const BLANK_IN_IT: ChoroplethPoint[] = [
  { x: 'Blank', y: Number.NaN, lat: 1, lon: 1, neighbors: ['Alpha'] },
  { x: 'Alpha', y: 5, lat: 2, lon: 1, neighbors: ['Blank', 'Beta'] },
  { x: 'Beta', y: 9, lat: 3, lon: 1, neighbors: ['Alpha'] },
];

/**
 * Create a minimal choropleth layer for model-only tests.
 * @param data The regions the layer carries
 * @returns Choropleth layer definition
 */
function createLayer(data: ChoroplethPoint[] = WEST): MaidrLayer {
  return {
    id: 'test-choropleth-layer',
    type: TraceType.CHOROPLETH,
    title: 'Something by state',
    axes: { x: { label: 'State' }, y: { label: 'Rate' } },
    data,
  };
}

/**
 * Build a choropleth trace the reader has not entered yet.
 * @param data The regions the layer carries
 * @returns The trace
 */
function choropleth(data: ChoroplethPoint[] = WEST): ChoroplethTrace {
  return TraceFactory.create(createLayer(data)) as ChoroplethTrace;
}

/**
 * Read the trace's object list, asserting it offers one.
 * @param trace The trace to read
 * @returns The list
 */
function listOf(trace: ChoroplethTrace): ChartObjectList {
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
 * @param filter The filter's id, or null for every region
 * @returns The labels, in the order shown
 */
function shown(list: ChartObjectList, sortId: string, filter: string | null = null): string[] {
  return labels(arrangeObjects(list.objects, sort(list, sortId).order, filter));
}

/**
 * Find a region in the list by name.
 * @param list The list
 * @param label The region's name
 * @returns The region
 */
function region(list: ChartObjectList, label: string): ChartObject {
  const found = list.objects.find(object => object.label === label);
  if (found === undefined) {
    throw new Error(`Expected a region ${label}`);
  }
  return found;
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: ChoroplethTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

describe('the regions are listed', () => {
  test('should list every region in the order the map is walked', () => {
    const list = listOf(choropleth());

    expect(labels(list.objects))
      .toEqual(['California', 'Nevada', 'Utah', 'Oregon', 'Washington', 'Idaho']);
    expect(region(list, 'Idaho')).toMatchObject({ row: 1, col: 2 });
  });

  test('should call the objects regions, and count them', () => {
    const list = listOf(choropleth());

    expect(list.title).toBe('Regions');
    expect(list.count(6)).toBe('6 regions');
    expect(list.count(1)).toBe('1 region');
  });

  test('should give each region the value it is announced with, on the y axis', () => {
    expect(region(listOf(choropleth()), 'Utah').value)
      .toEqual({ label: 'Rate', value: 85, axis: 'y' });
  });

  test('should offer no list for a map with no regions', () => {
    expect(choropleth([]).getObjectList()).toBeNull();
  });
});

describe('the sorts', () => {
  test('should open alphabetically, and keep the map\'s own order last', () => {
    const list = listOf(choropleth());

    expect(list.sorts.map(option => option.id))
      .toEqual(['name', 'value-descending', 'value-ascending', 'neighbors-descending', 'chart']);
    expect(list.sorts[0].label).toBe('Name, A to Z');
    expect(sort(list, 'chart').label).toBe('Map order, south to north');
  });

  test('should sort the regions by name', () => {
    expect(shown(listOf(choropleth()), 'name'))
      .toEqual(['California', 'Idaho', 'Nevada', 'Oregon', 'Utah', 'Washington']);
  });

  test('should put the highest value first', () => {
    expect(shown(listOf(choropleth()), 'value-descending'))
      .toEqual(['California', 'Nevada', 'Utah', 'Idaho', 'Oregon', 'Washington']);
  });

  test('should put the lowest value first', () => {
    expect(shown(listOf(choropleth()), 'value-ascending'))
      .toEqual(['Washington', 'Oregon', 'Idaho', 'Utah', 'Nevada', 'California']);
  });

  test('should put the regions with most neighbours first', () => {
    const list = listOf(choropleth());

    expect(sort(list, 'neighbors-descending').label).toBe('Neighbors, highest first');
    expect(shown(list, 'neighbors-descending'))
      .toEqual(['Nevada', 'Oregon', 'Idaho', 'California', 'Utah', 'Washington']);
  });

  test('should keep the map\'s order as a sort', () => {
    expect(shown(listOf(choropleth()), 'chart'))
      .toEqual(['California', 'Nevada', 'Utah', 'Oregon', 'Washington', 'Idaho']);
  });

  test('should count and compare neighbours as the region\'s announcement does', () => {
    // A layer that lists a border twice and a region beside itself: the list
    // must not file a region as below all its neighbours that, once the
    // reader jumps there, is announced as not.
    const trace = choropleth([
      { x: 'A', y: 1, neighbors: ['B', 'B', 'A'] },
      { x: 'B', y: 2, neighbors: ['A', 'C'] },
      { x: 'C', y: 3, neighbors: ['B'] },
    ]);
    const list = listOf(trace);
    const a = region(list, 'A');

    expect(trace.moveToObject(a.key)).toBe(true);
    const state = trace.state as NonEmptyTraceState;
    const announced = String(state.text.asides?.[0]?.value);

    expect(a.measures.neighbors).toBe(3);
    expect(announced).toContain('3');
    expect(a.groups).not.toContain('coldspots');
    expect(announced).not.toMatch(/all/i);
    expect(region(list, 'C').groups).toContain('hotspots');
  });

  test('should name the chart order plainly on a map with no centroids', () => {
    // Walked in declared order, which is no direction on the ground.
    const list = listOf(choropleth([{ x: 'B', y: 1 }, { x: 'A', y: 2 }]));

    expect(sort(list, 'chart').label).toBe('Chart order');
  });

  test('should withhold the neighbour sort on a map whose borders do not resolve', () => {
    const list = listOf(choropleth([
      { x: 'B', y: 1, neighbors: ['Atlantis'] },
      { x: 'A', y: 2 },
    ]));

    expect(list.sorts.map(option => option.id))
      .toEqual(['name', 'value-descending', 'value-ascending', 'chart']);
    expect(list.measures.map(measure => measure.id)).toEqual(['value']);
  });

  test('should withhold the value sorts when every region has the same value', () => {
    const list = listOf(choropleth([{ x: 'B', y: 4 }, { x: 'A', y: 4 }]));

    expect(list.sorts.map(option => option.id)).toEqual(['name', 'chart']);
  });
});

describe('the filters', () => {
  test('should gather the regions above and below every neighbour', () => {
    const list = listOf(choropleth());

    expect(list.filters.map(filter => filter.label))
      .toEqual(['Higher than all neighbors', 'Lower than all neighbors']);
    expect(shown(list, 'name', 'hotspots')).toEqual(['California']);
    expect(shown(list, 'name', 'coldspots')).toEqual(['Washington']);
  });

  test('should not call a region lower than all when one neighbour has no value', () => {
    // Alpha is below Beta, but nothing can be said of it against Blank, and
    // its announcement does not say it is below every neighbour either.
    const list = listOf(choropleth(BLANK_IN_IT));

    expect(list.filters.map(filter => filter.id)).toEqual(['hotspots', 'no-data']);
    expect(shown(list, 'name', 'hotspots')).toEqual(['Beta']);
  });

  test('should list a region with no value, and gather it under no data', () => {
    const list = listOf(choropleth(BLANK_IN_IT));

    expect(region(list, 'Blank').value).toBeUndefined();
    expect(shown(list, 'name', 'no-data')).toEqual(['Blank']);
    expect(shown(list, 'value-ascending').at(-1)).toBe('Blank');
    expect(shown(list, 'value-descending').at(-1)).toBe('Blank');
  });

  test('should offer no neighbour filter on a map that declares no borders', () => {
    const list = listOf(choropleth([{ x: 'B', y: 1 }, { x: 'A', y: Number.NaN }]));

    expect(list.filters.map(filter => filter.id)).toEqual(['no-data']);
  });
});

describe('each region keeps a key of its own', () => {
  test('should give every region a different key, none of them a cell', () => {
    const keys = listOf(choropleth()).objects.map(object => object.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).not.toMatch(/^\d+,\d+$/);
    }
  });

  test('should give the same keys when the same layer is built again', () => {
    expect(listOf(choropleth()).objects.map(object => object.key))
      .toEqual(listOf(choropleth()).objects.map(object => object.key));
  });

  test('should tell apart regions whose names read the same', () => {
    const list = listOf(choropleth([{ x: 5, y: 1 }, { x: '5', y: 2 }]));

    expect(labels(list.objects)).toEqual(['5', '5']);
    expect(list.objects[0].key).not.toBe(list.objects[1].key);
  });

  test('should count a repeated name in declared order, not in the order walked', () => {
    // Moving the centroids swaps the two in the walk; each keeps its key.
    const keyOfValue = (list: ChartObjectList, value: number): string | undefined =>
      list.objects.find(object => object.value?.value === value)?.key;
    const before = listOf(choropleth([
      { x: 'X', y: 1, lat: 1, lon: 1 },
      { x: 'X', y: 2, lat: 2, lon: 1 },
    ]));
    const after = listOf(choropleth([
      { x: 'X', y: 1, lat: 2, lon: 1 },
      { x: 'X', y: 2, lat: 1, lon: 1 },
    ]));

    expect(after.objects.map(object => object.value?.value)).toEqual([2, 1]);
    expect(keyOfValue(after, 1)).toBe(keyOfValue(before, 1));
    expect(keyOfValue(after, 2)).toBe(keyOfValue(before, 2));
  });
});

describe('choosing a region moves the cursor to it', () => {
  test('should land on every region and announce it by the name the list gives', () => {
    const trace = choropleth();
    const { objects } = listOf(trace);

    for (const object of objects) {
      expect(trace.moveToObject(object.key)).toBe(true);
      expect(nonEmptyState(trace).text.main.value).toBe(object.label);
    }
  });

  test('should land on the right one of two regions whose names read the same', () => {
    const trace = choropleth([{ x: 5, y: 1 }, { x: '5', y: 2 }]);
    const { objects } = listOf(trace);

    trace.moveToObject(objects[1].key);

    expect(nonEmptyState(trace).text.cross?.value).toBe(2);
  });

  test('should refuse a key no region has', () => {
    expect(choropleth().moveToObject('["Atlantis",0]')).toBe(false);
  });

  test('should end a border walk, even when the jump lands where the walk stood', () => {
    // Nevada's borders run California, Utah, Oregon, Idaho. The walk steps
    // to California; the reader then chooses California from the list. The
    // next step starts from California -- whose first border is Nevada --
    // rather than carrying on round Nevada to Utah.
    const trace = choropleth();
    const list = listOf(trace);
    trace.moveToObject(region(list, 'Nevada').key);
    trace.moveToRotorFilter('neighbours', 'right');
    expect(nonEmptyState(trace).text.main.value).toBe('California');

    trace.moveToObject(region(list, 'California').key);
    trace.moveToRotorFilter('neighbours', 'right');

    expect(nonEmptyState(trace).text.main.value).toBe('Nevada');
  });
});
