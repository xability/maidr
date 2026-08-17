/**
 * Duck-typed Tableau fakes shared by the Tableau adapter tests.
 *
 * The adapter takes no dependency on any `@tableau/*` package — every Tableau
 * object it touches is described by a structural interface in
 * `src/adapters/tableau/types.ts` — so a plain object satisfies it and no
 * network, no live viz and no vendor bundle are needed here.
 *
 * The factories deliberately reproduce the traps the real API sets, because a
 * fake that is tidier than the thing it stands in for proves nothing:
 *
 * - {@link fakeDataTable} sorts its columns **alphabetically**, exactly as a
 *   real `DataTableReader` does, while {@link fakeWorksheet} keeps
 *   `getSummaryColumnsInfoAsync` in view order. A test that writes its columns
 *   so that the two orders differ, and reads its rows back in view order, is
 *   therefore proving the view↔alphabetical remap works rather than assuming it
 *   away — a fixture whose names happen to be alphabetical already proves
 *   nothing, since the remap is then the identity.
 * - {@link fakeWorksheet} counts the readers it opens and the releases it is
 *   given and records the order of every call in a shared log, so a leaked
 *   reader or a read that started before the previous one finished is a failed
 *   assertion rather than an invisible bug.
 * - {@link fakeViz} exposes `workbook` as an accessor that **throws** until the
 *   viz is interactive, rather than leaving the property undefined, because
 *   that is what the real custom element does and it is the difference between
 *   waiting for `firstinteractive` and appearing to be ready.
 *
 * Not a test file: jest's `*.test.ts` glob does not match this name.
 */

import type {
  TableauColumn,
  TableauDashboard,
  TableauDataTable,
  TableauDataTableReader,
  TableauDataType,
  TableauDataValue,
  TableauEncoding,
  TableauEncodingType,
  TableauFieldInstance,
  TableauGetSummaryDataOptions,
  TableauMarksSpecification,
  TableauMarkType,
  TableauRow,
  TableauSelectionCriteria,
  TableauSheet,
  TableauVisualSpecification,
  TableauViz,
  TableauWorkbook,
  TableauWorksheet,
  WorksheetSnapshot,
} from '@adapters/tableau/types';

/**
 * A cell as a test writes it.
 *
 * Either a ready-made {@link TableauDataValue} — for the cases where the
 * formatted text has to differ from the native value — or the native value on
 * its own, which {@link fakeValue} wraps.
 */
export type FakeCell = TableauDataValue | string | number | boolean | Date | null;

/** One recorded `selectMarksByValueAsync` call. */
export interface FakeSelectionCall {
  readonly criteria: readonly TableauSelectionCriteria[];
  readonly updateType: string;
}

/** One recorded `getSummaryDataReaderAsync` call, arguments verbatim. */
export interface FakeReaderCall {
  readonly pageRowCount: number | undefined;
  readonly options: TableauGetSummaryDataOptions | undefined;
}

/** Everything a {@link FakeWorksheet} records about how it was used. */
export interface FakeWorksheetCalls {
  /**
   * Ordered log of every Tableau call, as `verb:worksheet[:detail]`.
   *
   * Shared between fakes when they are given the same array, which is how a
   * test proves that one worksheet's reader was released before the next one
   * was opened.
   */
  readonly log: string[];
  /** Arguments of every `getSummaryDataReaderAsync` call, in order. */
  readonly readers: FakeReaderCall[];
  /** Every `selectMarksByValueAsync` call, in order. */
  readonly selections: FakeSelectionCall[];
  /** How many readers were released. */
  releases: number;
  /** How many `clearSelectedMarksAsync` calls were made. */
  clears: number;
}

/** A worksheet fake, plus the record of how the adapter drove it. */
export interface FakeWorksheet extends TableauWorksheet {
  readonly calls: FakeWorksheetCalls;
}

/**
 * Build one field of a visual specification.
 *
 * A `FieldInstance` is `FieldBase`'s twelve members plus `fieldId`, and **not
 * one of the thirteen is optional**. `description` and `dataType` are required
 * keys whose value may be `undefined`, which is a different object from one
 * where the key is absent — so they are written out here rather than left off.
 * A field a test builds is therefore the shape Tableau really sends, and a
 * member added to the mirror later fails to compile here instead of silently
 * making every fixture a subset.
 *
 * The defaults describe a plain discrete string dimension, which is what a
 * field on Color or on a shelf usually is; pass `overrides` for a measure.
 *
 * @param name - The field's caption, e.g. `Region`.
 * @param overrides - Any member to set differently, e.g.
 * `{ role: 'measure', aggregation: 'sum', columnType: 'continuous' }`.
 * @returns The field.
 */
