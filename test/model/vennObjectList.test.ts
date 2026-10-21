import type { VennTrace } from '@model/venn';
import type { MaidrLayer, VennPoint } from '@type/grammar';
import type { ChartObject, ChartObjectList, ObjectSortOption } from '@type/objectList';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { arrangeObjects } from '@util/objectList';

/**
 * The team-skills diagram of `examples/mermaid/venn.html`, with the sets
 * resized so the largest is not the first: Backend is the biggest set and the
 * second declared, so a sort by size that fell back to the chart's order
 * would show it.
 */
const SKILLS: VennPoint[] = [
  { sets: ['Frontend'], size: 9, items: ['React', 'Design systems'] },
  { sets: ['Backend'], size: 20, items: ['APIs'] },
  { sets: ['Data'], size: 12 },
  { sets: ['Frontend', 'Backend'], size: 5, label: 'Full stack' },
  { sets: ['Backend', 'Data'], size: 4, label: 'Pipelines' },
  { sets: ['Frontend', 'Backend', 'Data'], size: 1, label: 'Unicorns' },
];

/**
 * A diagram that gives no sizes, only the items written in each region, so
 * it is sounded and sorted by how many items each holds.
 */
const PETS: VennPoint[] = [
  { sets: ['Cats'], items: ['Tom', 'Felix'] },
  { sets: ['Dogs'], items: ['Rex'] },
  { sets: ['Cats', 'Dogs'], items: ['Bolt', 'Odie', 'Snoopy'] },
];

/**
 * Build a Venn trace the reader has not entered yet.
 * @param data - The regions
 * @returns The trace
 */
function venn(data: VennPoint[] = SKILLS): VennTrace {
  const layer: MaidrLayer = { id: 'venn', type: TraceType.VENN, title: 'Team skills', data };
  return TraceFactory.create(layer) as VennTrace;
}

/**
 * Read the trace's object list, asserting it offers one.
 * @param trace - The trace
 * @returns The list
 */
function listOf(trace: VennTrace): ChartObjectList {
  const list = trace.getObjectList();
  if (list === null) {
    throw new Error('Expected an object list');
  }
  return list;
}

/**
 * Name the objects, in the order given.
 * @param objects - The objects
 * @returns Their labels
 */
function labels(objects: readonly ChartObject[]): string[] {
  return objects.map(object => object.label);
}

/**
 * Find one of the list's sorts by id.
 * @param list - The list
 * @param id - The sort's id
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
 * @param list - The list
 * @param sortId - The sort's id
 * @param filter - The filter's id, or null for every region
 * @returns The labels, in the order shown
 */
function shown(list: ChartObjectList, sortId: string, filter: string | null = null): string[] {
  return labels(arrangeObjects(list.objects, sort(list, sortId).order, filter));
}

/**
 * Find a region in the list by the name it is announced with.
 * @param list - The list
 * @param label - The region's label
 * @returns The region
 */
function region(list: ChartObjectList, label: string): ChartObject {
  const found = list.objects.find(object => object.label === label);
  if (found === undefined) {
    throw new Error(`Expected a region ${label}`);
  }
  return found;
}

describe('the regions are listed as the arrows reach them', () => {
  test('should list the sets, then the overlaps of two, then of three', () => {
    const list = listOf(venn());

    expect(labels(list.objects)).toEqual([
      'Frontend',
      'Backend',
      'Data',
      'Frontend and Backend',
      'Backend and Data',
      'Frontend, Backend and Data',
    ]);
  });

  test('should call the objects regions, and count them', () => {
    const list = listOf(venn());

    expect(list.title).toBe('Regions');
    expect(list.count(6)).toBe('6 regions');
    expect(list.count(1)).toBe('1 region');
  });

  test('should give a sized region its size, and put its own name beside the sets', () => {
    const list = listOf(venn());

    const fullStack = region(list, 'Frontend and Backend');

    expect(fullStack.value).toEqual({ label: 'Size', value: 5, axis: 'y' });
    expect(fullStack.detail).toBe('Name: Full stack');
    expect(region(list, 'Data').detail).toBeUndefined();
  });

  test('should count the items of an unsized region, which nothing else in the list says', () => {
    const list = listOf(venn(PETS));

    const cats = region(list, 'Cats');

    expect(cats.value).toBeUndefined();
    expect(cats.detail).toBe('Items: 2');
  });

  test('should place each region on the cell the arrows reach it at', () => {
    const list = listOf(venn());

    expect(list.objects.map(object => [object.row, object.col])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [2, 0],
    ]);
  });

  test('should offer no list for a diagram with no regions', () => {
    expect(venn([]).getObjectList()).toBeNull();
  });
});

