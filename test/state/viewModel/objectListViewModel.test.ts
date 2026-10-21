import type { ObjectListRow, ObjectListService, ObjectListView } from '@service/objectList';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { ObjectListViewModel } from '@state/viewModel/objectListViewModel';

/**
 * A row with only a name.
 * @param label - Its name
 * @param current - Whether the reader is on it
 * @returns The row
 */
function row(label: string, current = false): ObjectListRow {
  return { key: label, label, detail: '', current };
}

/**
 * A view of the given rows.
 * @param rows - The rows
 * @param overrides - Anything else to set
 * @returns The view
 */
function view(rows: ObjectListRow[], overrides: Partial<ObjectListView> = {}): ObjectListView {
  return {
    title: 'Nodes',
    description: 'keys',
    summary: `${rows.length} nodes, Name, A to Z`,
    sortLabel: 'Name, A to Z',
    filterLabel: 'All',
    canSort: true,
    canFilter: true,
    rows,
    currentIndex: Math.max(0, rows.findIndex(candidate => candidate.current)),
    ...overrides,
  };
}

const ROWS = Array.from({ length: 25 }, (_, i) => row(`Node ${i + 1}`, i === 2));

type ServiceStub = { [K in keyof ObjectListService]: jest.Mock };

/**
 * The view model over a real store and a stub service.
 * @param opened - What the service opens with, or null for a chart without a list
 * @returns The view model, the store and the stub
 */
function setup(opened: ObjectListView | null = view(ROWS)): {
  viewModel: ObjectListViewModel;
  store: ReturnType<typeof createMaidrStore>;
  service: ServiceStub;
} {
  const store = createMaidrStore();
  const service = {
    isAvailable: jest.fn(() => opened !== null),
    open: jest.fn(() => opened),
    enterScope: jest.fn(),
    close: jest.fn(),
    cycleSort: jest.fn(),
    cycleFilter: jest.fn(),
    moveToObject: jest.fn(),
    dispose: jest.fn(),
  } as ServiceStub;
  const viewModel = new ObjectListViewModel(store, service as unknown as ObjectListService);
  return { viewModel, store, service };
}

