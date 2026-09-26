/**
 * The slice of the Power BI Visuals API this adapter reads.
 *
 * Declared structurally rather than imported from `powerbi-visuals-api`: that
 * package is a type-only ambient namespace meant for a `pbiviz` project, and
 * pulling it into MAIDR would tie every consumer of this bundle to one SDK
 * version. Only the fields read here are declared, all of them present on the
 * `DataView` a custom visual receives in `update()` since API 1.x, so the real
 * `powerbi.DataView` is assignable to {@link PowerBIDataView} as it stands.
 *
 * @see https://learn.microsoft.com/power-bi/developer/visuals/dataview-introduction
 */

/**
 * A single cell value, as Power BI hands it over.
 *
 * Date columns arrive as `Date` objects; numeric measures usually as numbers,
 * but a text-typed measure or a query that returned blank can put a string or
 * `null` where a number was expected, so every reader here coerces defensively.
 */
export type PowerBIPrimitiveValue = string | number | boolean | Date | null | undefined;

/**
 * The type descriptor of a column (`powerbi.ValueTypeDescriptor`).
 *
 * Only the flags that change how a value is announced are read.
 */
export interface PowerBIValueTypeDescriptor {
  readonly numeric?: boolean;
  readonly integer?: boolean;
  readonly text?: boolean;
  readonly dateTime?: boolean;
  readonly bool?: boolean;
}

/**
 * Metadata for one column of a data view (`powerbi.DataViewMetadataColumn`).
 */
export interface PowerBIMetadataColumn {
  /** The field's caption, as the report author sees it in the field well. */
  readonly displayName: string;
  /** The field's query name; stable across refreshes, used for `withMeasure`. */
  readonly queryName?: string;
  /**
   * The data roles, declared in the visual's `capabilities.json`, that this
   * field is bound to. A field dropped in two wells carries both.
   */
  readonly roles?: Readonly<Record<string, boolean | undefined>>;
  readonly type?: PowerBIValueTypeDescriptor;
  /** Whether the column is a measure rather than a grouping. */
  readonly isMeasure?: boolean;
  /**
   * The series value this column belongs to, when the values were grouped by a
   * series (legend) field. Absent for an ungrouped value column.
   */
  readonly groupName?: PowerBIPrimitiveValue;
  /** The column's position in the query's select list. */
  readonly index?: number;
}

/**
 * One grouping column of a categorical data view
 * (`powerbi.DataViewCategoryColumn`).
 */
export interface PowerBICategoryColumn {
  readonly source: PowerBIMetadataColumn;
  readonly values: readonly PowerBIPrimitiveValue[];
}

/**
 * One measure column of a categorical data view
 * (`powerbi.DataViewValueColumn`).
 *
 * `values` runs parallel to the category column: `values[i]` is the reading at
 * `categories[0].values[i]`.
 */
export interface PowerBIValueColumn {
  readonly source: PowerBIMetadataColumn;
  readonly values: readonly PowerBIPrimitiveValue[];
  /**
   * The cross-highlighted portion of each value, present only while another
   * visual on the page highlights a subset of this one's data.
   */
  readonly highlights?: readonly PowerBIPrimitiveValue[];
}

/**
 * The measure columns of a categorical data view
 * (`powerbi.DataViewValueColumns`).
 *
 * An array of columns with one extra field: `source` is the series (legend)
 * field when the values were grouped by one. Each column then carries the
 * series value it belongs to in `source.groupName`. The SDK also attaches a
 * `grouped()` method; this adapter groups by `groupName` itself so that a plain
 * JSON data view — a fixture, a snapshot — converts the same way.
 */
export type PowerBIValueColumns = readonly PowerBIValueColumn[] & {
  readonly source?: PowerBIMetadataColumn;
};

/**
 * A categorical data view (`powerbi.DataViewCategorical`) — the mapping bar,
 * column, line, pie and scatter visuals are normally built on.
 */
export interface PowerBICategorical {
  readonly categories?: readonly PowerBICategoryColumn[];
  readonly values?: PowerBIValueColumns;
}

/**
 * A table data view (`powerbi.DataViewTable`): one row per result row, one
 * cell per column in `columns` order.
 */
export interface PowerBITable {
  readonly columns: readonly PowerBIMetadataColumn[];
  readonly rows?: readonly (readonly PowerBIPrimitiveValue[])[];
}

