/**
 * Structural type definitions for the Tableau surface MAIDR duck-types against.
 *
 * MAIDR deliberately takes **no compile-time dependency on any `@tableau/*`
 * package**. The Embedding API v3 library is loaded by the host page (from
 * `public.tableau.com`, a Tableau Server/Cloud origin, or the Tableau CDN) and
 * the adapter only ever sees the live `<tableau-viz>` element that library
 * upgraded. Shipping the vendor's typings would add a dependency that buys
 * nothing at runtime and pins us to one library version, so the members the
 * adapter actually reads are mirrored here instead — nothing more.
 *
 * Everything below is intentionally a *subset*. A member is present only
 * because some module in `src/adapters/tableau/` reads or calls it, and a
 * member is optional whenever the running library may not provide it (an older
 * Embedding release, or the Extensions API's `Worksheet`, which satisfies the
 * same shared `DataTable` contract). The one member that is optional for a
 * different reason is {@link TableauWorksheet.getVisualSpecificationAsync}:
 * it exists on the Extensions surface only, and `reader.ts` feature-detects it.
 */

import type { Orientation, StepDirection, TraceType } from '../../type/grammar';

/**
 * Values of Tableau's `DataType` enum, as they appear on `Column.dataType`.
 *
 * These are the enum's *values*, not the prose names used in the reference
 * tables — `date-time` rather than "datetime", `int` rather than "integer".
 * `fields.ts` compares against them directly, so the distinction matters.
 */
export type TableauDataType
  = | 'bool'
    | 'date'
    | 'date-time'
    | 'float'
    | 'int'
    | 'spatial'
    | 'string'
    | 'unknown';

/**
 * One column of a worksheet's summary data.
 *
 * `fieldName` carries the aggregation wrapper (`SUM(Sales)`) and is documented
 * as **not stable across languages**; `fieldId` carries it too and is not
 * stable across data-source replacement. Both are read: `fieldId` keys the
 * view-order↔alphabetical remap, `fieldName` is what selection criteria are
 * addressed by.
 */
export interface TableauColumn {
  /** Display name including the aggregation wrapper, e.g. `SUM(Sales)`. */
  readonly fieldName: string;
  /** Stable-within-a-session identifier used to match columns across calls. */
  readonly fieldId: string;
  readonly dataType: TableauDataType;
  /** Position of this column in the table it came from. */
  readonly index: number;
  /**
   * Whether the column is referenced by the visualization. Optional because
   * older libraries omit it; `false` means a tooltip-only passenger, which
   * `fields.ts` drops.
   */
  readonly isReferenced?: boolean;
}

/**
 * One cell of summary data.
 *
 * Both value members are optional and typed `unknown`: `IncludeDataValuesOption`
 * lets a caller ask for only one of them, and Tableau turns special values
 * (`%null%`, `%no-access%`) into `null` on `nativeValue`. Narrowing happens in
 * the coercion helpers in `fields.ts`, never at a call site.
 */
export interface TableauDataValue {
  /** Raw value; special values arrive as the sentinel strings, not as null. */
  readonly value?: unknown;
  /** Native JS value (`string | number | boolean | Date`), or `null`. */
  readonly nativeValue?: unknown;
  /** Worksheet-formatted text — what a reader should hear. */
  readonly formattedValue?: string;
  readonly aliasValue?: string;
  readonly hasAlias?: boolean;
}

/**
 * A row of summary data **already remapped into view order**.
 *
 * An entry is `undefined` when the view column at that position had no
 * counterpart in the (alphabetically sorted) data table, which is the only
 * honest reading of a column we cannot locate. The coercion helpers treat it
 * exactly as they treat a null value: a gap.
 */
export type TableauRow = readonly (TableauDataValue | undefined)[];

/**
 * A page of summary data. `data` is indexed `[rowIndex][columnIndex]`, and its
 * columns are sorted **alphabetically** — never in view order.
 */
export interface TableauDataTable {
  readonly columns: readonly TableauColumn[];
  readonly data: readonly (readonly TableauDataValue[])[];
  readonly name?: string;
  readonly totalRowCount?: number;
  readonly isSummaryData?: boolean;
}

/**
 * Options accepted by `getSummaryDataReaderAsync`.
 *
 * Only `maxRows` is declared, and that is deliberate: Tableau documents
 * `ignoreSelection` with a description that is the exact inverse of its name
 * ("Only return data for the currently selected marks"), on both API surfaces.
 * Leaving it out of this interface makes passing it a **compile error**, so no
 * call site can quietly guess which way it means. The adapter clears the
 * selection before every read instead.
 */
