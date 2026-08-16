/**
 * Column classification and value coercion for the Tableau adapter.
 *
 * Tableau's summary data does not say which columns are measures and which are
 * dimensions. The Extensions API exposes `Field.role`, but the Embedding API's
 * `Worksheet` does not list `getDataSourcesAsync` at all, so role is derived
 * here from the two things every summary column carries on both surfaces: the
 * aggregation wrapper in `fieldName`, and `dataType`.
 *
 * **The honest limit.** `Column.fieldName` is documented as "not stable across
 * languages". A French workbook yields `SOMME(Ventes)`, whose wrapper is not a
 * known aggregation, so the ladder falls through to the `dataType` test —
 * which still classifies it as a measure, because the column is a `float`. Only
 * the *caption* degrades: it keeps the wrapper and a reader hears
 * "SOMME(Ventes)" instead of "Ventes". Nothing is read as the wrong role. That
 * is exactly why `dataType` is the backstop rather than the regex being the
 * only test — a regex-only classifier would silently demote every measure in
 * every non-English workbook to a category.
 *
 * Everything in this file is pure: no DOM, no promises, no Tableau calls.
 */

import type {
  TableauClassifiedColumn,
  TableauColumn,
  TableauColumnClassification,
  TableauDataValue,
  TableauDimensionColumn,
  TableauMeasureColumn,
  TableauRow,
} from './types';

/**
 * Aggregation wrappers Tableau writes around a measure in `fieldName`.
 *
 * Matched case-insensitively against the wrapper the regex captured, so
 * `Sum(Sales)` and `SUM(Sales)` classify alike.
 */
const MEASURE_AGGS = new Set([
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'CNT',
  'CNTD',
  'MEDIAN',
  'STDEV',
  'STDEVP',
  'VAR',
  'VARP',
  'ATTR',
  'AGG',
  'PCT',
  'TOTAL',
  'COLLECT',
]);

/**
 * Date-part wrappers. `YEAR(Order Date)` is a *dimension* — one category per
 * year — even though the wrapped field is continuous, which is why this is
 * tested before the plain numeric test below.
 */
const DATE_PARTS = new Set([
  'YEAR',
  'QUARTER',
  'MONTH',
  'WEEK',
  'DAY',
  'HOUR',
  'MINUTE',
  'SECOND',
  'MDY',
  'WEEKDAY',
]);

/** Tableau `DataType` *enum values* that carry a number. */
const NUMERIC = new Set(['int', 'float']);

/** `WRAPPER(field)`, e.g. `SUM(Sales)` or `YEAR(Order Date)`. */
const WRAPPER_PATTERN = /^([a-z]+)\((.+)\)$/i;

/**
 * Classify one column, or drop it.
 *
 * The ladder runs in exactly this order; each rung is commented with the case
 * it exists for.
 *
 * @param column - A summary column, in view order.
 * @param viewIndex - Its position in the view-order column list.
 * @returns The classified column, or `null` when it carries nothing sonifiable.
 */
function classifyColumn(
  column: TableauColumn,
  viewIndex: number,
): TableauClassifiedColumn | null {
  // 0. Tooltip-only passengers. Tableau still returns them; the viz does not
  //    draw them, so navigating them would announce data nobody plotted.
  if (column.isReferenced === false) {
    return null;
  }

  // 1. No sonifiable value: geometry has no magnitude, and `unknown` is a
  //    column Tableau itself declines to describe.
  const { dataType } = column;
  if (dataType === 'spatial' || dataType === 'unknown') {
    return null;
  }

  const numeric = NUMERIC.has(dataType);
  const temporal = dataType === 'date' || dataType === 'date-time';
  const match = WRAPPER_PATTERN.exec(column.fieldName);
  const wrapper = match === null ? null : match[1].toUpperCase();

  // 2/3. An aggregated numeric: the caption is the field inside the wrapper,
  //      which is the name a reader knows the quantity by.
  if (match !== null && wrapper !== null && MEASURE_AGGS.has(wrapper) && numeric) {
    return {
      role: 'measure',
      column,
      viewIndex,
      caption: match[2],
      agg: match[1],
      numeric,
      temporal,
    };
  }

  // 4. A date part. The caption keeps the wrapper because `YEAR(Order Date)`
  //    and `MONTH(Order Date)` are different categories of the same field, and
  //    unwrapping both to "Order Date" would make them indistinguishable.
  if (match !== null && wrapper !== null && DATE_PARTS.has(wrapper)) {
    return {
      role: 'dimension',
      column,
      viewIndex,
      caption: column.fieldName,
      numeric,
      temporal: true,
    };
  }

  // 5. A bare numeric column. This is the rung a non-English workbook lands on,
  //    and it is why the wrong locale costs a caption rather than a role.
  if (numeric) {
    return {
      role: 'measure',
      column,
      viewIndex,
      caption: column.fieldName,
      numeric,
      temporal,
    };
  }

  // 6. Everything else is a category: strings, booleans, and unwrapped dates.
  return {
    role: 'dimension',
    column,
    viewIndex,
    caption: column.fieldName,
    numeric,
    temporal,
  };
}

