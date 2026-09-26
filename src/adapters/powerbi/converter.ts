/**
 * Converts a Power BI `DataView` into MAIDR's schema.
 *
 * Pure: no DOM, no Power BI host, no React. A custom visual calls it from
 * `update()` (through {@link bindPowerBI}, or directly), and the tests call it
 * with plain JSON data views.
 *
 * The conversion runs in two steps. The data view — categorical or table — is
 * first read into one normalized {@link Frame}: a list of category positions,
 * and the measure columns grouped by series, each value carrying the
 * {@link PowerBIDataPointRef} it came from. The frame is then shaped into the
 * layer the visual draws. Keeping the two apart is what lets a table data view
 * and a categorical one become the same layer, and what keeps every navigable
 * position traceable back to the cell it was read from.
 *
 * Where the data view cannot settle a question, the conversion reads smaller
 * rather than guessing: a pie with several series reads the first, a scatter
 * with fewer than two measures is not built, and a missing reading is a gap —
 * never a zero, which would sound like a real low value.
 */

import type {
  AxisConfig,
  BarPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
} from '../../type/grammar';
import type {
  PowerBIAdapterOptions,
  PowerBICategorical,
  PowerBIDataPointRef,
  PowerBIDataView,
  PowerBIMetadataColumn,
  PowerBIPrimitiveValue,
  PowerBIRoleNames,
  PowerBITable,
} from './types';
import { Orientation, TraceType } from '../../type/grammar';

const ADAPTER_PREFIX = '[MAIDR powerbi]';

/**
 * The label Power BI itself shows for an empty category value.
 */
export const BLANK_LABEL = '(Blank)';

const DEFAULT_ROLES: Required<PowerBIRoleNames> = {
  category: 'category',
  series: 'series',
  measure: 'measure',
  x: 'x',
  y: 'y',
};

/**
 * The result of converting one data view.
 *
 * Mirrors the Tableau adapter's `{ maidr, selection }` contract: the schema,
 * plus where every navigable position came from, so a visual can route the
 * reader's position back to its own marks. `maidr.onNavigate` is deliberately
 * not set; wiring it is the binder's job.
 */
export interface PowerBIConversion {
  /** The MAIDR data, ready for `<Maidr data={...}>`. */
  readonly maidr: Maidr;
  /**
   * Layer id → `[row][col]` → the data point at that MAIDR position, for the
   * grid-shaped layers (bar, segmented bar, line, pie). `null` marks a
   * position no mark was drawn for — a blank line sample, or a gap padded to
   * keep a segmented grid rectangular.
   *
   * A segmented (`stacked_bar` / `dodged_bar`) layer's rows are its series.
   * MAIDR appends one more row after them, the per-category sum, which has no
   * entry here: {@link resolvePowerBIDataPoints} reads it as every segment of
   * that category.
   */
  readonly cells: ReadonlyMap<string, readonly (readonly (PowerBIDataPointRef | null)[])[]>;
  /** Layer id → per-point data point, for scatter layers. */
  readonly points: ReadonlyMap<string, readonly (PowerBIDataPointRef | null)[]>;
}

/**
 * A MAIDR position, as `onNavigate` reports it.
 */
export interface PowerBINavigateInfo {
  readonly layerId: string;
  readonly row: number;
  readonly col: number;
  readonly pointIndices?: readonly number[];
}

/** A category value as MAIDR reads it: a label, or a number on a numeric axis. */
type CategoryKey = string | number;

/** One measure column, its values laid out along the frame's positions. */
interface FrameColumn {
  readonly source: PowerBIMetadataColumn;
  /** `values[i]` is the reading at position `i`; `undefined` where none. */
  readonly values: readonly PowerBIPrimitiveValue[];
  /** `refs[i]` is where `values[i]` came from; `null` where there is none. */
  readonly refs: readonly (PowerBIDataPointRef | null)[];
}

