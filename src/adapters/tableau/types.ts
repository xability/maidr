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
 * Most of what follows is intentionally a *subset*: a member is present because
 * some module in `src/adapters/tableau/` reads or calls it, and a member is
 * optional whenever the running library may not provide it (an older Embedding
 * release, or the Extensions API's `Worksheet`, which satisfies the same shared
 * `DataTable` contract).
 *
 * The visual-specification block is the exception and is mirrored **whole**,
 * member for member, against the shipped declarations. It was previously
 * written from documentation prose, which got its optionality, its member types
 * and its very availability wrong; a partial mirror is what allowed that, so
 * each of those types names the declaration file and the package version it was
 * read from and is meant to be re-verified against the package rather than
 * against prose.
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

// ---------------------------------------------------------------------------
// Visual specification
//
// Everything from here to {@link TableauVisualSpecification} mirrors, member
// for member, the declarations shipped in `@tableau/embedding-api@3.12.1`,
// which vendors `@tableau/api-external-contract-js@1.211.0`. Paths in the doc
// comments are relative to that contract's `lib/src/`.
//
// Two deliberate departures from the vendor's spelling, neither of which
// changes what the payload is:
//
// - the enums become string-literal unions, because MAIDR compares against the
//   *values* and importing the vendor's `enum` would be the dependency this
//   file exists to avoid;
// - the array members are `readonly T[]` rather than `T[]`. Nothing here is
//   ever mutated, and a vendor `T[]` is assignable to a `readonly T[]`, so the
//   mirror is stricter locally without misreporting the contract.
// ---------------------------------------------------------------------------

/**
 * Values of Tableau's `MarkType` enum: the primitive one marks card drew.
 *
 * Mirrors `MarkType` in `ExternalContract/Shared/Namespaces/Tableau.d.ts` —
 * all thirteen members, verbatim.
 *
 * There is no `Automatic` member. "Automatic" is an authoring-time setting; by
 * the time a viz is drawn Tableau has resolved it to one of these. The enum is
 * closed *in this contract version*, which is not the same as closed forever —
 * the host page loads whichever Embedding build it likes — so `extractor.ts`
 * still routes an unrecognised value to the heuristic ladder instead of
 * treating the union as exhaustive at runtime.
 */
export type TableauMarkType
  = | 'area'
    | 'bar'
    | 'circle'
    | 'gantt-bar'
    | 'heatmap'
    | 'line'
    | 'map'
    | 'pie'
    | 'polygon'
    | 'shape'
    | 'square'
    | 'text'
    | 'viz-extension';

/**
 * Values of Tableau's `EncodingType` enum: which shelf or card a field sits on.
 *
 * Mirrors `EncodingType` in `ExternalContract/Shared/Namespaces/Tableau.d.ts` —
 * all sixteen members, verbatim. The declaration carries no documentation of
 * any kind, so the meanings below are the enum's own spelling and nothing more.
 *
 * Worth knowing before reasoning about a payload: the *internal* contract's
 * `EncodingType`, which is the one commented "Used by
 * getVisualSpecificationAsync", declares only the last ten — `column`, `row`,
 * `page`, `filter`, `marks-type` and `measure-values` exist on the public
 * contract alone. The public contract is what a host ships, so it is what is
 * mirrored, but a value from the first six arriving on `Encoding.type` should
 * not be assumed.
 */
export type TableauEncodingType
  = | 'angle'
    | 'color'
    | 'column'
    | 'custom'
    | 'detail'
    | 'filter'
    | 'geometry'
    | 'label'
    | 'marks-type'
    | 'measure-values'
    | 'page'
    | 'path'
    | 'row'
    | 'shape'
    | 'size'
    | 'tooltip';

/**
 * Values of Tableau's `FieldRoleType` enum.
 *
 * Mirrors `FieldRoleType` in `ExternalContract/Shared/Namespaces/Tableau.d.ts`.
 * Not to be confused with {@link TableauColumnRole}, which is MAIDR's own
 * reading of a *summary-data column* and has nothing to do with this enum.
 */
export type TableauFieldRoleType = 'dimension' | 'measure' | 'unknown';

/**
 * Values of Tableau's `ColumnType` enum: whether a field is discrete or
 * continuous, as the author placed it.
 *
 * Mirrors `ColumnType` in `ExternalContract/Shared/Namespaces/Tableau.d.ts`.
 * `'unknown'` is a value the enum really declares, not a placeholder.
 */
