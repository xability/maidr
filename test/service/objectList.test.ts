/**
 * The object list service: what the `o` list holds, how it is ordered and
 * narrowed, what each row says, and the jump.
 *
 * The scope cases drive the real DisplayService focus stack, as the Go To
 * dialog's do, so the scope a reader lands back in is the one they would.
 */
import type { Context } from '@model/context';
import type { FormatterService } from '@service/formatter';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { ChartObject, ChartObjectList } from '@type/objectList';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { AbstractTrace } from '@model/abstract';
import { DisplayService } from '@service/display';
import { ObjectListService } from '@service/objectList';
import { Scope } from '@type/event';
import { chartOrderSort, counter, measureSort, nameSort } from '@util/objectList';

const DEGREE = { id: 'degree', label: 'Links', spoken: true };
const BETWEENNESS = { id: 'betweenness', label: 'Betweenness', spoken: false };

/**
 * A node of the fixture network.
 * @param col - Its cell, which is also its chart order
 * @param label - Its name
 * @param degree - Its links
 * @param groups - The filters it is in
 * @returns The object
 */
function node(col: number, label: string, degree: number, groups: string[]): ChartObject {
  return {
    key: `node:${label}`,
    label,
    value: { label: 'Links', value: degree, axis: 'y' },
    detail: groups.includes('group-1') ? 'Group 1' : 'Group 2',
    row: 0,
    col,
    measures: { degree },
    groups,
  };
}

const OBJECTS: ChartObject[] = [
  node(0, 'Grace', 3, ['group-1']),
  node(1, 'Ada', 5, ['group-1']),
  node(2, 'Tim', 2, ['group-2']),
  node(3, 'Vint', 2, ['group-2']),
];

/**
 * The fixture's list, with a deferred betweenness counting its calls.
 * @param compute - Stands in for the centrality walk
 * @returns The list
 */
function fixtureList(compute: () => readonly number[]): ChartObjectList {
  return {
    title: 'Nodes',
    count: counter('model.objectNodesOne', 'model.objectNodesMany'),
    objects: OBJECTS,
    measures: [DEGREE, BETWEENNESS],
    sorts: [
      nameSort(),
      measureSort(DEGREE, 'descending'),
      measureSort(BETWEENNESS, 'descending'),
      chartOrderSort(),
    ],
    filters: [
      { id: 'group-1', label: 'Group 1' },
      { id: 'group-2', label: 'Group 2' },
    ],
    deferred: { betweenness: compute },
  };
}

interface FakeTrace {
  trace: AbstractTrace;
  moveToObject: jest.Mock<(key: string) => boolean>;
  setCursor: (col: number, initial?: boolean) => void;
}

/**
 * A trace the service accepts: built on AbstractTrace's prototype, since the
 * service checks `instanceof`, with only what the service reads.
 * @param id - The layer id
 * @param list - Its object list
 * @returns The trace and its handles
 */
function fakeTrace(id: string, list: ChartObjectList | null): FakeTrace {
  const trace = Object.create(AbstractTrace.prototype) as AbstractTrace;
  const cursor = { col: 0, initial: true };
  const moveToObject = jest.fn((key: string) => OBJECTS.some(object => object.key === key));
  Object.defineProperties(trace, {
    getId: { value: () => id },
    getObjectList: { value: () => list },
    moveToObject: { value: moveToObject },
    row: { get: () => 0 },
    col: { get: () => cursor.col },
    isInitialEntry: { get: () => cursor.initial },
  });
  return {
    trace,
    moveToObject,
    setCursor: (col, initial = false) => {
      cursor.col = col;
      cursor.initial = initial;
    },
  };
}

/** Minimal plot element exposing only what DisplayService touches. */
function createMockPlot(): HTMLElement {
  return {
    focus: jest.fn(),
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
    getAttribute: jest.fn(() => null),
    parentElement: null,
    tabIndex: 0,
  } as unknown as HTMLElement;
}

function createMockTextService(): TextService {
  return {
    onChange: jest.fn(() => ({ dispose: jest.fn() })),
    format: jest.fn(() => ''),
  } as unknown as TextService;
}

interface Setup {
  context: Context & { active: unknown; scope: Scope };
  display: DisplayService;
  service: ObjectListService;
  notify: jest.Mock<(message: string) => void>;
  compute: jest.Mock<() => readonly number[]>;
  fake: FakeTrace;
}