/** The measure columns that belong to one series. */
interface FrameSeries {
  /** The series label, or `null` for the one series of an ungrouped view. */
  readonly name: string | null;
  readonly columns: readonly FrameColumn[];
}

/**
 * A data view read into one shape, whichever mapping it came from.
 */
interface Frame {
  /** The category field, or `null` when none is bound. */
  readonly category: PowerBIMetadataColumn | null;
  /** The category of each position; empty when there is no category field. */
  readonly keys: readonly CategoryKey[];
  /** How many positions every column is laid out over. */
  readonly length: number;
  /** The series (legend) field, or `null` when the values are ungrouped. */
  readonly seriesField: PowerBIMetadataColumn | null;
  readonly series: readonly FrameSeries[];
}

/** One series of one layer, ready to be shaped into points. */
interface Line {
  readonly name: string | null;
  readonly column: FrameColumn;
}

function warn(message: string): void {
  console.warn(`${ADAPTER_PREFIX} ${message}`);
}

function hasRole(column: PowerBIMetadataColumn, role: string): boolean {
  return column.roles?.[role] === true;
}

/**
 * Read a measure value as a finite number, or `null` for a gap.
 *
 * `null` and blank come back as `null`, never `0`: a zero is a reading, and
 * sonifying a blank as one would put a mark where the report has none.
 *
 * @param value - The cell value.
 * @returns The number, or `null` when the cell holds none.
 */
export function toFiniteNumber(value: PowerBIPrimitiveValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Read a category value as the label MAIDR announces.
 *
 * A date reads as `YYYY-MM-DD` in the report's local time — Power BI hands
 * dates over as local `Date`s — with the time appended only when it is not
 * midnight, and to the precision it carries: two readings a few seconds
 * apart must not be announced as the same minute. Numbers stay numbers, so a numeric axis keeps its order and a line
 * over it keeps its spacing.
 *
 * @param value - The cell value.
 * @returns The label, or {@link BLANK_LABEL} for an empty cell.
 */
export function toCategoryKey(value: PowerBIPrimitiveValue): CategoryKey {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return BLANK_LABEL;
    }
    const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    const hours = value.getHours();
    const minutes = value.getMinutes();
    const seconds = value.getSeconds();
    const millis = value.getMilliseconds();
    if (hours === 0 && minutes === 0 && seconds === 0 && millis === 0) {
      return date;
    }
    let time = `${pad(hours)}:${pad(minutes)}`;
    if (seconds !== 0 || millis !== 0) {
      time += `:${pad(seconds)}`;
    }
    if (millis !== 0) {
      time += `.${String(millis).padStart(3, '0')}`;
    }
    return `${date} ${time}`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (value === null || value === undefined || value === '') {
    return BLANK_LABEL;
  }
  return String(value);
}

function toLabel(value: PowerBIPrimitiveValue): string {
  return String(toCategoryKey(value));
}

/**
 * Pick the column bound to a role, or fall back to the first candidate.
 */
function pickByRole<T extends { readonly source: PowerBIMetadataColumn }>(
  columns: readonly T[],
  role: string,
): T | undefined {
  return columns.find(column => hasRole(column.source, role)) ?? columns[0];
}

/**
 * Read a categorical data view into a frame.
 *
 * With a series field bound, Power BI emits one value column per
 * (series value, measure) pair, each tagged with the series value in
 * `source.groupName`; they are regrouped here by that tag, in the order they
 * first appear, which is the order the legend draws them.
 */