export interface TableauGetSummaryDataOptions {
  /** `0` means all rows, and is the only value the adapter passes. */
  readonly maxRows?: number;
}

/**
 * Paginated reader over a worksheet's summary data.
 *
 * Only one active reader for summary data is supported per viz, and
 * `releaseAsync` must be called — later calls on a released reader throw. Both
 * facts are why `reader.ts` owns a serial queue and a `finally`.
 */
export interface TableauDataTableReader {
  readonly pageCount: number;
  readonly totalRowCount: number;
  getPageAsync: (pageNumber: number) => Promise<TableauDataTable>;
  /**
   * Documented convenience that concatenates every page. Not used — it caps at
   * 400 pages and hides which page a failure came from — but declared because
   * a real reader has it.
   */
  getAllPagesAsync?: (maxRows?: number) => Promise<TableauDataTable>;
  releaseAsync: () => Promise<void>;
}

/** A quantitative or temporal range, as `SelectionCriteria.value` accepts it. */
export interface TableauRangeValue {
  readonly min: number | Date;
  readonly max: number | Date;
}

/**
 * One clause of `selectMarksByValueAsync`.
 *
 * Note `value` is **singular** even when it carries a list of values — that is
 * Tableau's spelling, and getting it wrong silently selects nothing.
 */
export interface TableauSelectionCriteria {
  readonly fieldName: string;
  readonly value: string | string[] | TableauRangeValue;
}

/** One marks card of a worksheet's visual specification. */
export interface TableauMarksSpecification {
  /**
   * The primitive Tableau actually drew — `'bar'`, `'line'`, `'pie'`, … There
   * is no `Automatic` member: "Automatic" resolves to whatever was drawn.
   */
  readonly primitiveType?: string;
}

/**
 * A worksheet's visual specification.
 *
 * Available on the Extensions API (1.11+ / Tableau 2024.1+) and absent from the
 * Embedding API today, which is why every member is optional and why
 * `reader.ts` feature-detects the method that returns it. When present it is
 * the only *direct* evidence of what chart the author drew; without it the
 * extractor falls back to its heuristic ladder.
 */
export interface TableauVisualSpecification {
  readonly activeMarksSpecificationIndex?: number;
  readonly marksSpecifications?: readonly TableauMarksSpecification[];
}

/** Values of Tableau's `SheetType` enum. */
export type TableauSheetType = 'worksheet' | 'dashboard' | 'story';

/** Members every sheet carries, whatever kind it is. */
export interface TableauSheetBase {
  readonly name: string;
  readonly sheetType: TableauSheetType;
}

/**
 * A worksheet: the only sheet kind that owns data and selection.
 *
 * The signatures match both the Embedding and the Extensions `Worksheet`, so
 * every pure module downstream works unchanged under either host.
 */
export interface TableauWorksheet extends TableauSheetBase {
  readonly sheetType: 'worksheet';
  /** Columns in **view order** — the reader's own columns are alphabetical. */
  getSummaryColumnsInfoAsync: () => Promise<TableauColumn[]>;
  getSummaryDataReaderAsync: (
    pageRowCount?: number,
    options?: TableauGetSummaryDataOptions,
  ) => Promise<TableauDataTableReader>;
  selectMarksByValueAsync: (
    selections: readonly TableauSelectionCriteria[],
    updateType: string,
  ) => Promise<void>;
  clearSelectedMarksAsync: () => Promise<void>;
  /** Extensions-only, Tableau 2024.1+. Feature-detected, never assumed. */
  getVisualSpecificationAsync?: () => Promise<TableauVisualSpecification>;
}

/** A dashboard. `worksheets` is in the order the author added them. */
export interface TableauDashboard extends TableauSheetBase {
  readonly sheetType: 'dashboard';
  readonly worksheets: readonly TableauWorksheet[];
}

/**
 * A story. Carries nothing the adapter can use: reading a worksheet inside a
 * story is a documented known issue ("operation not allowed on non-active
 * sheet"), so stories are skipped with a warning.
 */
export interface TableauStory extends TableauSheetBase {
  readonly sheetType: 'story';
}

/** Discriminated union of the three sheet kinds, keyed by `sheetType`. */
export type TableauSheet = TableauWorksheet | TableauDashboard | TableauStory;

/** The workbook behind a viz. */
export interface TableauWorkbook {
  readonly name?: string;
  readonly activeSheet: TableauSheet;
}