/**
 * What a custom visual receives in `options.dataViews[0]` (`powerbi.DataView`).
 *
 * The adapter reads `categorical` when it is present and falls back to
 * `table`; `single` and `matrix` mappings are not read.
 */
export interface PowerBIDataView {
  readonly metadata?: {
    readonly columns?: readonly PowerBIMetadataColumn[];
  };
  readonly categorical?: PowerBICategorical;
  readonly table?: PowerBITable;
}

/**
 * The chart a custom visual draws, which decides the MAIDR layer it becomes.
 *
 * - `column` — vertical bars. One measure and no series field gives a `bar`
 *   layer; several series give a `dodged_bar` or `stacked_bar` layer, per
 *   {@link PowerBIAdapterOptions.barMode}.
 * - `bar` — the same, drawn horizontally.
 * - `line` — one line per series (or per measure, with no series field).
 * - `scatter` — a point per category, positioned by the `x` and `y` measures.
 * - `pie` / `donut` — one slice per category. MAIDR reads a donut as a pie.
 *
 * The data view alone cannot say which of these the visual draws — a
 * category and a measure are equally a column chart, a line and a pie — so the
 * visual names it.
 */
export type PowerBIChartType = 'column' | 'bar' | 'line' | 'scatter' | 'pie' | 'donut';

/**
 * How several series share a bar or column chart's categories.
 *
 * `grouped` (clustered, side by side) becomes `dodged_bar`; `stacked` becomes
 * `stacked_bar`. There is no default guess from the data: the two are the same
 * data view.
 */
export type PowerBIBarMode = 'grouped' | 'stacked';

/**
 * The data role names the adapter looks fields up by.
 *
 * They are the `name`s of the `dataRoles` in the visual's `capabilities.json`.
 * The defaults match the roles most Power BI samples declare; a visual whose
 * roles are named differently maps them here.
 */
export interface PowerBIRoleNames {
  /** The axis / category grouping. Default `category`. */
  readonly category?: string;
  /** The legend / series grouping. Default `series`. */
  readonly series?: string;
  /** The value measure(s). Default `measure`. */
  readonly measure?: string;
  /** A scatter's horizontal measure. Default `x`. */
  readonly x?: string;
  /** A scatter's vertical measure. Default `y`. */
  readonly y?: string;
}

/**
 * Options for {@link convertPowerBIDataView} and {@link bindPowerBI}.
 */
export interface PowerBIAdapterOptions {
  /** The chart the visual draws. See {@link PowerBIChartType}. */
  readonly chartType: PowerBIChartType;
  /** How a multi-series bar or column chart is drawn. Default `grouped`. */
  readonly barMode?: PowerBIBarMode;
  /** Chart title announced on entry. */
  readonly title?: string;
  readonly subtitle?: string;
  readonly caption?: string;
  /**
   * Axis labels. Default: the display names of the fields bound to each axis
   * — for a pie, the category and measure names.
   */
  readonly axes?: { readonly x?: string; readonly y?: string };
  /** Role names, when the visual's capabilities use other ones. */
  readonly roles?: PowerBIRoleNames;
  /**
   * The figure id. Must be unique on the page; default `maidr-powerbi-<n>`.
   */
  readonly id?: string;
}

/**
 * Where one navigable MAIDR position came from in the data view.
 *
 * What a visual needs to act on the reader's position — highlight its own
 * mark, or build a selection id and call `selectionManager.select()` so the
 * other visuals on the page cross-filter to it:
 *
 * ```ts
 * host.createSelectionIdBuilder()
 *   .withCategory(dataView.categorical.categories[0], ref.categoryIndex)
 *   .withSeries(dataView.categorical.values, dataView.categorical.values[ref.valueColumnIndex])
 *   .withMeasure(dataView.categorical.values[ref.valueColumnIndex].source.queryName)
 *   .createSelectionId();
 * ```
 *
 * A categorical reference names the category row and the value column; a table
 * reference names the result row. Either index is `null` where the position
 * has no such coordinate — a pie built from series alone has no category.
 */
export type PowerBIDataPointRef
  = | {
    readonly kind: 'categorical';
    /** Index into `categorical.categories[0].values`, or `null`. */
    readonly categoryIndex: number | null;
    /** Index into `categorical.values`, or `null`. */
    readonly valueColumnIndex: number | null;
  }
  | {
    readonly kind: 'table';
    /** Index into `table.rows`. */
    readonly rowIndex: number;
  };