function frameFromCategorical(categorical: PowerBICategorical, roles: Required<PowerBIRoleNames>): Frame | null {
  const categoryColumns = categorical.categories ?? [];
  const categoryColumn = pickByRole(categoryColumns, roles.category) ?? null;
  if (categoryColumns.length > 1) {
    warn(
      `${categoryColumns.length} category fields are bound; reading `
      + `"${categoryColumn?.source.displayName}" and ignoring the rest. `
      + `A visual that declares drilldown on the category role can drill down to read the next level.`,
    );
  }

  const valueColumns = categorical.values ?? [];
  if (valueColumns.length === 0) {
    return null;
  }

  const keys = categoryColumn === null ? [] : categoryColumn.values.map(toCategoryKey);
  const length = categoryColumn === null
    ? Math.max(0, ...valueColumns.map(column => column.values.length))
    : keys.length;
  if (length === 0) {
    return null;
  }

  const frameColumns: FrameColumn[] = valueColumns.map((column, valueColumnIndex) => ({
    source: column.source,
    values: Array.from({ length }, (_, i) => column.values[i]),
    refs: Array.from({ length }, (_, i) => ({
      kind: 'categorical' as const,
      categoryIndex: categoryColumn === null ? null : i,
      valueColumnIndex,
    })),
  }));

  const seriesField = valueColumns.source ?? null;
  if (seriesField === null) {
    return { category: categoryColumn?.source ?? null, keys, length, seriesField, series: [{ name: null, columns: frameColumns }] };
  }

  const groups = new Map<string, FrameColumn[]>();
  frameColumns.forEach((column) => {
    const name = toLabel(column.source.groupName);
    const group = groups.get(name);
    if (group === undefined) {
      groups.set(name, [column]);
    } else {
      group.push(column);
    }
  });

  return {
    category: categoryColumn?.source ?? null,
    keys,
    length,
    seriesField,
    series: [...groups].map(([name, columns]) => ({ name, columns })),
  };
}

/**
 * The order to lay distinct category values out in.
 *
 * Ascending for an axis that is all numbers or all dates, blanks last; the
 * order given otherwise.
 *
 * @param raws - The distinct raw values, in first-appearance order.
 * @returns Indices into `raws`, in the order to lay them out.
 */
function axisOrder(raws: readonly PowerBIPrimitiveValue[]): number[] {
  const indices = raws.map((_, i) => i);
  const present = raws.filter(raw => raw !== null && raw !== undefined && raw !== '');
  const numeric = present.every(raw => typeof raw === 'number' && Number.isFinite(raw));
  const dated = present.every(raw => raw instanceof Date && !Number.isNaN(raw.getTime()));
  if (present.length === 0 || (!numeric && !dated)) {
    return indices;
  }
  const valueOf = (raw: PowerBIPrimitiveValue): number =>
    raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw : Number.POSITIVE_INFINITY;
  return indices.sort((a, b) => valueOf(raws[a]) - valueOf(raws[b]) || a - b);
}

/**
 * Read a table data view into a frame.
 *
 * The category and series fields are found by role, and failing that the
 * category is the first non-measure column. Rows are pivoted onto one position
 * per distinct category and one series per distinct series value (first
 * appearance order). A numeric or date category is put in axis order, since a
 * table's rows follow the query's sort, which need not be the category's —
 * rows sorted by series first would otherwise run a line Feb, Mar, Jan. A text
 * category keeps the order of the rows, which is the order the visual sorts
 * by. When a (category, series) pair repeats, the first row wins:
 * summing would report a total the visual never drew.
 */