export function fakeField(
  name: string,
  overrides: Partial<TableauFieldInstance> = {},
): TableauFieldInstance {
  return {
    name,
    description: undefined,
    dataType: 'string',
    role: 'dimension',
    aggregation: 'none',
    columnType: 'discrete',
    isCalculatedField: false,
    isCombinedField: false,
    isGenerated: false,
    isGeospatial: false,
    isHidden: false,
    isPresentOnPublishedDatasource: true,
    fieldId: `[${name}]`,
    ...overrides,
  };
}

/**
 * Put one field on one encoding of a marks card.
 *
 * `Encoding.id` is documented as "inbuilt encoding type or the custom
 * encoding", so it defaults to the encoding type's own value and only differs
 * for `type: 'custom'`. `fieldEncodingId` exists to tell two copies of the same
 * field on one encoding apart, so it is derived from both.
 *
 * @param type - The encoding the field sits on, e.g. `color`.
 * @param field - The field, most easily built with {@link fakeField}.
 * @param overrides - `id` or `fieldEncodingId`, when the test cares.
 * @returns The encoding.
 */
export function fakeEncoding(
  type: TableauEncodingType,
  field: TableauFieldInstance,
  overrides: Partial<TableauEncoding> = {},
): TableauEncoding {
  return {
    id: type,
    fieldEncodingId: `${type}:${field.fieldId}`,
    type,
    field,
    ...overrides,
  };
}

/**
 * Build one marks card.
 *
 * `primitiveType` is taken as a plain `string` rather than a
 * {@link TableauMarkType} on purpose: one of the cases worth covering is a mark
 * type this version of the enum does not declare, because the host page loads
 * its own Embedding build and the extractor is meant to survive a later one.
 *
 * @param primitiveType - What the card drew, as Tableau spells it.
 * @param encodings - The fields on the card's encodings. Empty by default,
 * which is what a card with nothing but a measure on Rows looks like.
 * @returns The marks card.
 */
export function fakeMarksCard(
  primitiveType: string,
  encodings: readonly TableauEncoding[] = [],
): TableauMarksSpecification {
  return { primitiveType: primitiveType as TableauMarkType, encodings };
}

/** The shelves of a {@link fakeVisualSpec}, both empty unless a test says so. */
export interface FakeShelves {
  /** Fields on the Rows shelf, in shelf order. */
  rowFields?: readonly TableauFieldInstance[];
  /** Fields on the Columns shelf, in shelf order. */
  columnFields?: readonly TableauFieldInstance[];
}

/**
 * Build a visual specification, filling in the members a test says nothing
 * about.
 *
 * `VisualSpecification` requires `rowFields`, `columnFields`,
 * `activeMarksSpecificationIndex` and `marksSpecifications`, and
 * `MarksSpecification` requires `encodings` alongside `primitiveType`: not one
 * member of either is optional in the shipped declarations. A test about
 * mark-type classification still only wants to say *these marks*, so the rest
 * is filled in here rather than by pretending the payload is smaller than it
 * is — a fake that is smaller than the real thing would let a reader of the
 * extractor believe data is missing that Tableau in fact sends.
 *
 * @param marks - One card per marks card, in payload order. A bare string is
 * shorthand for {@link fakeMarksCard} with no encodings; pass a card to attach
 * them.
 * @param activeIndex - `activeMarksSpecificationIndex`. Defaults to the first
 * card; pass an out-of-range value to exercise the extractor's range check.
 * @param shelves - The Rows and Columns shelves, when the test populates them.
 * @returns The specification.
 */
export function fakeVisualSpec(
  marks: readonly (string | TableauMarksSpecification)[],
  activeIndex = 0,
  shelves: FakeShelves = {},
): TableauVisualSpecification {
  return {
    rowFields: shelves.rowFields ?? [],
    columnFields: shelves.columnFields ?? [],
    activeMarksSpecificationIndex: activeIndex,
    marksSpecifications: marks.map(mark =>
      typeof mark === 'string' ? fakeMarksCard(mark) : mark,
    ),
  };
}