describe('the sorts', () => {
  test('should open in the chart\'s order and offer size both ways, then names', () => {
    const list = listOf(venn());

    expect(list.sorts.map(option => option.id))
      .toEqual(['chart', 'size-descending', 'size-ascending', 'name']);
    expect(list.sorts[0].label).toBe('Chart order');
    expect(sort(list, 'size-descending').label).toBe('Size, highest first');
  });

  test('should put the largest region first', () => {
    expect(shown(listOf(venn()), 'size-descending')).toEqual([
      'Backend',
      'Data',
      'Frontend',
      'Frontend and Backend',
      'Backend and Data',
      'Frontend, Backend and Data',
    ]);
  });

  test('should put the smallest region first', () => {
    expect(shown(listOf(venn()), 'size-ascending')).toEqual([
      'Frontend, Backend and Data',
      'Backend and Data',
      'Frontend and Backend',
      'Frontend',
      'Data',
      'Backend',
    ]);
  });

  test('should sort the regions by name', () => {
    expect(shown(listOf(venn()), 'name')).toEqual([
      'Backend',
      'Backend and Data',
      'Data',
      'Frontend',
      'Frontend and Backend',
      'Frontend, Backend and Data',
    ]);
  });

  test('should sort an unsized diagram by its item counts, and call them items', () => {
    const list = listOf(venn(PETS));

    expect(sort(list, 'size-descending').label).toBe('Items, highest first');
    expect(shown(list, 'size-descending')).toEqual(['Cats and Dogs', 'Cats', 'Dogs']);
  });

  test('should withhold the size sorts when every region measures the same', () => {
    const list = listOf(venn([{ sets: ['A'] }, { sets: ['B'] }, { sets: ['A', 'B'] }]));

    expect(list.sorts.map(option => option.id)).toEqual(['chart', 'name']);
  });
});

describe('the filters', () => {
  test('should offer the sets, the overlaps by degree, and each set\'s regions', () => {
    const list = listOf(venn());

    expect(list.filters.map(filter => filter.label)).toEqual([
      'Single sets',
      'Overlaps of 2 sets',
      'Overlaps of 3 sets',
      'Including Frontend',
      'Including Backend',
      'Including Data',
    ]);
  });

  test('should hold every region a set takes part in', () => {
    const list = listOf(venn());

    expect(shown(list, 'chart', 'including:Backend')).toEqual([
      'Backend',
      'Frontend and Backend',
      'Backend and Data',
      'Frontend, Backend and Data',
    ]);
    expect(shown(list, 'chart', 'single-sets')).toEqual(['Frontend', 'Backend', 'Data']);
  });

  test('should name an overlap by how many sets it joins, not by its row', () => {
    // No overlap of two is declared, so the second row is the overlaps of
    // three.
    const list = listOf(venn([{ sets: ['A'] }, { sets: ['B'] }, { sets: ['A', 'B', 'C'] }]));

    const filters = list.filters.map(filter => filter.label);

    expect(filters).toContain('Overlaps of 3 sets');
    expect(filters).not.toContain('Overlaps of 2 sets');
  });

  test('should offer a filter per set up to eight sets', () => {
    const sets = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const list = listOf(venn([...sets.map(set => ({ sets: [set] })), { sets: ['A', 'B'] }]));

    expect(list.filters.filter(filter => filter.id.startsWith('including:'))).toHaveLength(8);
  });

  test('should withhold the per-set filters past eight sets', () => {
    const sets = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const list = listOf(venn([...sets.map(set => ({ sets: [set] })), { sets: ['A', 'B'] }]));

    expect(list.filters.map(filter => filter.id)).toEqual(['single-sets', 'overlaps-2']);
  });
});

describe('each region keeps a key of its own', () => {
  test('should give every region a different key, none of them a cell', () => {
    const keys = listOf(venn()).objects.map(object => object.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).not.toMatch(/^\d+,\d+$/);
    }
  });

  test('should give the same keys when the same layer is built again', () => {
    expect(listOf(venn()).objects.map(object => object.key))
      .toEqual(listOf(venn()).objects.map(object => object.key));
  });

  test('should key a region by its sets whichever order they were first named in', () => {
    // With Pipelines declared first, Backend is named before Frontend and
    // the overlap is announced the other way round; it is still the one
    // region.
    const reordered = [SKILLS[4], ...SKILLS.slice(0, 4), SKILLS[5]];
    const forwards = region(listOf(venn()), 'Frontend and Backend');
    const backwards = region(listOf(venn(reordered)), 'Backend and Frontend');

    expect(backwards.key).toBe(forwards.key);
  });
});

describe('choosing a region moves the cursor to it', () => {
  test('should land on every region and announce it by the name the list gives', () => {
    const trace = venn();
    const { objects } = listOf(trace);

    for (const object of objects) {
      expect(trace.moveToObject(object.key)).toBe(true);
      const state = trace.state;
      expect(state.empty ? null : state.text.main.value).toBe(object.label);
    }
  });

  test('should refuse a key no region has', () => {
    expect(venn().moveToObject('["Nowhere"]')).toBe(false);
  });
});