function frameFromTable(table: PowerBITable, roles: Required<PowerBIRoleNames>): Frame | null {
  const rows = table.rows ?? [];
  if (rows.length === 0) {
    return null;
  }
  const columns = table.columns.map((source, index) => ({ source, index }));

  const isMeasureColumn = (column: PowerBIMetadataColumn): boolean =>
    column.isMeasure === true
    || hasRole(column, roles.measure)
    || hasRole(column, roles.x)
    || hasRole(column, roles.y);

  const seriesColumn = columns.find(c => hasRole(c.source, roles.series)) ?? null;
  const categoryColumn = columns.find(c => hasRole(c.source, roles.category))
    ?? columns.find(c => c !== seriesColumn && !isMeasureColumn(c.source) && c.source.type?.numeric !== true)
    ?? null;
  const measureColumns = columns.filter(c =>
    c !== seriesColumn
    && c !== categoryColumn
    && (isMeasureColumn(c.source) || c.source.type?.numeric === true));
  if (measureColumns.length === 0) {
    return null;
  }

  // Positions: one per distinct category, or one per row when there is none.
  // Keyed by the raw value rather than its label, so formatting can never
  // merge two categories into one.
  const positionOf = new Map<string, number>();
  const raws: PowerBIPrimitiveValue[] = [];
  const firstPosition = rows.map((row, rowIndex) => {
    if (categoryColumn === null) {
      return rowIndex;
    }
    const raw = row[categoryColumn.index];
    const id = raw instanceof Date ? `date:${raw.getTime()}` : `${typeof raw}:${String(raw)}`;
    let position = positionOf.get(id);
    if (position === undefined) {
      position = raws.length;
      positionOf.set(id, position);
      raws.push(raw);
    }
    return position;
  });
  const order = axisOrder(raws);
  const rank = new Map(order.map((position, sorted) => [position, sorted]));
  const rowPosition = firstPosition.map(position =>
    categoryColumn === null ? position : rank.get(position) ?? position);
  const keys = order.map(position => toCategoryKey(raws[position]));
  const length = categoryColumn === null ? rows.length : keys.length;

  const seriesNames: (string | null)[] = [];
  const seriesIndex = new Map<string, number>();
  const rowSeries = rows.map((row) => {
    if (seriesColumn === null) {
      if (seriesNames.length === 0) {
        seriesNames.push(null);
      }
      return 0;
    }
    const name = toLabel(row[seriesColumn.index]);
    let index = seriesIndex.get(name);
    if (index === undefined) {
      index = seriesNames.length;
      seriesIndex.set(name, index);
      seriesNames.push(name);
    }
    return index;
  });

  const series: FrameSeries[] = seriesNames.map((name, s) => ({
    name,
    columns: measureColumns.map((measure) => {
      const values: PowerBIPrimitiveValue[] = Array.from({ length }, () => undefined);
      const refs: (PowerBIDataPointRef | null)[] = Array.from({ length }, () => null);
      rows.forEach((row, rowIndex) => {
        const position = rowPosition[rowIndex];
        if (rowSeries[rowIndex] !== s || refs[position] !== null) {
          return;
        }
        values[position] = row[measure.index];
        refs[position] = { kind: 'table', rowIndex };
      });
      return { source: measure.source, values, refs };
    }),
  }));

  return {
    category: categoryColumn?.source ?? null,
    keys: categoryColumn === null ? [] : keys,
    length,
    seriesField: seriesColumn?.source ?? null,
    series,
  };
}

/**
 * The series a bar, line or pie layer draws.
 *
 * Grouped by a series field: one line per series, reading the column bound to
 * the measure role (or the first). Ungrouped: one line per measure column,
 * named after the measure — what a clustered column chart with two measures in
 * its Values well draws.
 */
function linesOf(frame: Frame, roles: Required<PowerBIRoleNames>): Line[] {
  if (frame.seriesField === null) {
    const columns = frame.series[0]?.columns ?? [];
    const measures = columns.filter(c => hasRole(c.source, roles.measure));
    return (measures.length > 0 ? measures : columns).map(column => ({
      name: columns.length > 1 ? column.source.displayName : null,
      column,
    }));
  }
  return frame.series.flatMap((series) => {
    const column = pickByRole(series.columns, roles.measure);
    return column === undefined ? [] : [{ name: series.name, column }];
  });
}

function axisConfig(label: string | undefined): AxisConfig | undefined {
  return label === undefined || label === '' ? undefined : { label };
}

