import type { SelectionBridge } from '@adapters/tableau/selection';
import type {
  TableauRangeValue,
  TableauSelectionCriteria,
  TableauWorksheet,
  WorksheetSnapshot,
} from '@adapters/tableau/types';
import type { NavigationTarget } from '@type/grammar';
import type { FakeWorksheet } from './helpers';
import { extractTableau } from '@adapters/tableau/extractor';
import {
  applySelection,
  clearOwnedSelections,
  createSelectionGuard,
  handleMarkSelection,
  positionOfMarks,
} from '@adapters/tableau/selection';
import { TraceType } from '@type/grammar';
import { fakeColumn, fakeMarks, fakeMarkSelection, fakeSnapshot, fakeWorksheet } from './helpers';

/**
 * The Tableau selection bridge: MAIDR's cursor mirrored into the viz.
 *
 * An embedded viz gives the adapter no DOM to highlight — the marks are inside
 * Tableau's iframe — so the only visual feedback channel is Tableau's own mark
 * selection. Everything here is therefore about *addressing*: whether a
 * navigation position names marks exactly, and what happens when it does not.
 *
 * The index is never hand-written. Every case runs the real extractor over a
 * worksheet snapshot and drives {@link applySelection} with the result, because
 * the interesting failures are disagreements between the two — a cell index
 * that addresses the wrong row, or a filler cell the extractor invented and the
 * bridge then tries to select.
 */

const REGION = fakeColumn('Region', 'string', 0);
const SEGMENT = fakeColumn('Segment', 'string', 1);
const SALES = fakeColumn('SUM(Sales)', 'float', 2);

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

/** A worksheet snapshot plus the fake worksheet a selection is applied to. */
interface Bound {
  readonly bridge: SelectionBridge;
  readonly worksheet: FakeWorksheet;
}

/**
 * Extract a snapshot and wire its selection index to a recording worksheet.
 *
 * @param snapshot - The worksheet snapshot to extract.
 * @param config - How the worksheet misbehaves.
 * @param config.failSelect - Whether `selectMarksByValueAsync` should reject.
 * @returns The bridge {@link applySelection} takes, and the worksheet it drives.
 */
function bind(
  snapshot: WorksheetSnapshot,
  config: { failSelect?: boolean } = {},
): Bound {
  const worksheet = fakeWorksheet({
    name: snapshot.name,
    columns: snapshot.columns,
    rows: [],
    ...config,
  });

  const { selection } = extractTableau([snapshot]);
  const worksheets = new Map<string, TableauWorksheet>();
  for (const layerId of selection.worksheets.keys()) {
    worksheets.set(layerId, worksheet);
  }

  return {
    bridge: {
      index: selection,
      worksheets,
      guard: createSelectionGuard(),
      disabled: new Set<string>(),
      owned: new Set<string>(),
      issued: [],
    },
    worksheet,
  };
}

/**
 * Read a criterion's value as a range.
 *
 * `SelectionCriteria.value` is a union, so a test that means to assert on the
 * documented single-date form has to narrow first rather than cast.
 *
 * @param criterion - The criterion to read.
 * @returns Its range value.
 * @throws When the criterion carries a string or a list instead.
 */
