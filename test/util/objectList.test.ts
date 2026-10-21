import type { ChartObject } from '@type/objectList';
import { afterEach, describe, expect, test } from '@jest/globals';
import { setLocale } from '@util/i18n';
import {
  arrangeObjects,
  chartOrderSort,
  counter,
  measureSort,
  measureVaries,
  nameSort,
  occurrenceKeys,
  offerFilters,
} from '@util/objectList';
import '../../src/locale/ko';

/**
 * An object with only what a test cares about filled in.
 * @param order - Its place in the chart's order, which is also its cell
 * @param label - Its name
 * @param measures - Its numeric properties
 * @param groups - The filters it belongs to
 * @returns The object
 */
function object(
  order: number,
  label: string,
  measures: Record<string, number> = {},
  groups: string[] = [],
): ChartObject {
  return { key: label, label, row: 0, col: order, measures, groups };
}

const OBJECTS: ChartObject[] = [
  object(0, 'Grace', { links: 2 }, ['group-1']),
  object(1, 'ada', { links: 5 }, ['group-1']),
  object(2, 'Node 10', { links: 1 }, ['group-2']),
  object(3, 'Node 2', { links: Number.NaN }, ['group-2']),
  object(4, 'Édith', { links: 2 }, ['group-1']),
];

const labels = (objects: ChartObject[]): string[] => objects.map(o => o.label);

afterEach(() => {
  setLocale('en');
});

describe('arrangeObjects', () => {
  test('should keep the chart order for the chart sort', () => {
    const arranged = arrangeObjects(OBJECTS, { kind: 'chart' }, null);

    expect(labels(arranged)).toEqual(['Grace', 'ada', 'Node 10', 'Node 2', 'Édith']);
  });

  test('should sort names alphabetically ignoring case and accents, with numbers as numbers', () => {
    const arranged = arrangeObjects(OBJECTS, { kind: 'name', direction: 'ascending' }, null);

    expect(labels(arranged)).toEqual(['ada', 'Édith', 'Grace', 'Node 2', 'Node 10']);
  });

  test('should reverse the alphabet for a descending name sort', () => {
    const arranged = arrangeObjects(OBJECTS, { kind: 'name', direction: 'descending' }, null);

    expect(labels(arranged)).toEqual(['Node 10', 'Node 2', 'Grace', 'Édith', 'ada']);
  });

  test('should put the highest measure first and break ties by chart order', () => {
    const arranged = arrangeObjects(
      OBJECTS,
      { kind: 'measure', measure: 'links', direction: 'descending' },
      null,
    );

    expect(labels(arranged)).toEqual(['ada', 'Grace', 'Édith', 'Node 10', 'Node 2']);
  });

  test('should sort unknown measures last in both directions', () => {
    const arranged = arrangeObjects(
      OBJECTS,
      { kind: 'measure', measure: 'links', direction: 'ascending' },
      null,
    );

    expect(labels(arranged)).toEqual(['Node 10', 'Grace', 'Édith', 'ada', 'Node 2']);
  });

  test('should treat a measure an object lacks as unknown', () => {
    const arranged = arrangeObjects(
      OBJECTS,
      { kind: 'measure', measure: 'absent', direction: 'descending' },
      null,
    );

    expect(labels(arranged)).toEqual(labels(OBJECTS));
  });

  test('should show only the objects in the chosen filter', () => {
    const arranged = arrangeObjects(OBJECTS, { kind: 'chart' }, 'group-2');

    expect(labels(arranged)).toEqual(['Node 10', 'Node 2']);
  });

  test('should not change the list it is given', () => {
    const before = labels(OBJECTS);

    arrangeObjects(OBJECTS, { kind: 'name', direction: 'descending' }, null);

    expect(labels(OBJECTS)).toEqual(before);
  });
});

describe('sort options', () => {
  const links = { id: 'links', label: 'Links', spoken: true };

  test('should name the shared sorts in the active language', () => {
    expect(chartOrderSort().label).toBe('Chart order');
    expect(nameSort().label).toBe('Name, A to Z');
    expect(measureSort(links, 'descending').label).toBe('Links, highest first');
    expect(measureSort(links, 'ascending').label).toBe('Links, lowest first');
  });

  test('should follow the language the reader chose', () => {
    setLocale('ko');

    expect(nameSort().label).toBe('이름순');
    expect(measureSort(links, 'descending').label).toBe('Links, 높은 순');
  });

  test('should give every shared sort a distinct id', () => {
    const ids = [chartOrderSort(), nameSort(), measureSort(links, 'descending'), measureSort(links, 'ascending')]
      .map(sort => sort.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('should keep a chart\'s own name for its order', () => {
    expect(chartOrderSort('Graph order')).toEqual({
      id: 'chart',
      label: 'Graph order',
      order: { kind: 'chart' },
    });
  });
});

describe('measureVaries', () => {
  test('should say whether a measure tells two objects apart', () => {
    expect(measureVaries(OBJECTS, 'links')).toBe(true);
    expect(measureVaries(OBJECTS.slice(0, 1), 'links')).toBe(false);
    expect(measureVaries([OBJECTS[0], OBJECTS[4]], 'links')).toBe(false);
    expect(measureVaries(OBJECTS, 'absent')).toBe(false);
  });
});

describe('counter', () => {
  test('should use the singular for one and the plural for any other count', () => {
    const nodes = counter('model.objectNodesOne', 'model.objectNodesMany');

    expect(nodes(1)).toBe('1 node');
    expect(nodes(0)).toBe('0 nodes');
    expect(nodes(42)).toBe('42 nodes');
  });
});

describe('occurrenceKeys', () => {
  test('should tell apart objects that share a name, and nothing else', () => {
    const keyOf = occurrenceKeys();

    const keys = ['Other', 'France', 'Other'].map(keyOf);

    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).not.toBe(keys[2]);
  });

  test('should give the same names the same keys when built again', () => {
    const first = ['A', 'B', 'A'].map(occurrenceKeys());
    const second = ['A', 'B', 'A'].map(occurrenceKeys());

    expect(second).toEqual(first);
  });
});

describe('offerFilters', () => {
  test('should drop a filter that matches nothing or everything', () => {
    const everyone = OBJECTS.map(o => ({ ...o, groups: [...o.groups, 'all'] }));

    const offered = offerFilters(everyone, [
      { id: 'group-1', label: 'Group 1' },
      { id: 'nobody', label: 'Nobody' },
      { id: 'all', label: 'Everyone' },
      { id: 'group-2', label: 'Group 2' },
    ]);

    expect(offered.map(filter => filter.id)).toEqual(['group-1', 'group-2']);
  });

  test('should drop a filter showing the same objects as an earlier one', () => {
    const offered = offerFilters(OBJECTS.map(o => ({ ...o, groups: [...o.groups, ...o.groups.map(g => `${g}-again`)] })), [
      { id: 'group-1', label: 'Level 2' },
      { id: 'group-1-again', label: 'Leaves' },
      { id: 'group-2', label: 'Group 2' },
    ]);

    expect(offered.map(filter => filter.label)).toEqual(['Level 2', 'Group 2']);
  });
});