export type TableauFieldColumnType = 'continuous' | 'discrete' | 'unknown';

/**
 * Values of Tableau's `FieldAggregationType` enum.
 *
 * Mirrors `FieldAggregationType` in
 * `ExternalContract/Shared/Namespaces/Tableau.d.ts` — all forty members,
 * verbatim. The list mixes true aggregations (`sum`, `countd`), date
 * truncations (`trunc-month`) and date parts (`weekday`), because Tableau
 * reports all three through this one property.
 */
export type TableauFieldAggregationType
  = | 'attr'
    | 'avg'
    | 'collect'
    | 'count'
    | 'countd'
    | 'day'
    | 'end'
    | 'hour'
    | 'in-out'
    | 'kurtosis'
    | 'max'
    | 'mdy'
    | 'median'
    | 'min'
    | 'minute'
    | 'month'
    | 'month-year'
    | 'none'
    | 'qtr'
    | 'quart1'
    | 'quart3'
    | 'second'
    | 'skewness'
    | 'stdev'
    | 'stdevp'
    | 'sum'
    | 'trunc-day'
    | 'trunc-hour'
    | 'trunc-minute'
    | 'trunc-month'
    | 'trunc-qtr'
    | 'trunc-second'
    | 'trunc-week'
    | 'trunc-year'
    | 'user'
    | 'var'
    | 'varp'
    | 'week'
    | 'weekday'
    | 'year';

/**
 * One field of a visual specification, with its properties.
 *
 * Mirrors `FieldInstance` in `ExternalContract/Shared/VisualModelInterface.d.ts`
 * together with every member it inherits from `FieldBase` in
 * `ExternalContract/Shared/DataSourceInterfaces.d.ts`: twelve inherited members
 * plus `fieldId`.
 *
 * Note that `description` and `dataType` are **required keys whose value may be
 * `undefined`**, not optional keys — that is how the vendor declares them, and
 * the distinction is the difference between "Tableau reported no description"
 * and "the payload never had the key".
 */
export interface TableauFieldInstance {
  /** The field's caption, e.g. `Sales`. */
  readonly name: string;
  /** The author's description of the field, `undefined` when there is none. */
  readonly description: string | undefined;
  readonly dataType: TableauDataType | undefined;
  readonly role: TableauFieldRoleType;
  readonly aggregation: TableauFieldAggregationType;
  readonly columnType: TableauFieldColumnType;
  readonly isCalculatedField: boolean;
  readonly isCombinedField: boolean;
  /** Whether Tableau generated the field, e.g. `Measure Values`. */
  readonly isGenerated: boolean;
  readonly isGeospatial: boolean;
  readonly isHidden: boolean;
  readonly isPresentOnPublishedDatasource: boolean;
  /**
   * Unique across every data source in the workbook, and — in summary data —
   * inclusive of the aggregation. Documented as changing when the data source
   * is replaced, so it is a within-session key and not a durable one.
   */
  readonly fieldId: string;
}

/**
 * One field on one encoding of a marks card.
 *
 * Mirrors `Encoding` in `ExternalContract/Shared/VisualModelInterface.d.ts`.
 */
export interface TableauEncoding {
  /** The built-in encoding type, or the name of the custom encoding. */
  readonly id: string;
  /** Distinguishes duplicate fields dropped on the same encoding. */
  readonly fieldEncodingId: string;
  readonly type: TableauEncodingType;
  readonly field: TableauFieldInstance;
}

/**
 * One marks card of a worksheet's visual specification.
 *
 * Mirrors `MarksSpecification` in
 * `ExternalContract/Shared/VisualModelInterface.d.ts`. Both members are
 * required there; neither is optional.
 */
export interface TableauMarksSpecification {
  /** The primitive Tableau actually drew — `'bar'`, `'line'`, `'pie'`, … */
  readonly primitiveType: TableauMarkType;
  /**
   * Every field on this card's encodings, colour and size included.
   *
   * Read by nothing today, and mirrored anyway: this is the member whose
   * absence from the old hand-written type is what made "the API cannot tell a
   * stack from a side-by-side" look like a fact about Tableau rather than a
   * fact about our type. Nothing in the contract reports Tableau's *Stack
   * Marks* setting — there is no such declared member anywhere — so this alone
   * does not settle that question, but it is the evidence any attempt needs.
   */
  readonly encodings: readonly TableauEncoding[];
}