function asRange(criterion: TableauSelectionCriteria): TableauRangeValue {
  const { value } = criterion;
  if (typeof value === 'string' || Array.isArray(value)) {
    throw new TypeError(`expected a range, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Two dimensions and a measure: the grouped-bar reading of a worksheet. */
function groupedSnapshot(
  rows: readonly (readonly (string | number)[])[],
): WorksheetSnapshot {
  return fakeSnapshot({
    name: 'Sales by Region',
    columns: [REGION, SEGMENT, SALES],
    rows,
  });
}

/**
 * A point cloud: two measures, and dimensions that are distinct per row.
 *
 * @param dimensions - The detail dimensions, in view order.
 * @param rows - Eight rows, in view order.
 * @returns The snapshot.
 */
function cloudSnapshot(
  dimensions: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): WorksheetSnapshot {
  return fakeSnapshot({
    name: 'Customers',
    columns: [
      ...dimensions.map((name, index) => fakeColumn(name, 'string', index)),
      fakeColumn('SUM(Sales)', 'float', dimensions.length),
      fakeColumn('SUM(Profit)', 'float', dimensions.length + 1),
    ],
    rows,
  });
}

describe('tableau selection bridge', () => {
  beforeEach(() => {
    warn.mockClear();
  });

  afterAll(() => {
    warn.mockRestore();
  });

  describe('addressing a cell', () => {
    it('should address a grouped cell by both of its dimensions', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot([
        ['East', 'Consumer', 10],
        ['East', 'Corporate', 20],
        ['West', 'Consumer', 30],
        ['West', 'Corporate', 40],
      ]));

      // Row 1 is the second group (`Corporate`), column 1 the second category
      // (`West`) — the cell holding 40.
      await applySelection(bridge, { layerId: '0', row: 1, col: 1 });

      expect(worksheet.calls.selections).toEqual([{
        criteria: [
          { fieldName: 'Region', value: 'West' },
          { fieldName: 'Segment', value: 'Corporate' },
        ],
        updateType: 'select-replace',
      }]);
    });

    it('should spell the criterion key `value`, singular, on every clause', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot([
        ['East', 'Consumer', 10],
        ['East', 'Corporate', 20],
        ['West', 'Consumer', 30],
        ['West', 'Corporate', 40],
      ]));

      await applySelection(bridge, { layerId: '0', row: 0, col: 0 });

      // `values` would be silently ignored by Tableau and select nothing, so
      // the key itself is asserted rather than only the criteria's contents.
      const [call] = worksheet.calls.selections;
      expect(call.criteria.map(criterion => Object.keys(criterion).sort()))
        .toEqual([['fieldName', 'value'], ['fieldName', 'value']]);
    });

    it('should address a date dimension as a range whose ends are the same day', async () => {
      const march = new Date('2021-03-01T00:00:00.000Z');
      const april = new Date('2021-04-01T00:00:00.000Z');
      const { bridge, worksheet } = bind(fakeSnapshot({
        name: 'Sales over time',
        columns: [fakeColumn('Order Date', 'date-time', 0), SALES],
        rows: [[march, 10], [april, 20]],
      }));

      // A temporal category is read as a line, so the cells are
      // `[series][sample]` and column 1 is April.
      await applySelection(bridge, { layerId: '0', row: 0, col: 1 });

      const [call] = worksheet.calls.selections;
      expect(call.criteria).toHaveLength(1);
      expect(call.criteria[0].fieldName).toBe('Order Date');
      const range = asRange(call.criteria[0]);
      expect(range.min).toBe(april);
      expect(range.max).toBe(april);
    });

    it('should clear rather than select a rectangularized filler cell', async () => {
      // `(Consumer, West)` was never drawn; the extractor pads it with a gap so
      // the segmented rows stay equal length, and gives it `null` criteria —
      // the pad is scaffolding, and selecting a mark nobody drew is worse than
      // selecting nothing.
      const { bridge, worksheet } = bind(groupedSnapshot([
        ['East', 'Consumer', 10],
        ['West', 'Corporate', 40],
      ]));

      await applySelection(bridge, { layerId: '0', row: 0, col: 1 });

      expect(worksheet.calls.selections).toHaveLength(0);
      expect(worksheet.calls.clears).toBe(1);
    });
  });

  describe('addressing a set of points', () => {
    const CUSTOMERS = Array.from({ length: 8 }, (_, index) => index);

    it('should select the single point a highlight covers', async () => {
      const { bridge, worksheet } = bind(cloudSnapshot(
        ['Customer'],
        CUSTOMERS.map(index => [`C${index}`, index * 10, index]),
      ));

      // `pointIndices` means `row` and `col` name no position and are `-1`.
      await applySelection(bridge, {
        layerId: '0',
        row: -1,
        col: -1,
        pointIndices: [3],
      });

      expect(worksheet.calls.selections).toEqual([{
        criteria: [{ fieldName: 'Customer', value: 'C3' }],
        updateType: 'select-replace',
      }]);
    });

    it('should merge points differing in one field into one array-valued clause', async () => {
      const { bridge, worksheet } = bind(cloudSnapshot(
        ['Customer'],
        CUSTOMERS.map(index => [`C${index}`, index * 10, index]),
      ));

      await applySelection(bridge, {
        layerId: '0',
        row: -1,
        col: -1,
        pointIndices: [3, 7],
      });

      // One clause, not two: `[{Customer: 'C3'}, {Customer: 'C7'}]` would be
      // read as a cross product and select nothing.
      expect(worksheet.calls.selections).toEqual([{
        criteria: [{ fieldName: 'Customer', value: ['C3', 'C7'] }],
        updateType: 'select-replace',
      }]);
    });

    it('should clear rather than over-select points differing in two fields', async () => {
      const { bridge, worksheet } = bind(cloudSnapshot(
        ['Customer', 'Territory'],
        CUSTOMERS.map(index => [`C${index}`, `T${index}`, index * 10, index]),
      ));

      await applySelection(bridge, {
        layerId: '0',
        row: -1,
        col: -1,
        pointIndices: [3, 7],
      });

      // `{Customer: [C3, C7]}` and `{Territory: [T3, T7]}` together select the
      // four-way cross product — two marks the reader is not on.
      expect(worksheet.calls.selections).toHaveLength(0);
      expect(worksheet.calls.clears).toBe(1);
    });
  });

  describe('when tableau refuses the selection', () => {
    it('should disable that worksheet permanently and warn exactly once', async () => {
      const { bridge, worksheet } = bind(
        groupedSnapshot([
          ['East', 'Consumer', 10],
          ['East', 'Corporate', 20],
          ['West', 'Consumer', 30],
          ['West', 'Corporate', 40],
        ]),
        { failSelect: true },
      );

      await applySelection(bridge, { layerId: '0', row: 0, col: 0 });

      expect(worksheet.calls.selections).toHaveLength(1);
      expect(worksheet.calls.clears).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('mark selection is now disabled');

      await applySelection(bridge, { layerId: '0', row: 1, col: 1 });

      // A rejected field name is wrong on every arrow key, so the second
      // navigation must not retry it — nor log a second time.
      expect(worksheet.calls.selections).toHaveLength(1);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('should follow the worksheet that refused, not the layer id it sat at', async () => {
      const rows = [
        ['East', 'Consumer', 10],
        ['East', 'Corporate', 20],
        ['West', 'Consumer', 30],
        ['West', 'Corporate', 40],
      ];
      const columns = [REGION, SEGMENT, SALES];
      const refused = fakeWorksheet({
        name: 'Sales by Region',
        columns,
        rows: [],
        failSelect: true,
      });
      const willing = fakeWorksheet({ name: 'Profit by Region', columns, rows: [] });
      // Two layers, so both `'0'` and `'1'` address a real cell and a latch can
      // be asked which of the two it followed.
      const { selection } = extractTableau([
        fakeSnapshot({ name: refused.name, columns, rows }),
        fakeSnapshot({ name: willing.name, columns, rows }),
      ]);
      // Shared across the bridges, as the binder shares one set across every
      // refresh: a worksheet that rejects once rejects on every later read of
      // the same fields.
      const disabled = new Set<string>();
      const guard = createSelectionGuard();
      const bridgeOver = (
        layers: Record<string, TableauWorksheet>,
      ): SelectionBridge => ({
        index: selection,
        worksheets: new Map(Object.entries(layers)),
        guard,
        disabled,
        owned: new Set<string>(),
        issued: [],
      });

      await applySelection(
        bridgeOver({ 0: refused, 1: willing }),
        { layerId: '0', row: 0, col: 0 },
      );

      expect(refused.calls.selections).toHaveLength(1);
      expect(warn.mock.calls[0][0]).toContain('"Sales by Region"');

      // A refresh that drops a worksheet renumbers every layer after it, so the
      // id the rejection happened at now belongs to a worksheet that never
      // refused anything. Latching by position would silence it.
      await applySelection(bridgeOver({ 0: willing }), { layerId: '0', row: 0, col: 0 });

      expect(willing.calls.selections).toHaveLength(1);

      // And the worksheet that did refuse stays disabled wherever it lands.
      await applySelection(
        bridgeOver({ 0: willing, 1: refused }),
        { layerId: '1', row: 1, col: 1 },
      );

      expect(refused.calls.selections).toHaveLength(1);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * The cell of layer `'0'` whose criteria carry exactly these values, found by
 * walking the index rather than assumed, so a test asserts what the reverse
 * lookup found against what the forward index recorded.
 *
 * @param bridge - The bridge whose index to walk.
 * @param values - The criteria values, in field order.
 * @returns The cell as a navigation target.
 * @throws When no cell carries them.
 */
function cellWith(
  bridge: SelectionBridge,
  values: readonly string[],
): { layerId: string; row: number; col: number } {
  const cells = bridge.index.cells.get('0') ?? [];
  for (let row = 0; row < cells.length; row++) {
    for (let col = 0; col < cells[row].length; col++) {
      const criteria = cells[row][col];
      if (criteria !== null && criteria.every((criterion, i) => criterion.value === values[i])) {
        return { layerId: '0', row, col };
      }
    }
  }
  throw new Error(`no cell carries ${values.join(', ')}`);
}

describe('tableau selection bridge, the other way', () => {
  const GROUPED_COLUMNS = [REGION, SEGMENT, SALES];
  const GROUPED_ROWS = [
    ['East', 'Consumer', 10],
    ['East', 'Corporate', 20],
    ['West', 'Consumer', 30],
    ['West', 'Corporate', 40],
  ];
  const CLOUD_COLUMNS = [
    fakeColumn('Customer', 'string', 0),
    fakeColumn('SUM(Sales)', 'float', 1),
    fakeColumn('SUM(Profit)', 'float', 2),
  ];

  // The forward bridge's spy is restored when its own block ends, so this
  // block watches the console itself.
  let warned: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    warned = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warned.mockRestore();
  });

  describe('resolving selected marks to the position they were read from', () => {
    it('should find the cell a grouped mark came from, by field name not column position', () => {
      const { bridge } = bind(groupedSnapshot(GROUPED_ROWS));

      const marks = fakeMarks(GROUPED_COLUMNS, [['West', 'Corporate', 40]]);

      expect(positionOfMarks(bridge.index, marks, 'Sales by Region'))
        .toEqual(cellWith(bridge, ['West', 'Corporate']));
    });

    it('should resolve against every layer when the event names no worksheet', () => {
      const { bridge } = bind(groupedSnapshot(GROUPED_ROWS));

      const marks = fakeMarks(GROUPED_COLUMNS, [['East', 'Corporate', 20]]);

      expect(positionOfMarks(bridge.index, marks, null))
        .toEqual(cellWith(bridge, ['East', 'Corporate']));
    });

    it('should find nothing in a worksheet the layer was not read from', () => {
      const { bridge } = bind(groupedSnapshot(GROUPED_ROWS));

      const marks = fakeMarks(GROUPED_COLUMNS, [['East', 'Corporate', 20]]);

      expect(positionOfMarks(bridge.index, marks, 'Another Sheet')).toBeNull();
    });

    it('should find nothing when the marks table lacks a field the index addresses by', () => {
      const { bridge } = bind(groupedSnapshot(GROUPED_ROWS));

      // Region only: a partial address would match a whole band of cells.
      const marks = fakeMarks([REGION, SALES], [['East', 10]]);

      expect(positionOfMarks(bridge.index, marks, 'Sales by Region')).toBeNull();
    });

    it('should find nothing for a value no cell carries', () => {
      const { bridge } = bind(groupedSnapshot(GROUPED_ROWS));

      const marks = fakeMarks(GROUPED_COLUMNS, [['North', 'Consumer', 50]]);

      expect(positionOfMarks(bridge.index, marks, 'Sales by Region')).toBeNull();
    });

    it('should find nothing when nothing is selected', () => {
      const { bridge } = bind(groupedSnapshot(GROUPED_ROWS));

      expect(positionOfMarks(bridge.index, fakeMarks(GROUPED_COLUMNS, []), 'Sales by Region'))
        .toBeNull();
      expect(positionOfMarks(bridge.index, { data: [] }, 'Sales by Region')).toBeNull();
    });

    it('should resolve a point of a cloud to its data index', () => {
      const { bridge } = bind(cloudSnapshot(
        ['Customer'],
        Array.from({ length: 8 }, (_, index) => [`C${index}`, index * 10, index]),
      ));

      const marks = fakeMarks(CLOUD_COLUMNS, [['C5', 50, 5]]);

      expect(positionOfMarks(bridge.index, marks, 'Customers'))
        .toEqual({ layerId: '0', pointIndex: 5 });
    });

    it('should refuse a mark whose address two points share', () => {
      // Two rows with the same detail value. The heuristics would not read
      // this as a point cloud on their own -- a detail dimension is distinct
      // per row -- so the page has declared it one, which is exactly how an
      // ambiguous address comes to exist. The index can name either point, so
      // the lookup names neither rather than picking one.
      const { selection } = extractTableau(
        [cloudSnapshot(['Customer'], [['C0', 0, 0], ['C1', 10, 1], ['C1', 20, 2], ['C3', 30, 3]])],
        { overrides: { Customers: { traceType: TraceType.SCATTER } } },
      );

      expect(positionOfMarks(selection, fakeMarks(CLOUD_COLUMNS, [['C1', 10, 1]]), 'Customers'))
        .toBeNull();
      // An unambiguous neighbour still resolves.
      expect(positionOfMarks(selection, fakeMarks(CLOUD_COLUMNS, [['C3', 30, 3]]), 'Customers'))
        .toEqual({ layerId: '0', pointIndex: 3 });
    });

    it('should refuse a selection that spans several positions, and accept one repeated', () => {
      const { bridge } = bind(groupedSnapshot(GROUPED_ROWS));

      expect(positionOfMarks(bridge.index, fakeMarks(GROUPED_COLUMNS, [
        ['East', 'Consumer', 10],
        ['West', 'Corporate', 40],
      ]), 'Sales by Region')).toBeNull();

      expect(positionOfMarks(bridge.index, fakeMarks(GROUPED_COLUMNS, [
        ['West', 'Corporate', 40],
        ['West', 'Corporate', 40],
      ]), 'Sales by Region')).toEqual(cellWith(bridge, ['West', 'Corporate']));
    });

    it('should match a date dimension by the day, as the index addresses it', () => {
      const ORDER_DATE = fakeColumn('Order Date', 'date', 0);
      const day = new Date(Date.UTC(2024, 0, 15));
      const { bridge } = bind(fakeSnapshot({
        name: 'Sales by Day',
        columns: [ORDER_DATE, SALES],
        rows: [[new Date(Date.UTC(2024, 0, 14)), 10], [day, 20]],
      }));

      // A fresh Date with the same instant: two reads of one cell are two
      // objects, and the match has to be by value.
      const marks = fakeMarks([ORDER_DATE, SALES], [[new Date(day.getTime()), 20]]);

      expect(positionOfMarks(bridge.index, marks, 'Sales by Day')).toEqual({ layerId: '0', row: 0, col: 1 });
    });
  });

  describe('following a change of selection', () => {
    /**
     * A navigator that records what it was asked.
     * @returns The navigator and its calls.
     */
    function recorder(): { navigate: (target: NavigationTarget | null) => boolean; targets: (NavigationTarget | null)[] } {
      const targets: (NavigationTarget | null)[] = [];
      return {
        navigate: (target: NavigationTarget | null): boolean => {
          targets.push(target);
          return true;
        },
        targets,
      };
    }

    it('should move the cursor to the mark a user clicked and release the worksheet', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      const { navigate, targets } = recorder();
      await applySelection(bridge, cellWith(bridge, ['East', 'Consumer']));
      expect(bridge.owned.has(worksheet.name)).toBe(true);

      const outcome = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, fakeMarks(GROUPED_COLUMNS, [['West', 'Corporate', 40]])),
        navigate,
      );

      expect(outcome).toBe('navigated');
      expect(targets).toEqual([cellWith(bridge, ['West', 'Corporate'])]);
      // The click replaced MAIDR's selection: leaving the figure must not
      // clear the mark the reader is about to be taken to.
      expect(bridge.owned.has(worksheet.name)).toBe(false);
    });

    it('should ignore the echo of its own selection, however late it arrives', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      const { navigate, targets } = recorder();
      const first = cellWith(bridge, ['East', 'Consumer']);
      const second = cellWith(bridge, ['West', 'Corporate']);
      await applySelection(bridge, first);
      await applySelection(bridge, second);
      // Both calls have settled and the guard's flag is down, so only the
      // record of what was issued can tell these from a user's clicks.
      await new Promise<void>(resolve => queueMicrotask(resolve));
      expect(bridge.guard.programmatic).toBe(false);

      const late = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, fakeMarks(GROUPED_COLUMNS, [['East', 'Consumer', 10]])),
        navigate,
      );
      const current = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, fakeMarks(GROUPED_COLUMNS, [['West', 'Corporate', 40]])),
        navigate,
      );

      expect([late, current]).toEqual(['echo', 'echo']);
      expect(targets).toEqual([]);
      expect(bridge.owned.has(worksheet.name)).toBe(true);
    });

    it('should take a repeat of an echoed mark as the click it is', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      const { navigate, targets } = recorder();
      const cell = cellWith(bridge, ['East', 'Consumer']);
      await applySelection(bridge, cell);
      const marks = fakeMarks(GROUPED_COLUMNS, [['East', 'Consumer', 10]]);

      await handleMarkSelection(bridge, fakeMarkSelection(worksheet, marks), navigate);
      const again = await handleMarkSelection(bridge, fakeMarkSelection(worksheet, marks), navigate);

      // One selection, one echo: the second event answers nothing MAIDR did.
      expect(again).toBe('navigated');
      expect(targets).toEqual([cell]);
    });

    it('should read a selection while its own call is still in flight as an echo', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      const { navigate, targets } = recorder();
      bridge.guard.programmatic = true;

      const outcome = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, fakeMarks(GROUPED_COLUMNS, [['West', 'Corporate', 40]])),
        navigate,
      );

      expect(outcome).toBe('echo');
      expect(targets).toEqual([]);
    });

    it('should withdraw a kept target when a user deselects everything', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      const { navigate, targets } = recorder();
      bridge.owned.add(worksheet.name);

      const outcome = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, fakeMarks(GROUPED_COLUMNS, [])),
        navigate,
      );

      expect(outcome).toBe('cleared');
      expect(targets).toEqual([null]);
      expect(bridge.owned.has(worksheet.name)).toBe(false);
    });

    it('should ignore the echo of its own clear', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      const { navigate, targets } = recorder();
      await applySelection(bridge, cellWith(bridge, ['East', 'Consumer']));
      await clearOwnedSelections(bridge);
      expect(worksheet.calls.clears).toBe(1);

      const outcome = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, fakeMarks(GROUPED_COLUMNS, [])),
        navigate,
      );

      expect(outcome).toBe('echo');
      expect(targets).toEqual([]);
    });

    it('should withdraw a kept target when a user selects marks no position names', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      const { navigate, targets } = recorder();

      const outcome = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, fakeMarks(GROUPED_COLUMNS, [
          ['East', 'Consumer', 10],
          ['West', 'Corporate', 40],
        ])),
        navigate,
      );

      expect(outcome).toBe('unresolved');
      expect(targets).toEqual([null]);
    });

    it('should report a chart that would not take the position', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));

      const outcome = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, fakeMarks(GROUPED_COLUMNS, [['West', 'Corporate', 40]])),
        () => false,
      );

      expect(outcome).toBe('refused');
    });

    it('should leave the cursor alone, with one warning, when the marks cannot be read', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      const { navigate, targets } = recorder();

      const outcome = await handleMarkSelection(
        bridge,
        fakeMarkSelection(worksheet, new Error('getMarksAsync failed')),
        navigate,
      );

      expect(outcome).toBe('refused');
      expect(targets).toEqual([]);
      expect(warned).toHaveBeenCalledTimes(1);
      expect(warned.mock.calls[0][0]).toContain('could not read the marks');
    });
  });

  describe('clearing only what MAIDR holds', () => {
    it('should clear a worksheet MAIDR selected in and skip one a user took over', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot(GROUPED_ROWS));
      await applySelection(bridge, cellWith(bridge, ['East', 'Consumer']));
      expect(bridge.owned.has(worksheet.name)).toBe(true);

      await clearOwnedSelections(bridge);
      expect(worksheet.calls.clears).toBe(1);
      expect(bridge.owned.size).toBe(0);

      // Nothing held: nothing to clear.
      await clearOwnedSelections(bridge);
      expect(worksheet.calls.clears).toBe(1);
    });

    it('should stop holding a worksheet whose selection it cleared for an unaddressable cell', async () => {
      const { bridge, worksheet } = bind(groupedSnapshot([
        ['East', 'Consumer', 10],
        ['East', 'Corporate', 20],
        ['West', 'Consumer', 30],
      ]));
      await applySelection(bridge, cellWith(bridge, ['East', 'Consumer']));
      expect(bridge.owned.has(worksheet.name)).toBe(true);

      // The rectangularized filler cell for West/Corporate clears instead.
      const cells = bridge.index.cells.get('0') ?? [];
      const filler = cells.flatMap((row, r) => row.map((criteria, c) => ({ criteria, r, c })))
        .find(cell => cell.criteria === null);
      if (filler === undefined) {
        throw new Error('expected a filler cell');
      }
      await applySelection(bridge, { layerId: '0', row: filler.r, col: filler.c });

      expect(worksheet.calls.clears).toBe(1);
      expect(bridge.owned.has(worksheet.name)).toBe(false);
    });
  });
});