/**
 * The live `<tableau-viz>` custom element.
 *
 * It is an ordinary `HTMLElement` and an ordinary `EventTarget` — Tableau
 * events arrive as `CustomEvent`s whose payload is in `event.detail` — which is
 * why the adapter needs no vendor event API at all. `workbook` is optional
 * because it is only guaranteed once the element has fired `firstinteractive`.
 */
export interface TableauViz extends HTMLElement {
  readonly workbook?: TableauWorkbook;
}

/** Whether a classified column is read as a value or as a category. */
export type TableauColumnRole = 'measure' | 'dimension';

/** Members shared by both classified column roles. */
export interface TableauClassifiedColumnBase {
  readonly column: TableauColumn;
  /**
   * Index into a {@link TableauRow} — i.e. the column's position in the
   * original view-order column list, dropped columns included. Dropping a
   * column never shifts the columns after it.
   */
  readonly viewIndex: number;
  /** Human-facing name: the aggregation wrapper unwrapped where possible. */
  readonly caption: string;
  /** Whether `dataType` is one of Tableau's numeric types. */
  readonly numeric: boolean;
  /** Whether the column carries a date or date-time. */
  readonly temporal: boolean;
}

/** A column read as a value: what the pitch and the numbers come from. */
export interface TableauMeasureColumn extends TableauClassifiedColumnBase {
  readonly role: 'measure';
  /** Aggregation wrapper as written, e.g. `SUM`. Absent on a bare numeric. */
  readonly agg?: string;
}

/** A column read as a category: what a reader navigates between. */
export interface TableauDimensionColumn extends TableauClassifiedColumnBase {
  readonly role: 'dimension';
}

/** A column that survived classification, discriminated by `role`. */
export type TableauClassifiedColumn = TableauMeasureColumn | TableauDimensionColumn;

/** Result of classifying a worksheet's columns, all lists in view order. */
export interface TableauColumnClassification {
  /** Every surviving column, in view order. */
  readonly columns: readonly TableauClassifiedColumn[];
  readonly dimensions: readonly TableauDimensionColumn[];
  readonly measures: readonly TableauMeasureColumn[];
}

/**
 * Everything one worksheet contributes, read once and then never awaited again.
 *
 * This is the boundary between the async half of the adapter (`reader.ts`) and
 * the pure half (`fields.ts`, `extractor.ts`): the extractor is handed
 * snapshots and produces a figure with no I/O of its own.
 */
export interface WorksheetSnapshot {
  readonly name: string;
  /** Columns in view order, exactly as `getSummaryColumnsInfoAsync` gave them. */
  readonly columns: readonly TableauColumn[];
  /** Every row, already remapped into view order. */
  readonly rows: readonly TableauRow[];
  /** Present only when the host exposes `getVisualSpecificationAsync`. */
  readonly spec?: TableauVisualSpecification;
}

/**
 * What a page can tell the adapter about a single worksheet when the
 * heuristics read it wrong.
 *
 * Every field is JSON-serializable on purpose: a future Extensions binder can
 * read the same object straight out of `tableau.extensions.settings` without a
 * second configuration format existing.
 */
export interface TableauWorksheetOverride {
  /** Leave this worksheet out of the figure entirely. */
  skip?: boolean;
  /** What the worksheet is. Outranks the visual specification and the ladder. */
  traceType?: TraceType;
  /** Layer title; defaults to the worksheet name. */
  title?: string;
  /** `Column.fieldName` (or `fieldId`) to use as the category / x axis. */
  x?: string;
  /** Measure to use as the value. */
  y?: string;
  /** Dimension to group series by. */
  z?: string;
  /** Nothing in summary data says which way the bars were drawn. */
  orientation?: Orientation;
  /** Nothing in summary data says where a step jumps. */
  stepDirection?: StepDirection;
  /** Axis labels, when the field captions are not what a reader should hear. */
  axes?: { x?: string; y?: string; z?: string };
}

/**
 * Options for `bindTableau`. The adapter's only configuration channel.
 */
export interface TableauAdapterOptions {
  /** Stable figure id. Defaults to `maidr-tableau-<n>`; kept across refreshes. */
  id?: string;
  /** Figure title. */
  title?: string;
  /**
   * Opt in to in-place refresh while the user is inside the chart. Default
   * `false`, so a filter change is picked up on the next focus-in rather than
   * rebuilding the figure under a reader who is mid-navigation.
   */
  live?: boolean;
  /** Worksheet names to include, in this order. Default: every worksheet. */
  worksheets?: string[];
  /** Per-worksheet overrides, keyed by worksheet name. */
  overrides?: Record<string, TableauWorksheetOverride>;
  /** Text on the keyboard entry point rendered beside the viz. */
  anchorLabel?: string;
}