describe('ObjectListViewModel', () => {
  test('should show the list before entering its scope, on the reader\'s object', () => {
    const { viewModel, service } = setup();
    service.enterScope.mockImplementation(() => {
      // The dialog mounts on the scope change, so the rows must be there by then.
      expect(viewModel.state.rows).toHaveLength(25);
    });

    const opened = viewModel.open();

    expect(opened).toBe(true);
    expect(service.enterScope).toHaveBeenCalledTimes(1);
    expect(viewModel.state.visible).toBe(true);
    expect(viewModel.state.selectedIndex).toBe(2);
    expect(viewModel.state.announceSummary).toBe(false);
  });

  test('should not open, or enter the scope, on a chart without a list', () => {
    const { viewModel, service } = setup(null);

    expect(viewModel.open()).toBe(false);
    expect(service.enterScope).not.toHaveBeenCalled();
    expect(viewModel.state.visible).toBe(false);
  });

  test('should move the selection and stop at the ends, saying so', () => {
    const { viewModel } = setup();
    viewModel.open();

    viewModel.moveUp();
    viewModel.moveUp();
    expect(viewModel.state.selectedIndex).toBe(0);
    expect(viewModel.state.message).toBeNull();

    viewModel.moveUp();
    expect(viewModel.state.selectedIndex).toBe(0);
    expect(viewModel.state.message?.text).toBe('Top of the list');
  });

  test('should say the same boundary again as a new message', () => {
    const { viewModel } = setup();
    viewModel.open();
    viewModel.moveToFirst();
    viewModel.moveUp();
    const first = viewModel.state.message;

    viewModel.moveUp();

    expect(viewModel.state.message?.text).toBe('Top of the list');
    expect(viewModel.state.message?.id).not.toBe(first?.id);
  });

  test('should page by ten and clamp at the last row', () => {
    const { viewModel } = setup();
    viewModel.open();

    viewModel.pageDown();
    expect(viewModel.state.selectedIndex).toBe(12);
    viewModel.pageDown();
    viewModel.pageDown();
    expect(viewModel.state.selectedIndex).toBe(24);
    viewModel.pageDown();
    expect(viewModel.state.message?.text).toBe('End of the list');
    viewModel.pageUp();
    expect(viewModel.state.selectedIndex).toBe(14);
  });

  test('should go to the first and last rows', () => {
    const { viewModel } = setup();
    viewModel.open();

    viewModel.moveToLast();
    expect(viewModel.state.selectedIndex).toBe(24);
    viewModel.moveToFirst();
    expect(viewModel.state.selectedIndex).toBe(0);
  });

  test('should close before it jumps, and jump to the selected object', () => {
    const { viewModel, service } = setup();
    viewModel.open();
    viewModel.moveDown();
    service.close.mockImplementation(() => {
      expect(service.moveToObject).not.toHaveBeenCalled();
    });

    viewModel.selectCurrent();

    expect(service.close).toHaveBeenCalledTimes(1);
    expect(service.moveToObject).toHaveBeenCalledWith('Node 4', 'Node 4');
    expect(viewModel.state.visible).toBe(false);
  });

  test('should keep the rows when it closes, so focus has somewhere to be until the chart takes it', () => {
    const { viewModel } = setup();
    viewModel.open();

    viewModel.hide();

    expect(viewModel.state.visible).toBe(false);
    expect(viewModel.state.rows).toHaveLength(25);
  });

  test('should jump to a clicked row', () => {
    const { viewModel, service } = setup();
    viewModel.open();

    viewModel.selectIndex(7);

    expect(service.moveToObject).toHaveBeenCalledWith('Node 8', 'Node 8');
  });

  test('should open a new order from its first row and say it with that row', () => {
    const { viewModel, service } = setup();
    viewModel.open();
    const revision = viewModel.state.revision;
    service.cycleSort.mockReturnValue(view([row('Ada'), row('Grace')], { summary: '2 nodes, Links, highest first' }));

    viewModel.cycleSort(1);

    expect(service.cycleSort).toHaveBeenCalledWith(1);
    expect(viewModel.state.rows.map(candidate => candidate.label)).toEqual(['Ada', 'Grace']);
    expect(viewModel.state.selectedIndex).toBe(0);
    expect(viewModel.state.revision).toBe(revision + 1);
    expect(viewModel.state.announceSummary).toBe(true);
    expect(viewModel.state.message).toBeNull();

    viewModel.moveDown();
    expect(viewModel.state.announceSummary).toBe(false);
  });

  test('should say a new order chosen from a button in the live region instead', () => {
    const { viewModel, service } = setup();
    viewModel.open();
    service.cycleFilter.mockReturnValue(view([row('Tim')], { summary: 'Group 2: 1 of 25 nodes, Name, A to Z' }));

    viewModel.cycleFilter(1, 'button');

    expect(viewModel.state.announceSummary).toBe(false);
    expect(viewModel.state.message?.text).toBe('Group 2: 1 of 25 nodes, Name, A to Z');
  });

  test('should say when there is no other order or filter', () => {
    const { viewModel, service } = setup();
    viewModel.open();
    service.cycleSort.mockReturnValue(null);
    service.cycleFilter.mockReturnValue(null);

    viewModel.cycleSort(1);
    expect(viewModel.state.message?.text).toBe('This list has one order');
    viewModel.cycleFilter(-1);
    expect(viewModel.state.message?.text).toBe('This list has no filters');
  });

  test('should clear the list when disposed, without touching the scope', () => {
    const { viewModel, service } = setup();
    viewModel.open();

    viewModel.dispose();

    expect(viewModel.state.rows).toEqual([]);
    expect(viewModel.state.visible).toBe(false);
    expect(service.close).not.toHaveBeenCalled();
  });
});