function buildAxes(
  x: string | undefined,
  y: string | undefined,
  z: string | undefined,
  options: PowerBIAdapterOptions,
): MaidrLayer['axes'] {
  const axes: { x?: AxisConfig; y?: AxisConfig; z?: AxisConfig } = {};
  const xAxis = axisConfig(options.axes?.x ?? x);
  const yAxis = axisConfig(options.axes?.y ?? y);
  const zAxis = axisConfig(z);
  if (xAxis) {
    axes.x = xAxis;
  }
  if (yAxis) {
    axes.y = yAxis;
  }
  if (zAxis) {
    axes.z = zAxis;
  }
  return axes;
}

/** A layer and the refs of its positions. */
interface BuiltLayer {
  readonly layer: MaidrLayer;
  readonly cells?: (PowerBIDataPointRef | null)[][];
  readonly points?: (PowerBIDataPointRef | null)[];
  readonly legend?: string[];
}

/** The measure name shared by every line, or `undefined` when they differ. */
function sharedMeasureName(lines: readonly Line[]): string | undefined {
  const names = new Set(lines.map(line => line.column.source.displayName));
  return names.size === 1 ? [...names][0] : undefined;
}

/**
 * Whether a chart with no category field has more rows than it can show.
 *
 * With no category, one mark stands for a whole series and reads its single
 * value. A table view with several rows and no column recognisable as the
 * category (only numeric columns, none bound to a role) is not that chart:
 * reading the first row alone would drop the rest without a word.
 */
function tooManyRowsWithoutCategory(frame: Frame): boolean {
  if (frame.category !== null || frame.length <= 1) {
    return false;
  }
  warn(
    `${frame.length} rows but no category field to lay them out along; `
    + `bind the category role, or give the table a text or date column.`,
  );
  return true;
}

function buildBar(frame: Frame, lines: readonly Line[], options: PowerBIAdapterOptions): BuiltLayer | null {
  const horizontal = options.chartType === 'bar';
  const orientation = horizontal ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  const categoryName = frame.category?.displayName;
  const measureName = sharedMeasureName(lines);
  const [x, y] = horizontal ? [measureName, categoryName] : [categoryName, measureName];

  // No category field: Power BI draws one bar per series (or per measure),
  // which is a plain bar chart whose categories are the series.
  if (frame.category === null) {
    if (tooManyRowsWithoutCategory(frame)) {
      return null;
    }
    const data: BarPoint[] = [];
    const refs: (PowerBIDataPointRef | null)[] = [];
    for (const line of lines) {
      const magnitude = toFiniteNumber(line.column.values[0]);
      if (magnitude === null) {
        continue;
      }
      const key = line.name ?? line.column.source.displayName;
      data.push(horizontal ? { x: magnitude, y: key } : { x: key, y: magnitude });
      refs.push(line.column.refs[0]);
    }
    if (data.length === 0) {
      return null;
    }
    const seriesName = frame.seriesField?.displayName;
    const [bx, by] = horizontal ? [measureName, seriesName] : [seriesName, measureName];
    return {
      layer: { id: '0', type: TraceType.BAR, orientation, axes: buildAxes(bx, by, undefined, options), data },
      cells: [refs],
    };
  }
  const keys = frame.keys;

  if (lines.length === 1) {
    const { column } = lines[0];
    const data: BarPoint[] = [];
    const refs: (PowerBIDataPointRef | null)[] = [];
    // A gap is skipped rather than drawn at zero: Power BI draws no bar there.
    for (let i = 0; i < frame.length; i++) {
      const magnitude = toFiniteNumber(column.values[i]);
      if (magnitude === null) {
        continue;
      }
      const key = keys[i] ?? BLANK_LABEL;
      data.push(horizontal ? { x: magnitude, y: key } : { x: key, y: magnitude });
      refs.push(column.refs[i]);
    }
    if (data.length === 0) {
      return null;
    }
    return {
      layer: {
        id: '0',
        type: TraceType.BAR,
        orientation,
        axes: buildAxes(x, y, undefined, options),
        data,
      },
      cells: [refs],
    };
  }

  // Several series: a rectangular grid, `[series][category]`. A missing
  // reading is padded with NaN — MAIDR's gap sentinel, announced as missing
  // and left silent — because `SegmentedTrace` sums across series by index
  // and needs every row the same length.
  const data: SegmentedPoint[][] = [];
  const cells: (PowerBIDataPointRef | null)[][] = [];
  let measured = false;
  for (const line of lines) {
    const name = line.name ?? line.column.source.displayName;
    const row: SegmentedPoint[] = [];
    const rowRefs: (PowerBIDataPointRef | null)[] = [];
    for (let i = 0; i < frame.length; i++) {
      const magnitude = toFiniteNumber(line.column.values[i]);
      measured ||= magnitude !== null;
      const value = magnitude ?? Number.NaN;
      const key = keys[i] ?? BLANK_LABEL;
      row.push(horizontal ? { x: value, y: key, z: name } : { x: key, y: value, z: name });
      rowRefs.push(magnitude === null ? null : line.column.refs[i]);
    }
    data.push(row);
    cells.push(rowRefs);
  }
  if (!measured) {
    return null;
  }
  return {
    layer: {
      id: '0',
      type: options.barMode === 'stacked' ? TraceType.STACKED : TraceType.DODGED,
      orientation,
      axes: buildAxes(x, y, frame.seriesField?.displayName, options),
      data,
    },
    cells,
    legend: lines.map(line => line.name ?? line.column.source.displayName),
  };
}