/**
 * A worksheet's visual specification: the shelves and the marks cards behind
 * what was drawn.
 *
 * Mirrors `VisualSpecification` in
 * `ExternalContract/Shared/VisualModelInterface.d.ts`. **Every member is
 * required**, and `reader.ts` still feature-detects the call that returns it —
 * see {@link TableauWorksheet.getVisualSpecificationAsync} for why those two
 * facts sit together.
 *
 * When it is present it is the only *direct* evidence of what chart the author
 * drew; without it the extractor falls back to its heuristic ladder.
 *
 * `activeMarksSpecificationIndex` is declared as a bare `number` with no
 * documentation at all: nothing says it is integral, non-negative, or less than
 * `marksSpecifications.length`. The extractor range-checks it rather than
 * indexing with it.
 */
export interface TableauVisualSpecification {
  /** Fields on the Rows shelf, in shelf order. */
  readonly rowFields: readonly TableauFieldInstance[];
  /** Fields on the Columns shelf, in shelf order. */
  readonly columnFields: readonly TableauFieldInstance[];
  readonly activeMarksSpecificationIndex: number;
  /**
   * One entry per marks card. A dual-axis worksheet has more than one, and
   * nothing in the contract says which axis a card belongs to, whether the axes
   * are synchronized, or how the cards are ordered.
   */
  readonly marksSpecifications: readonly TableauMarksSpecification[];
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
  /**
   * The worksheet's visual specification.
   *
   * Declared **non-optionally on both public `Worksheet` interfaces** —
   * `ExternalContract/Embedding/SheetInterfaces.d.ts` and
   * `ExternalContract/Extensions/SheetInterfaces.d.ts` — and implemented by the
   * Embedding API's own `Worksheet` class (`EmbeddingApi/Models/Worksheet`) in
   * `@tableau/embedding-api@3.12.1`. It is not Extensions-only.
   *
   * It is declared required here and *still* feature-detected in `reader.ts`,
   * because the two answer different questions. This type describes the
   * contract; the runtime check describes the host, which loads whatever build
   * of the Embedding library it likes. The Extensions declaration carries
   * `@since 1.11.0 and Tableau 2024.1`; the Embedding one carries no `@since`
   * at all, so the declarations set no version floor there — an older library
   * on the page simply will not have the method, and an older Tableau Server
   * can reject the call at runtime, which `reader.ts` catches.
   */
  getVisualSpecificationAsync: () => Promise<TableauVisualSpecification>;
}

/**
 * An x/y coordinate in pixels.
 *
 * Mirrors `Point` in `ExternalContract/Embedding/SheetInterfaces.d.ts`
 * (`@tableau/embedding-api@3.12.1`, which vendors
 * `@tableau/api-external-contract-js@1.211.0`), whose own doc comment reads
 * "Represents an x/y coordinate in pixels". Note that the declaration lives in
 * the Embedding file rather than in `Shared/`, unlike {@link TableauSize} — the
 * Extensions contract declares a `Point` of its own.
 */
export interface TableauPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A width and a height in pixels.
 *
 * Mirrors `Size` in `ExternalContract/Shared/SheetInterfaces.d.ts`
 * (`@tableau/api-external-contract-js@1.211.0`), documented as "Represents a
 * width and height in pixels" — the same space {@link TableauPoint} is in, so
 * a position and a size on the same object are directly comparable.
 *
 * Declared `height` first, as the vendor does.
 */
export interface TableauSize {
  readonly height: number;
  readonly width: number;
}

/**
 * One object placed on a dashboard: a worksheet, a legend, a title, a blank.
 *
 * Mirrors `DashboardObject` in
 * `ExternalContract/Embedding/SheetInterfaces.d.ts`
 * (`@tableau/api-external-contract-js@1.211.0`), member for member, minus the
 * `dashboard` back-reference — that member exists, and is omitted here only
 * because nothing reads it and mirroring it would make this file's two
 * dashboard types mutually recursive for no gain.
 *
 * Every member is **required and non-optional** in the declarations, and none
 * carries an `@since` tag, so the contract sets no version floor: presence at
 * runtime is the only test that means anything. See
 * {@link TableauDashboard.objects}.
 */