/** How a {@link fakeWorksheet} behaves, including how it fails. */
export interface FakeWorksheetConfig {
  /** Worksheet name; also the label used in {@link FakeWorksheetCalls.log}. */
  name?: string;
  /** Columns in **view order**, as `getSummaryColumnsInfoAsync` returns them. */
  columns: readonly TableauColumn[];
  /**
   * Rows in view order; the reader serves them alphabetically remapped.
   *
   * Read when a reader is *opened*, not when the worksheet is built, exactly as
   * a real one snapshots the view at that moment. A test that keeps a mutable
   * reference to this array can therefore change what the next read returns,
   * which is how a filter change is expressed here.
   */
  rows: readonly (readonly FakeCell[])[];
  /**
   * The visual specification to report, most easily built with
   * {@link fakeVisualSpec}. When omitted the worksheet has **no**
   * `getVisualSpecificationAsync` at all — which is not what the declarations
   * describe, and is exactly what an Embedding build older than the method
   * looks like on a host page.
   */
  spec?: TableauVisualSpecification;
  /** Rows per page. Defaults to every row on a single page. */
  pageSize?: number;
  /** A shared call log, so several fakes record into one ordering. */
  log?: string[];
  /** Reject `getPageAsync` for this page index. */
  failPage?: number;
  /** What {@link failPage} rejects with. */
  pageError?: unknown;
  /** Reject `releaseAsync`. */
  failRelease?: boolean;
  /** Reject `selectMarksByValueAsync`. */
  failSelect?: boolean;
  /** What {@link failSelect} rejects with. */
  selectError?: unknown;
  /** Reject `clearSelectedMarksAsync`. */
  failClear?: boolean;
  /**
   * Declare `getVisualSpecificationAsync` and have it reject with this, which
   * is the "the host has the method but the call failed" path.
   */
  specError?: unknown;
  /**
   * Awaited inside `getPageAsync` for page 0, so a test can hold a reader open
   * while it starts a second read and observe whether the two overlap.
   */
  holdFirstPage?: Promise<unknown>;
}

/**
 * Build one summary column.
 *
 * @param fieldName - Display name including any aggregation wrapper, e.g.
 * `SUM(Sales)`. This is also what selection criteria are addressed by.
 * @param dataType - The Tableau `DataType` *value*, e.g. `float`.
 * @param index - The column's position in the table it came from.
 * @param overrides - Anything else to set, such as `isReferenced: false` or a
 * `fieldId` that differs from the name.
 * @returns The column.
 */
export function fakeColumn(
  fieldName: string,
  dataType: TableauDataType,
  index = 0,
  overrides: Partial<TableauColumn> = {},
): TableauColumn {
  return {
    fieldName,
    fieldId: `[${fieldName}]`,
    dataType,
    index,
    ...overrides,
  };
}

/**
 * Build one summary cell.
 *
 * `formattedValue` is omitted unless asked for, so the coercion helpers take
 * their documented fallback path (`String(nativeValue)`) by default and a test
 * that cares about the worksheet's own formatting has to say so.
 *
 * @param native - The native JS value, or `null` for one of Tableau's special
 * values.
 * @param formatted - The worksheet-formatted text, when it differs.
 * @returns The data value.
 */
export function fakeValue(native: unknown, formatted?: string): TableauDataValue {
  return {
    value: native,
    nativeValue: native,
    ...(formatted === undefined ? {} : { formattedValue: formatted }),
  };
}

/**
 * Wrap a cell written the short way.
 *
 * @param cell - A ready-made value, or the native value on its own.
 * @returns The data value.
 */
function toDataValue(cell: FakeCell): TableauDataValue {
  if (cell !== null && typeof cell === 'object' && !(cell instanceof Date)) {
    return cell;
  }
  return fakeValue(cell);
}

/**
 * Build a page of summary data with its columns **alphabetically sorted**.
 *
 * This is the whole point of the helper: `DataTableReader` offers no way to ask
 * for view order, so a fake that served view order would hide every remap bug
 * the adapter exists to avoid. `fieldId` is preserved across the sort — it is
 * what the index map matches on — while each column's `index` is re-stamped to
 * its position in *this* table, as a real one's is.
 *
 * @param viewColumns - Columns in view order.
 * @param rows - Rows in view order.
 * @returns The table, columns and cells both alphabetically ordered.
 */
export function fakeDataTable(
  viewColumns: readonly TableauColumn[],
  rows: readonly (readonly FakeCell[])[],
): TableauDataTable {
  const order = viewColumns
    .map((column, viewIndex) => ({ column, viewIndex }))
    .sort((a, b) => a.column.fieldName.localeCompare(b.column.fieldName));

  return {
    columns: order.map(({ column }, index) => ({ ...column, index })),
    data: rows.map(row => order.map(({ viewIndex }) => toDataValue(row[viewIndex]))),
    isSummaryData: true,
    totalRowCount: rows.length,
  };
}