/**
 * The service over a context on the fixture network.
 * @param list - The list the trace offers, when not the fixture's
 * @returns The service and its collaborators
 */
function setup(list?: ChartObjectList | null): Setup {
  const compute = jest.fn((): readonly number[] => [0.5, 0.9, 0, 0]);
  const fake = fakeTrace('net', list === undefined ? fixtureList(compute) : list);
  const context = {
    scope: Scope.TRACE,
    active: fake.trace as unknown,
    state: { type: 'trace', empty: false },
    activeLevel: 'trace',
    getInstruction: jest.fn(() => 'test instruction'),
    toggleScope: jest.fn((next: Scope) => {
      context.scope = next;
    }),
  };
  const typedContext = context as unknown as Setup['context'];
  const display = new DisplayService(typedContext, createMockPlot(), createMockTextService());
  const formatter = {
    formatSingleValue: jest.fn((value: number | string) => `#${value}`),
  } as unknown as FormatterService;
  const notify = jest.fn<(message: string) => void>();
  const notification = { notify } as unknown as NotificationService;
  const service = new ObjectListService(typedContext, display, formatter, notification);
  return { context: typedContext, display, service, notify, compute, fake };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ObjectListService', () => {
  test('should open in the chart\'s first order with every object', () => {
    const { service } = setup();

    const view = service.open();

    expect(view?.title).toBe('Nodes');
    expect(view?.rows.map(row => row.label)).toEqual(['Ada', 'Grace', 'Tim', 'Vint']);
    expect(view?.summary).toBe('4 nodes, Name, A to Z');
    expect(view?.sortLabel).toBe('Name, A to Z');
    expect(view?.filterLabel).toBe('All');
    expect(view?.canSort).toBe(true);
    expect(view?.canFilter).toBe(true);
  });

  test('should say each object\'s value in the layer\'s own format, then its detail', () => {
    const { service } = setup();

    const view = service.open();

    expect(view?.rows[0].detail).toBe('Links: #5, Group 1');
  });

  test('should name only the keys the chart offers', () => {
    const { service } = setup();
    const plain = fixtureList(() => []);
    const one = setup({ ...plain, sorts: [nameSort()], filters: [] }).service;

    expect(service.open()?.description).toBe(
      'Up and Down arrows choose, Enter goes there, Escape closes. S changes the order. F changes the filter.',
    );
    expect(one.open()?.description).toBe('Up and Down arrows choose, Enter goes there, Escape closes.');
  });

  test('should mark the object the reader is on, and select it', () => {
    const { service, fake } = setup();
    fake.setCursor(2);

    const view = service.open();

    expect(view?.rows.filter(row => row.current).map(row => row.label)).toEqual(['Tim']);
    expect(view?.currentIndex).toBe(2);
  });

  test('should mark nothing before the reader has moved', () => {
    const { service } = setup();

    const view = service.open();

    expect(view?.rows.some(row => row.current)).toBe(false);
    expect(view?.currentIndex).toBe(0);
  });

  test('should step through the orders and wrap around', () => {
    const { service } = setup();
    service.open();

    expect(service.cycleSort(1)?.rows.map(row => row.label)).toEqual(['Ada', 'Grace', 'Tim', 'Vint']);
    expect(service.cycleSort(1)?.sortLabel).toBe('Betweenness, highest first');
    expect(service.cycleSort(1)?.rows.map(row => row.label)).toEqual(['Grace', 'Ada', 'Tim', 'Vint']);
    expect(service.cycleSort(1)?.sortLabel).toBe('Name, A to Z');
    expect(service.cycleSort(-1)?.sortLabel).toBe('Chart order');
  });

  test('should work out a deferred measure only when its order is chosen, and once', () => {
    const { service, compute } = setup();
    service.open();
    service.cycleSort(1);
    expect(compute).not.toHaveBeenCalled();

    const view = service.cycleSort(1);
    service.cycleSort(1);
    service.cycleSort(-1);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(view?.rows.map(row => row.label)).toEqual(['Ada', 'Grace', 'Tim', 'Vint']);
  });

  test('should read out the measure a list is sorted by when the row does not already say it', () => {
    const { service } = setup();
    service.open();
    service.cycleSort(1);

    const byBetweenness = service.cycleSort(1);

    expect(byBetweenness?.rows[0].detail).toBe('Links: #5, Betweenness: 0.9, Group 1');
  });

  test('should step through the filters, passing through all of them between the ends', () => {
    const { service } = setup();
    service.open();

    const first = service.cycleFilter(1);
    const second = service.cycleFilter(1);
    const all = service.cycleFilter(1);
    const back = service.cycleFilter(-1);

    expect(first?.rows.map(row => row.label)).toEqual(['Ada', 'Grace']);
    expect(first?.summary).toBe('Group 1: 2 of 4 nodes, Name, A to Z');
    expect(second?.filterLabel).toBe('Group 2');
    expect(all?.rows).toHaveLength(4);
    expect(all?.filterLabel).toBe('All');
    expect(back?.filterLabel).toBe('Group 2');
  });

  test('should say there is nothing to change on a chart with one order and no filters', () => {
    const plain = fixtureList(() => []);
    const { service } = setup({ ...plain, sorts: [nameSort()], filters: [] });
    service.open();

    expect(service.cycleSort(1)).toBeNull();
    expect(service.cycleFilter(1)).toBeNull();
  });

  test('should reopen a layer in the order and filter last chosen on it', () => {
    const { service } = setup();
    service.open();
    service.cycleSort(1);
    service.cycleFilter(1);

    const reopened = service.open();

    expect(reopened?.sortLabel).toBe('Links, highest first');
    expect(reopened?.filterLabel).toBe('Group 1');
  });

  test('should offer no list on a layer without one', () => {
    const { service } = setup(null);

    expect(service.isAvailable()).toBe(false);
    expect(service.open()).toBeNull();
  });

  test('should offer no list when the reader is not on a layer', () => {
    const { service, context } = setup();
    (context as { active: unknown }).active = { level: 'figure' };

    expect(service.isAvailable()).toBe(false);
  });

  test('should jump only once the chart has focus again', () => {
    const { service, fake } = setup();
    service.open();

    service.moveToObject('node:Tim', 'Tim');
    expect(fake.moveToObject).not.toHaveBeenCalled();
    jest.runAllTimers();

    expect(fake.moveToObject).toHaveBeenCalledWith('node:Tim');
  });

  test('should say an object is gone rather than move to another layer\'s', () => {
    const { service, context, notify } = setup();
    service.open();
    const other = fakeTrace('other-layer', fixtureList(() => []));
    context.active = other.trace;

    service.moveToObject('node:Tim', 'Tim');
    jest.runAllTimers();

    expect(other.moveToObject).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Tim is no longer on the chart');
  });

  test('should say an object is gone when the layer no longer has it', () => {
    const { service, notify } = setup();
    service.open();

    service.moveToObject('node:Nobody', 'Nobody');
    jest.runAllTimers();

    expect(notify).toHaveBeenCalledWith('Nobody is no longer on the chart');
  });

  test('should drop a pending jump when disposed', () => {
    const { service, fake } = setup();
    service.open();

    service.moveToObject('node:Tim', 'Tim');
    service.dispose();
    jest.runAllTimers();

    expect(fake.moveToObject).not.toHaveBeenCalled();
  });
});

describe('ObjectListService scope', () => {
  test('should return to the chart when opened from the chart', () => {
    const { context, service } = setup();
    service.open();

    service.enterScope();
    expect(context.scope).toBe(Scope.OBJECT_LIST);
    service.close();
    jest.runAllTimers();

    expect(context.scope).toBe(Scope.TRACE);
  });

  test('should return to braille mode when opened from braille', () => {
    const { context, display, service } = setup();
    display.toggleFocus(Scope.BRAILLE);
    jest.runAllTimers();

    service.enterScope();
    service.close();
    jest.runAllTimers();

    expect(context.scope).toBe(Scope.BRAILLE);
  });

  test('should not reopen the list when its scope was already left', () => {
    const { context, display, service } = setup();
    display.toggleFocus(Scope.BRAILLE);
    jest.runAllTimers();

    service.enterScope();
    service.close();
    service.close();
    jest.runAllTimers();

    expect(context.scope).toBe(Scope.BRAILLE);
  });
});