export interface TableauDashboardObject {
  /**
   * What the object represents.
   *
   * The vendor types this as the `DashboardObjectType` enum, whose values are
   * `'blank'`, `'worksheet'`, `'quick-filter'`, `'parameter-control'`,
   * `'page-filter'`, `'legend'`, `'title'`, `'text'`, `'image'`, `'web-page'`
   * and `'extension'`. It is widened to `string` here deliberately: the enum is
   * closed in *this* contract version, the host page loads whichever Embedding
   * build it likes, and the adapter only ever asks whether the value is
   * `'worksheet'` — a union would invite an exhaustive `switch` over a set that
   * is not actually closed at runtime.
   */
  readonly type: string;
  /** Coordinates relative to the top-left corner of the containing dashboard. */
  readonly position: TableauPoint;
  /** The object's own size, in the same pixel space as {@link position}. */
  readonly size: TableauSize;
  /** The worksheet when `type` is `'worksheet'`, `undefined` otherwise. */
  readonly worksheet: TableauWorksheet | undefined;
  /**
   * The name given to the *object* during authoring.
   *
   * **Not** a worksheet name, even for a worksheet object: an author can rename
   * the container without renaming the sheet inside it. Matching geometry to a
   * worksheet goes through `object.worksheet.name`, never through this.
   */
  readonly name: string;
  /** True when the object floats rather than sitting in the tiled layout. */
  readonly isFloating: boolean;
  /** True when the object is visible. */
  readonly isVisible: boolean;
  /** The dashboard object's id. */
  readonly id: number;
}

/** A dashboard. `worksheets` is in the order the author added them. */
export interface TableauDashboard extends TableauSheetBase {
  readonly sheetType: 'dashboard';
  readonly worksheets: readonly TableauWorksheet[];
  /**
   * Every object on the dashboard, worksheets and furniture alike.
   *
   * The contract declares this **required** — `readonly objects:
   * Array<DashboardObject>` on `Dashboard`, with no `@since` tag — and it is
   * nonetheless declared optional here, following this file's rule that a
   * member is optional whenever the running library may not provide it. The
   * real case is an older Embedding build on the host page: absence is exactly
   * what that looks like from here, and making it a type-level fact keeps the
   * feature detection in `binder.tsx` an ordinary check rather than a cast that
   * asserts away the very thing being tested.
   *
   * Read for one purpose only: the per-worksheet geometry that lets the
   * extractor lay a dashboard out as a grid instead of a column. When it is
   * missing, the figure is an N×1 column and nothing else changes.
   */
  readonly objects?: readonly TableauDashboardObject[];
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
 * Where a worksheet sits on its dashboard, in the dashboard's own pixel space.
 *
 * Flattened out of {@link TableauPoint} and {@link TableauSize} rather than
 * holding them, for the same reason every other field of a snapshot is a
 * primitive: the snapshot is a plain JSON-serializable value that a future
 * Dashboard Extensions binder can fill in unchanged, and the extractor that
 * reads it must never be handed a live Tableau object.
 *
 * All four numbers come from the *same* object's `position` and `size`, so they
 * are mutually comparable whatever the units turn out to be; the extractor uses
 * the extents only inside ratios, never against a fixed pixel tolerance.
 */
export interface TableauWorksheetGeometry {
  /** Left edge, relative to the top-left corner of the dashboard. */
  readonly x: number;
  /** Top edge, relative to the top-left corner of the dashboard. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** True when the object floats above the tiled layout instead of within it. */
  readonly isFloating: boolean;
  /** True when the object is visible on the dashboard. */
  readonly isVisible: boolean;
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
  /**
   * Where this worksheet sits on the dashboard.
   *
   * Present only when the active sheet is a dashboard whose objects reported
   * usable geometry — so absence covers an older Embedding library, a lone
   * worksheet sheet, a story, and a worksheet no dashboard object named. The
   * extractor needs it on **every** surviving worksheet before it will lay the
   * figure out as a grid; one gap and the whole figure is a column again.
   */
  readonly geometry?: TableauWorksheetGeometry;
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
  /**
   * How a dashboard's worksheets are arranged into subplots.
   *
   * - `'grid'` (default) — follow the dashboard's own geometry when it is
   *   readable *and* unambiguous, so Left and Right move along a row of the
   *   dashboard and Up and Down move between its rows. Every other case,
   *   including an older embedding library that reports no geometry at all,
   *   falls back to the column below without the page doing anything.
   * - `'column'` — always one worksheet per row, in the order the worksheets
   *   were added. The escape hatch for a dashboard whose geometry is readable
   *   but whose reading order the page knows better than the layout does.
   */
  layout?: 'grid' | 'column';
}