function buildLine(frame: Frame, lines: readonly Line[], options: PowerBIAdapterOptions): BuiltLayer | null {
  if (frame.category === null) {
    warn('a line needs a category field to run along; nothing to read.');
    return null;
  }
  const named = lines.length > 1;
  const data: LinePoint[][] = [];
  const cells: (PowerBIDataPointRef | null)[][] = [];
  for (const line of lines) {
    const points: LinePoint[] = [];
    const refs: (PowerBIDataPointRef | null)[] = [];
    for (let i = 0; i < frame.length; i++) {
      const y = toFiniteNumber(line.column.values[i]);
      const point: LinePoint = { x: frame.keys[i], y };
      if (named) {
        point.z = line.name ?? line.column.source.displayName;
      }
      points.push(point);
      // A gap stays in the line — `LineTrace` announces it as missing at its
      // own position — but no marker is drawn there, so it names no data
      // point, the same as a padded cell of a segmented bar.
      refs.push(y === null ? null : line.column.refs[i]);
    }
    data.push(points);
    cells.push(refs);
  }
  if (!data.some(points => points.some(point => point.y !== null))) {
    return null;
  }
  return {
    layer: {
      id: '0',
      type: TraceType.LINE,
      axes: buildAxes(frame.category.displayName, sharedMeasureName(lines), frame.seriesField?.displayName, options),
      data,
    },
    cells,
    ...(named ? { legend: lines.map(line => line.name ?? line.column.source.displayName) } : {}),
  };
}

function buildPie(frame: Frame, lines: readonly Line[], options: PowerBIAdapterOptions): BuiltLayer | null {
  const slices: { label: CategoryKey; value: PowerBIPrimitiveValue; ref: PowerBIDataPointRef | null }[] = [];
  let labelName: string | undefined;
  if (frame.category !== null) {
    if (lines.length > 1) {
      warn(`a pie reads one series; reading "${lines[0].name}" and ignoring ${lines.length - 1} more.`);
    }
    const { column } = lines[0];
    labelName = frame.category.displayName;
    for (let i = 0; i < frame.length; i++) {
      slices.push({ label: frame.keys[i], value: column.values[i], ref: column.refs[i] });
    }
  } else {
    // No category: each series (or, ungrouped, each measure) is a slice.
    if (tooManyRowsWithoutCategory(frame)) {
      return null;
    }
    labelName = frame.seriesField?.displayName;
    for (const line of lines) {
      slices.push({
        label: line.name ?? line.column.source.displayName,
        value: line.column.values[0],
        ref: line.column.refs[0],
      });
    }
  }

  const data: PiePoint[] = [];
  const refs: (PowerBIDataPointRef | null)[] = [];
  let negative = 0;
  for (const slice of slices) {
    const value = toFiniteNumber(slice.value);
    // Power BI draws no slice for a blank, a zero or a negative value.
    if (value === null || value <= 0) {
      negative += value !== null && value < 0 ? 1 : 0;
      continue;
    }
    data.push({ x: slice.label, y: value });
    refs.push(slice.ref);
  }
  if (negative > 0) {
    warn(`${negative} negative value(s) have no slice in a pie; skipping them.`);
  }
  if (data.length === 0) {
    return null;
  }
  return {
    layer: {
      id: '0',
      type: TraceType.PIE,
      axes: buildAxes(labelName, sharedMeasureName(lines), undefined, options),
      data,
    },
    cells: [refs],
  };
}

