import type { SelectionBridge } from '@adapters/tableau/selection';
import type {
  TableauRangeValue,
  TableauSelectionCriteria,
  TableauWorksheet,
  WorksheetSnapshot,
} from '@adapters/tableau/types';
import type { FakeWorksheet } from './helpers';
import { extractTableau } from '@adapters/tableau/extractor';
import { applySelection, createSelectionGuard } from '@adapters/tableau/selection';
import { fakeColumn, fakeSnapshot, fakeWorksheet } from './helpers';

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
      // `(Consumer, West)` was never drawn; the extractor fills it with `y: 0`
      // so the segmented rows stay equal length, and gives it `null` criteria.
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
    it('should disable that layer permanently and warn exactly once', async () => {
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
  });
});