/**
 * Split rows into pages the way a reader does.
 *
 * @param rows - Every row, in view order.
 * @param pageSize - Rows per page, or `undefined` for one page.
 * @returns The pages, in order. Empty when there are no rows, which is what a
 * real reader reports as `pageCount: 0`.
 */
function paginate(
  rows: readonly (readonly FakeCell[])[],
  pageSize: number | undefined,
): (readonly FakeCell[])[][] {
  if (rows.length === 0) {
    return [];
  }
  const size = pageSize === undefined ? rows.length : pageSize;
  const pages: (readonly FakeCell[])[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    pages.push(rows.slice(start, start + size));
  }
  return pages;
}

/**
 * Build a worksheet that records how it was used.
 *
 * @param config - What the worksheet holds and how it misbehaves.
 * @returns The worksheet, with its {@link FakeWorksheet.calls} record attached.
 */
export function fakeWorksheet(config: FakeWorksheetConfig): FakeWorksheet {
  const name = config.name ?? 'Sheet 1';
  const calls: FakeWorksheetCalls = {
    log: config.log ?? [],
    readers: [],
    selections: [],
    releases: 0,
    clears: 0,
  };
  // Paginated per reader rather than once per worksheet: the rows are whatever
  // `config.rows` holds when the reader is opened, so a test can change the
  // data between two reads the way a filter change does.
  const openReader = (): TableauDataTableReader => {
    const pages = paginate(config.rows, config.pageSize);
    return {
      pageCount: pages.length,
      totalRowCount: config.rows.length,
      getPageAsync: async (pageNumber: number): Promise<TableauDataTable> => {
        if (pageNumber === 0 && config.holdFirstPage !== undefined) {
          await config.holdFirstPage;
        }
        calls.log.push(`page:${name}:${pageNumber}`);
        if (pageNumber === config.failPage) {
          throw config.pageError ?? new Error(`page ${pageNumber} of "${name}" failed`);
        }
        return fakeDataTable(config.columns, pages[pageNumber] ?? []);
      },
      releaseAsync: async (): Promise<void> => {
        calls.releases++;
        calls.log.push(`release:${name}`);
        if (config.failRelease === true) {
          throw new Error(`release of "${name}" failed`);
        }
      },
    };
  };

  const worksheet: FakeWorksheet = {
    name,
    sheetType: 'worksheet',
    calls,
    getSummaryColumnsInfoAsync: async (): Promise<TableauColumn[]> => {
      calls.log.push(`columns:${name}`);
      return config.columns.map(column => ({ ...column }));
    },
    getSummaryDataReaderAsync: async (
      pageRowCount?: number,
      options?: TableauGetSummaryDataOptions,
    ): Promise<TableauDataTableReader> => {
      calls.readers.push({ pageRowCount, options });
      calls.log.push(`open:${name}`);
      return openReader();
    },
    selectMarksByValueAsync: async (
      selections: readonly TableauSelectionCriteria[],
      updateType: string,
    ): Promise<void> => {
      calls.selections.push({ criteria: selections, updateType });
      calls.log.push(`select:${name}`);
      if (config.failSelect === true) {
        throw config.selectError ?? new Error(`selection in "${name}" failed`);
      }
    },
    clearSelectedMarksAsync: async (): Promise<void> => {
      calls.clears++;
      calls.log.push(`clear:${name}`);
      if (config.failClear === true) {
        throw new Error(`clear of "${name}" failed`);
      }
    },
    getVisualSpecificationAsync: async (): Promise<TableauVisualSpecification> => {
      calls.log.push(`spec:${name}`);
      if (config.specError !== undefined) {
        throw config.specError;
      }
      return config.spec ?? fakeVisualSpec([]);
    },
  };

  // Removed unless the test asks for a specification. Every `Worksheet` the
  // declarations describe — Embedding and Extensions alike — has this method,
  // which is why {@link FakeWorksheet} declares it too; what it does *not*
  // describe is the host page, which loads whichever Embedding build it likes,
  // and a build older than the method has no such property at all. That is the
  // object `reader.ts` feature-detects, so a fake has to be able to be one.
  if (config.spec === undefined && config.specError === undefined) {
    delete (worksheet as Partial<FakeWorksheet>).getVisualSpecificationAsync;
  }

  return worksheet;
}