/**
 * Build one scatter layer per series.
 *
 * The x and y measures are found by role, falling back to the first two
 * measure columns. A point missing either coordinate is dropped: there is no
 * position to place it at. The category, when bound, is what the point *is*
 * (Power BI's Details well) and becomes its `label`.
 */
function buildScatter(frame: Frame, options: PowerBIAdapterOptions, roles: Required<PowerBIRoleNames>): BuiltLayer[] {
  const built: BuiltLayer[] = [];
  for (const series of frame.series) {
    const xColumn = series.columns.find(c => hasRole(c.source, roles.x));
    const yColumn = series.columns.find(c => hasRole(c.source, roles.y));
    const rest = series.columns.filter(c => c !== xColumn && c !== yColumn);
    const x = xColumn ?? rest.shift();
    const y = yColumn ?? rest.shift();
    if (x === undefined || y === undefined) {
      warn('a scatter needs two measures, one for each axis; nothing to read.');
      return [];
    }

    const data: ScatterPoint[] = [];
    const refs: (PowerBIDataPointRef | null)[] = [];
    for (let i = 0; i < frame.length; i++) {
      const px = toFiniteNumber(x.values[i]);
      const py = toFiniteNumber(y.values[i]);
      if (px === null || py === null) {
        continue;
      }
      const point: ScatterPoint = { x: px, y: py };
      if (frame.category !== null) {
        point.label = String(frame.keys[i]);
      }
      data.push(point);
      refs.push(x.refs[i] ?? y.refs[i]);
    }
    if (data.length === 0) {
      continue;
    }
    const layer: MaidrLayer = {
      id: String(built.length),
      type: TraceType.SCATTER,
      axes: buildAxes(x.source.displayName, y.source.displayName, undefined, options),
      data,
    };
    if (series.name !== null) {
      layer.name = series.name;
    }
    built.push({ layer, points: refs });
  }
  return built;
}

let figureCounter = 0;

/**
 * A figure id no other Power BI figure on the page has.
 *
 * @returns `maidr-powerbi-<n>`.
 */
export function nextFigureId(): string {
  figureCounter += 1;
  return `maidr-powerbi-${figureCounter}`;
}

/**
 * Convert a Power BI data view into a MAIDR figure.
 *
 * @param dataView - `options.dataViews[0]` from the visual's `update()`.
 * @param options - What the visual draws, and how to label it.
 * @returns The figure and the data point behind every position, or `null`
 * when the data view holds nothing MAIDR can navigate — no fields bound yet,
 * no rows, or every reading blank. A visual shows its own empty state then.
 *
 * @example
 * ```ts
 * const conversion = convertPowerBIDataView(options.dataViews[0], {
 *   chartType: 'column',
 *   title: 'Sales by region',
 * });
 * ```
 */