/**
 * Classify a worksheet's columns into measures and dimensions.
 *
 * @param columns - Summary columns **in view order**, i.e. exactly what
 * `getSummaryColumnsInfoAsync` returned. Order is preserved in every returned
 * list, and `viewIndex` keeps pointing at the original position even when
 * earlier columns were dropped.
 * @returns The surviving columns, split by role.
 */
export function classifyColumns(
  columns: readonly TableauColumn[],
): TableauColumnClassification {
  const classified: TableauClassifiedColumn[] = [];
  const dimensions: TableauDimensionColumn[] = [];
  const measures: TableauMeasureColumn[] = [];

  columns.forEach((column, viewIndex) => {
    const field = classifyColumn(column, viewIndex);
    if (field === null) {
      return;
    }
    classified.push(field);
    if (field.role === 'measure') {
      measures.push(field);
    } else {
      dimensions.push(field);
    }
  });

  return { columns: classified, dimensions, measures };
}

/**
 * Map view-order column positions onto the data table's alphabetical ones.
 *
 * `DataTableReader` sorts its columns alphabetically and offers no way to ask
 * for view order, while `getSummaryColumnsInfoAsync` is in view order and
 * carries no data. Matching them by `fieldId` — as Tableau's own snippet does —
 * is the only bridge. `fieldName` is tried second so a host that omits
 * `fieldId` degrades to a working read rather than to no columns at all.
 *
 * @param viewColumns - Columns in view order.
 * @param tableColumns - Columns of a data table page, alphabetically sorted.
 * @returns One entry per view column: the alphabetical index to read it from,
 * or `-1` when the column has no counterpart in the table.
 */
export function buildIndexMap(
  viewColumns: readonly TableauColumn[],
  tableColumns: readonly TableauColumn[],
): number[] {
  return viewColumns.map((viewColumn) => {
    const byId = tableColumns.findIndex(
      candidate => candidate.fieldId === viewColumn.fieldId,
    );
    if (byId !== -1) {
      return byId;
    }
    return tableColumns.findIndex(
      candidate => candidate.fieldName === viewColumn.fieldName,
    );
  });
}

/**
 * Reorder one raw data row into view order.
 *
 * @param row - A row as the reader gave it, in alphabetical column order.
 * @param indexMap - The map from {@link buildIndexMap}.
 * @returns The row in view order; an unmatched column reads `undefined`.
 */
export function remapRow(
  row: readonly TableauDataValue[],
  indexMap: readonly number[],
): TableauRow {
  return indexMap.map(alphabeticalIndex =>
    alphabeticalIndex < 0 ? undefined : row[alphabeticalIndex],
  );
}

/**
 * Read a cell as a finite number, or report that it is a gap.
 *
 * `DataValue` has no `isNull` flag: Tableau turns its special values into a
 * `null` `nativeValue`. A gap is therefore `null`/`undefined`/`NaN`, and this
 * returns `null` for all three. Callers must not substitute a zero — a zero is
 * a value a chart drew, and inventing one puts a bar where the viz has none.
 *
 * A `Date` is deliberately *not* converted: its epoch milliseconds are not a
 * number the chart drew. Use {@link toDateValue} for temporal cells.
 *
 * @param value - The cell, or `undefined` for an unmatched column.
 * @returns The number, or `null` for a gap.
 */
export function toFiniteNumber(value: TableauDataValue | undefined): number | null {
  const native = value?.nativeValue;
  if (typeof native === 'number') {
    return Number.isFinite(native) ? native : null;
  }
  // Some hosts hand a measure back as its digits; a strictly numeric string is
  // unambiguous, and anything else stays a gap.
  if (typeof native === 'string' && native.trim() !== '') {
    const parsed = Number(native);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Read a cell as the text a reader should hear, and as the key a category is
 * grouped by.
 *
 * `formattedValue` wins because it carries the worksheet's own number and date
 * formatting, which is what a sighted reader sees on the axis.
 *
 * @param value - The cell, or `undefined` for an unmatched column.
 * @returns The category key; the empty string for a gap, never a fabricated
 * label such as `"null"`.
 */
export function toCategoryKey(value: TableauDataValue | undefined): string {
  const formatted = value?.formattedValue;
  if (typeof formatted === 'string') {
    return formatted;
  }
  const native = value?.nativeValue;
  if (native === null || native === undefined) {
    return '';
  }
  if (native instanceof Date) {
    // ISO rather than `String(date)`: a locale- and timezone-dependent string
    // would make the same cell read differently on two machines.
    return Number.isNaN(native.getTime()) ? '' : native.toISOString();
  }
  return String(native);
}

/**
 * Read a cell as a date.
 *
 * Only a real `Date` is accepted. Parsing a string into a calendar is the kind
 * of confident guess this adapter refuses: a date-part column's text is
 * `"Q3 2021"` as often as it is an ISO stamp, and a wrong parse would select
 * the wrong marks in the viz.
 *
 * @param value - The cell, or `undefined` for an unmatched column.
 * @returns The date, or `null` when the cell is a gap or is not a date.
 */
export function toDateValue(value: TableauDataValue | undefined): Date | null {
  const native = value?.nativeValue;
  if (native instanceof Date && !Number.isNaN(native.getTime())) {
    return native;
  }
  return null;
}