/** What one worksheet contributes, as a test writes it. */
export interface FakeSnapshotConfig {
  /** Worksheet name, which is also the key overrides are looked up by. */
  name?: string;
  /** Columns in view order. */
  columns: readonly TableauColumn[];
  /**
   * Rows in view order. A cell written as `undefined` stays `undefined`, which
   * models a view column with no counterpart in the data table.
   */
  rows: readonly (readonly (FakeCell | undefined)[])[];
  /** The visual specification, when the test exercises mark-type classification. */
  spec?: TableauVisualSpecification;
}

/**
 * Build the snapshot the pure half of the adapter consumes.
 *
 * `readWorksheet` produces these; the extractor only ever sees them, so its
 * tests skip the async half entirely and hand one over directly.
 *
 * @param config - What the worksheet holds.
 * @returns The snapshot, with every cell wrapped as a data value.
 */
export function fakeSnapshot(config: FakeSnapshotConfig): WorksheetSnapshot {
  const rows: TableauRow[] = config.rows.map(row =>
    row.map(cell => (cell === undefined ? undefined : toDataValue(cell))),
  );
  return {
    name: config.name ?? 'Sheet 1',
    columns: config.columns,
    rows,
    ...(config.spec === undefined ? {} : { spec: config.spec }),
  };
}

/**
 * Build a dashboard sheet over a set of worksheets, in add-order.
 *
 * @param worksheets - The worksheets, in the order the author added them.
 * @param name - The dashboard's name.
 * @returns The dashboard.
 */
export function fakeDashboard(
  worksheets: readonly TableauWorksheet[],
  name = 'Dashboard 1',
): TableauDashboard {
  return { name, sheetType: 'dashboard', worksheets };
}

/** A viz element whose active sheet the test can change, or take away. */
export interface FakeVizHandle {
  /** The element itself. */
  readonly viz: TableauViz;
  /**
   * Make this sheet the active one, or `null` to make the viz unreadable again.
   *
   * Setting a sheet is what a `tabswitched` means; `null` is a viz that has not
   * become interactive.
   */
  readonly setActiveSheet: (sheet: TableauSheet | null) => void;
}

/**
 * Build a live `<tableau-viz>` element whose active sheet a test controls.
 *
 * A real one is a custom element the Embedding library upgraded, so this uses a
 * genuine element rather than a cast: the binder inserts a sibling next to it
 * and must never re-parent it, and only a real node can show that.
 *
 * `workbook` is an accessor that **throws** until a sheet is set, which is what
 * a real viz does before it is interactive — the property exists from the
 * moment the element is upgraded, and reading through it is what fails. An
 * adapter that treats `workbook !== undefined` as readiness therefore breaks
 * here rather than passing by accident.
 *
 * @param active - The sheet to start active, or `null` for a viz that is still
 * loading.
 * @param name - The workbook's name.
 * @returns The element and the setter that changes its active sheet.
 * @throws When there is no DOM — add `@jest-environment jsdom` to the test.
 */
export function fakeViz(
  active: TableauSheet | null = null,
  name = 'Workbook 1',
): FakeVizHandle {
  if (typeof document === 'undefined') {
    throw new TypeError('fakeViz needs a DOM; add a `@jest-environment jsdom` docblock.');
  }
  const element = document.createElement('tableau-viz');
  let sheet = active;
  Object.defineProperty(element, 'workbook', {
    configurable: true,
    get(): TableauWorkbook {
      if (sheet === null) {
        throw new Error('the viz is not interactive yet');
      }
      // A fresh wrapper per read, as the custom element builds one.
      return { name, activeSheet: sheet };
    },
  });

  return {
    viz: element,
    setActiveSheet: (next: TableauSheet | null): void => {
      sheet = next;
    },
  };
}

/**
 * Build a live `<tableau-viz>` element whose active sheet is a dashboard.
 *
 * The common case of {@link fakeViz}, for a test that never changes the sheet.
 *
 * @param worksheets - The dashboard's worksheets, in add-order.
 * @param name - The dashboard's name.
 * @returns The viz element, already carrying a readable workbook.
 * @throws When there is no DOM — add `@jest-environment jsdom` to the test.
 */
export function fakeDashboardViz(
  worksheets: readonly TableauWorksheet[],
  name = 'Dashboard 1',
): TableauViz {
  return fakeViz(fakeDashboard(worksheets, name), name).viz;
}