export function convertPowerBIDataView(
  dataView: PowerBIDataView | undefined,
  options: PowerBIAdapterOptions,
): PowerBIConversion | null {
  if (dataView === undefined) {
    return null;
  }
  const roles = { ...DEFAULT_ROLES, ...options.roles };
  const frame = dataView.categorical !== undefined
    ? frameFromCategorical(dataView.categorical, roles)
    : dataView.table !== undefined
      ? frameFromTable(dataView.table, roles)
      : null;
  if (frame === null) {
    return null;
  }

  let built: BuiltLayer[];
  switch (options.chartType) {
    case 'column':
    case 'bar':
    case 'line':
    case 'pie':
    case 'donut': {
      const lines = linesOf(frame, roles);
      if (lines.length === 0) {
        return null;
      }
      const layer = options.chartType === 'line'
        ? buildLine(frame, lines, options)
        : options.chartType === 'pie' || options.chartType === 'donut'
          ? buildPie(frame, lines, options)
          : buildBar(frame, lines, options);
      built = layer === null ? [] : [layer];
      break;
    }
    case 'scatter':
      built = buildScatter(frame, options, roles);
      break;
    default:
      warn(`unsupported chart type "${options.chartType as string}".`);
      return null;
  }
  if (built.length === 0) {
    return null;
  }

  const cells = new Map<string, (PowerBIDataPointRef | null)[][]>();
  const points = new Map<string, (PowerBIDataPointRef | null)[]>();
  for (const { layer, cells: layerCells, points: layerPoints } of built) {
    if (options.title !== undefined) {
      layer.title = options.title;
    }
    if (layerCells) {
      cells.set(layer.id, layerCells);
    }
    if (layerPoints) {
      points.set(layer.id, layerPoints);
    }
  }

  const subplot: MaidrSubplot = { layers: built.map(b => b.layer) };
  const legend = built.length > 1
    ? built.map(b => b.layer.name ?? b.layer.id)
    : built[0].legend;
  if (legend !== undefined) {
    subplot.legend = legend;
  }

  const maidr: Maidr = {
    id: options.id ?? nextFigureId(),
    subplots: [[subplot]],
  };
  if (options.title !== undefined) {
    maidr.title = options.title;
  }
  if (options.subtitle !== undefined) {
    maidr.subtitle = options.subtitle;
  }
  if (options.caption !== undefined) {
    maidr.caption = options.caption;
  }

  return { maidr, cells, points };
}

/**
 * Resolve a MAIDR position to the data points it stands for.
 *
 * @param conversion - The conversion the position was reported against.
 * @param info - The position, as `onNavigate` reports it.
 * @returns The data points under the cursor: one for a bar, a slice or a line
 * sample, any number for a scatter (points that share a position are read
 * together) or for a segmented bar's summary row (every segment of the
 * category), and none for a gap or an unknown layer.
 */
export function resolvePowerBIDataPoints(
  conversion: PowerBIConversion,
  info: PowerBINavigateInfo,
): PowerBIDataPointRef[] {
  const points = conversion.points.get(info.layerId);
  if (points !== undefined) {
    return (info.pointIndices ?? [])
      .map(index => points[index])
      .filter((ref): ref is PowerBIDataPointRef => ref !== null && ref !== undefined);
  }
  const rows = conversion.cells.get(info.layerId);
  if (rows === undefined) {
    return [];
  }
  // `SegmentedTrace` appends a summary row after the series, and a reader who
  // moves onto it hears the category's total: every segment of that category
  // is what the position stands for.
  if (info.row === rows.length && isSegmentedLayer(conversion.maidr, info.layerId)) {
    return rows
      .map(row => row[info.col])
      .filter((ref): ref is PowerBIDataPointRef => ref !== null && ref !== undefined);
  }
  const ref = rows[info.row]?.[info.col];
  return ref === null || ref === undefined ? [] : [ref];
}

/**
 * Whether a layer is one `SegmentedTrace` navigates, and so has a summary row.
 */
function isSegmentedLayer(maidr: Maidr, layerId: string): boolean {
  return maidr.subplots.some(row => row.some(subplot => subplot.layers.some(layer =>
    layer.id === layerId
    && (layer.type === TraceType.STACKED || layer.type === TraceType.DODGED))));
}
