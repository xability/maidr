/**
 * The only module in the Excel adapter that talks to Office.js.
 *
 * It turns a live `Excel.Chart` into an {@link ExcelChartSnapshot} -- plain
 * data, safe to keep after the request context is gone -- and lists the charts
 * a reader can pick from. Everything downstream is pure.
 *
 * Office.js queues every `load` and method call on a request context and runs
 * them on `context.sync()`, one round trip each, so the reads are batched:
 *
 * 1. the chart, its title, its worksheet and its series' names and types;
 * 2. every read series' dimension values, which needs the series from 1, with
 *    the options its chart type is computed from -- a histogram's bins, a box
 *    and whisker chart's quartile calculation, a pie of pie's split -- and
 *    how the chart plots blanks;
 * 3. the axis titles -- only for a chart that has axes, since asking a pie for
 *    its axes is asking for something that is not there;
 * 4. the category range's address (ExcelApi 1.15), and
 * 5. that range's displayed text and the header cell before it;
 * 6. for a bubble chart, the header cell above each series' sizes, the same
 *    way (ExcelApi 1.15);
 * 7. the chart's image.
 *
 * The first two are the data and fail the read when they fail. The rest are
 * labels and a picture: each runs in a sync of its own, so that one Excel
 * declining it costs that one thing and not the chart, and a failure is
 * warned in the console rather than thrown.
 */

import type { ExcelSeriesNeeds } from './converter';
import type {
  ExcelBinOptionsSnapshot,
  ExcelChart,
  ExcelChartBinOptions,
  ExcelChartInfo,
  ExcelChartSeries,
  ExcelChartSeriesDimension,
  ExcelChartSnapshot,
  ExcelClientResult,
  ExcelRange,
  ExcelRequestContext,
  ExcelSeriesSnapshot,
  ExcelTitle,
  ExcelTitleSnapshot,
} from './types';
import { excelSeriesNeeds } from './converter';

const ADAPTER_PREFIX = '[MAIDR excel]';

function warn(message: string, error?: unknown): void {
  if (error === undefined) {
    console.warn(`${ADAPTER_PREFIX} ${message}`);
  } else {
    console.warn(`${ADAPTER_PREFIX} ${message}`, error);
  }
}

/**
 * Options for {@link readExcelChart}.
 */
export interface ExcelReadOptions {
  /**
   * Read the category cells' displayed text and the header cell before them.
   * Needs ExcelApi 1.15: pass `Office.context.requirements.isSetSupported(
   * 'ExcelApi', '1.15')`. Default `false`.
   */
  readonly categoryCells?: boolean;
  /**
   * Read the chart's image as Excel draws it: `true` at the chart's own size,
   * or a width to scale it to. Default `false`.
   */
  readonly image?: boolean | { readonly width?: number };
}

/** A series read, with what reading it needs. */
interface ReadSeries {
  readonly series: ExcelChartSeries;
  readonly needs: ExcelSeriesNeeds;
  readonly values: ReadonlyMap<ExcelChartSeriesDimension, ExcelClientResult<string[]>>;
}

/** A cell address, by its one-based row and column numbers. */
interface CellRange {
  readonly sheet: string;
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/**
 * A column's letters from its one-based number: 1 is `A`, 28 is `AB`.
 *
 * @param column - The column number.
 * @returns The letters.
 */
export function columnLetters(column: number): string {
  let letters = '';
  for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

function columnNumber(letters: string): number {
  return [...letters.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

/** A sheet-qualified A1 range: `Sheet1!$A$2:$A$9`, `'Q1 Sales'!B2`. */
const RANGE_ADDRESS = /^=?(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i;

/**
 * Parse the address `getDimensionDataSourceString` returns for a range.
 *
 * @param text - The address, such as `Sheet1!$A$2:$A$9`.
 * @returns The range, or `null` for anything but one rectangle on one named
 * worksheet: a list of values, several areas, or another workbook's range.
 */
export function parseRangeAddress(text: string): CellRange | null {
  const match = RANGE_ADDRESS.exec(text.trim());
  if (match === null) {
    return null;
  }
  const [, quoted, plain, firstColumn, firstRow, lastColumn, lastRow] = match;
  const sheet = quoted === undefined ? plain : quoted.replace(/''/g, '\'');
  if (sheet.includes('[')) {
    return null;
  }
  const left = columnNumber(firstColumn);
  const top = Number(firstRow);
  const right = lastColumn === undefined ? left : columnNumber(lastColumn);
  const bottom = lastRow === undefined ? top : Number(lastRow);
  return {
    sheet,
    top: Math.min(top, bottom),
    left: Math.min(left, right),
    bottom: Math.max(top, bottom),
    right: Math.max(left, right),
  };
}

function a1(range: Omit<CellRange, 'sheet'>): string {
  return `${columnLetters(range.left)}${range.top}:${columnLetters(range.right)}${range.bottom}`;
}

/**
 * How a category range lays its categories out: one per row, with any further
 * columns as outer label levels, or one per column.
 *
 * Settled by the number of categories the chart has, which only one of the
 * two can match; a range that matches neither is not the chart's categories.
 */
function layoutOf(range: CellRange, count: number): 'rows' | 'columns' | null {
  const rows = range.bottom - range.top + 1;
  const columns = range.right - range.left + 1;
  if (rows === count) {
    return 'rows';
  }
  return columns === count ? 'columns' : null;
}

/**
 * The header cells that name a category range: the row above it when the
 * categories run down the rows, the column before it when they run across.
 *
 * @returns The header's address, or `null` when the range starts at the edge
 * of the sheet and has none.
 */
function headerOf(range: CellRange, layout: 'rows' | 'columns'): string | null {
  if (layout === 'rows') {
    return range.top > 1 ? a1({ ...range, top: range.top - 1, bottom: range.top - 1 }) : null;
  }
  return range.left > 1 ? a1({ ...range, left: range.left - 1, right: range.left - 1 }) : null;
}

/**
 * Each category's label levels, outer first, from the range's displayed text.
 *
 * A range of several label levels -- years beside quarters, regions beside
 * countries -- shows an outer label only where its group starts, so a blank
 * outer cell is the label above it carried down: `2024` over `Q1`, then a
 * blank over `Q2`, is `2024`, `Q2`. A blank is carried only into a category
 * that names something deeper, and only while the levels outside it are the
 * row above's -- a blank after a new outer label starts no branch of the old
 * one -- and a blank with nothing deeper is no level at all.
 *
 * @param text - The range's text, `[row][column]`.
 * @param layout - Whether each category is a row or a column.
 * @returns One list of levels per category, `''` where a level is blank.
 */
export function labelLevels(text: readonly (readonly string[])[], layout: 'rows' | 'columns'): string[][] {
  const categories = layout === 'rows'
    ? text.map(row => [...row])
    : (text[0] ?? []).map((_, column) => text.map(row => row[column] ?? ''));
  let above: readonly string[] = [];
  return categories.map((cells) => {
    const own = cells.map(cell => cell.trim());
    const deepest = own.reduce((last, cell, level) => (cell === '' ? last : level), -1);
    const levels: string[] = [];
    let sameBranch = true;
    own.forEach((cell, level) => {
      if (cell !== '') {
        levels.push(cell);
        sameBranch &&= cell === above[level];
      } else if (level < deepest && sameBranch) {
        levels.push(above[level] ?? '');
      } else {
        levels.push('');
      }
    });
    above = levels;
    return levels;
  });
}

/**
 * One label per category from the range's displayed text: its levels, outer
 * first, joined -- `2024 Q1`, `2024 Q2`.
 *
 * @param text - The range's text, `[row][column]`.
 * @param layout - Whether each category is a row or a column.
 * @returns The labels.
 */
export function joinLabelLevels(text: readonly (readonly string[])[], layout: 'rows' | 'columns'): string[] {
  return labelLevels(text, layout).map(levels => levels.filter(level => level !== '').join(' '));
}

function titleSnapshot(title: ExcelTitle): ExcelTitleSnapshot {
  return { text: title.text, visible: title.visible };
}

/** The bin options a histogram or Pareto reading uses. */
const BIN_PROPERTIES = ['type', 'width', 'count', 'allowOverflow', 'overflowValue', 'allowUnderflow', 'underflowValue'];

/**
 * Queue a series' reads.
 *
 * @returns What will be readable after the sync.
 */
function queueSeries(series: ExcelChartSeries, chartType: string): ReadSeries {
  const needs = excelSeriesNeeds(chartType, series.chartType);
  const values = new Map<ExcelChartSeriesDimension, ExcelClientResult<string[]>>();
  if (needs.dimensions.length > 0) {
    const properties = [
      ...(needs.filtered ? ['filtered'] : []),
      ...(needs.axisGroup ? ['axisGroup'] : []),
      ...(needs.pie ? ['firstSliceAngle'] : []),
      ...(needs.split ? ['splitType', 'splitValue'] : []),
    ];
    if (properties.length > 0) {
      series.load(properties);
    }
    if (needs.bins) {
      series.binOptions.load(BIN_PROPERTIES);
    }
    if (needs.box) {
      series.boxwhiskerOptions.load('quartileCalculation');
    }
    for (const dimension of needs.dimensions) {
      values.set(dimension, series.getDimensionValues(dimension));
    }
  }
  return { series, needs, values };
}

function binSnapshot(options: ExcelChartBinOptions): ExcelBinOptionsSnapshot {
  return {
    type: options.type,
    width: options.width,
    count: options.count,
    allowOverflow: options.allowOverflow,
    overflowValue: options.overflowValue,
    allowUnderflow: options.allowUnderflow,
    underflowValue: options.underflowValue,
  };
}

function seriesSnapshot({ series, needs, values }: ReadSeries): ExcelSeriesSnapshot {
  const read = (dimension: ExcelChartSeriesDimension): readonly string[] | undefined => values.get(dimension)?.value;
  const snapshot: ExcelSeriesSnapshot = {
    name: series.name,
    ...(series.chartType === '' ? {} : { chartType: series.chartType }),
  };
  if (needs.dimensions.length === 0) {
    return snapshot;
  }
  return {
    ...snapshot,
    ...(needs.filtered ? { filtered: series.filtered } : {}),
    ...(needs.axisGroup ? { axisGroup: series.axisGroup === 'Secondary' ? 'Secondary' : 'Primary' } : {}),
    ...(needs.pie ? { firstSliceAngle: series.firstSliceAngle } : {}),
    ...(needs.split ? { splitType: series.splitType, splitValue: series.splitValue } : {}),
    ...(needs.bins ? { binOptions: binSnapshot(series.binOptions) } : {}),
    ...(needs.box ? { quartileCalculation: series.boxwhiskerOptions.quartileCalculation } : {}),
    ...(values.has('Categories') ? { categories: read('Categories'), values: read('Values') } : {}),
    ...(values.has('XValues') ? { xValues: read('XValues'), yValues: read('YValues') } : {}),
    ...(values.has('BubbleSizes') ? { bubbleSizes: read('BubbleSizes') } : {}),
  };
}

/**
 * Read the axis titles, when the chart has axes to ask about: the secondary
 * value axis' only when a series is measured on it, and a 3-D chart's series
 * axis' only for a surface, whose rows it names.
 */
async function readAxes(
  context: ExcelRequestContext,
  chart: ExcelChart,
  secondary: boolean,
  seriesAxis: boolean,
): Promise<ExcelChartSnapshot['axes']> {
  try {
    const category = chart.axes.categoryAxis.title;
    const value = chart.axes.valueAxis.title;
    const second = secondary ? chart.axes.getItem('Value', 'Secondary').title : null;
    const depth = seriesAxis ? chart.axes.seriesAxis.title : null;
    for (const title of [category, value, second, depth]) {
      title?.load(['text', 'visible']);
    }
    await context.sync();
    return {
      category: { title: titleSnapshot(category) },
      value: { title: titleSnapshot(value) },
      ...(second === null ? {} : { secondaryValue: { title: titleSnapshot(second) } }),
      ...(depth === null ? {} : { series: { title: titleSnapshot(depth) } }),
    };
  } catch (error: unknown) {
    warn('could not read the chart\'s axis titles; reading it without them.', error);
    return undefined;
  }
}

/** A header's cells as one label: each level's text, outer first. */
function headerText(range: ExcelRange | null): string {
  return range === null
    ? ''
    : range.text.flat().map(cell => cell.trim()).filter(cell => cell !== '').join(' / ');
}

/**
 * Read the category cells' displayed text and their header (ExcelApi 1.15).
 *
 * @returns The labels, their levels when there are several, and the header,
 * or nothing when the categories are not a range on a worksheet or the range
 * cannot be read.
 */
async function readCategoryCells(
  context: ExcelRequestContext,
  source: ExcelChartSeries,
  count: number,
): Promise<Pick<ExcelChartSnapshot, 'categoryLabels' | 'categoryLevels' | 'categoryHeader'>> {
  try {
    const type = source.getDimensionDataSourceType('Categories');
    const address = source.getDimensionDataSourceString('Categories');
    await context.sync();
    const range = type.value === 'LocalRange' ? parseRangeAddress(address.value) : null;
    const layout = range === null ? null : layoutOf(range, count);
    if (range === null || layout === null) {
      return {};
    }
    const sheet = context.workbook.worksheets.getItemOrNullObject(range.sheet);
    const cells = sheet.getRange(a1(range));
    cells.load('text');
    const headerAddress = headerOf(range, layout);
    const header = headerAddress === null ? null : sheet.getRange(headerAddress);
    header?.load('text');
    await context.sync();
    const levels = labelLevels(cells.text, layout);
    // One header cell per label level, outer first.
    const named = headerText(header);
    return {
      categoryLabels: levels.map(list => list.filter(level => level !== '').join(' ')),
      ...(levels.some(list => list.length > 1) ? { categoryLevels: levels } : {}),
      ...(named === '' ? {} : { categoryHeader: named }),
    };
  } catch (error: unknown) {
    warn('could not read the category cells; reading the categories as the chart returns them.', error);
    return {};
  }
}

/**
 * Read the header cell above each bubble series' sizes (ExcelApi 1.15),
 * which names what a bubble's size measures, the way a category range's
 * header names its axis.
 *
 * @param context - The batch's request context.
 * @param sources - The bubble series.
 * @param counts - How many sizes each has.
 * @returns Each series' header, or `undefined` where there is none to read.
 */
async function readSizeHeaders(
  context: ExcelRequestContext,
  sources: readonly ExcelChartSeries[],
  counts: readonly number[],
): Promise<(string | undefined)[]> {
  try {
    const queued = sources.map(series => ({
      type: series.getDimensionDataSourceType('BubbleSizes'),
      address: series.getDimensionDataSourceString('BubbleSizes'),
    }));
    await context.sync();
    const headers = queued.map(({ type, address }, i) => {
      const range = type.value === 'LocalRange' ? parseRangeAddress(address.value) : null;
      const layout = range === null ? null : layoutOf(range, counts[i]);
      const at = range === null || layout === null ? null : headerOf(range, layout);
      if (range === null || at === null) {
        return null;
      }
      const cell = context.workbook.worksheets.getItemOrNullObject(range.sheet).getRange(at);
      cell.load('text');
      return cell;
    });
    if (headers.every(cell => cell === null)) {
      return sources.map(() => undefined);
    }
    await context.sync();
    return headers.map(cell => headerText(cell) || undefined);
  } catch (error: unknown) {
    warn('could not read the bubble sizes\' header cells; naming the sizes generically.', error);
    return sources.map(() => undefined);
  }
}

async function readImage(
  context: ExcelRequestContext,
  chart: ExcelChart,
  image: true | { readonly width?: number },
): Promise<string | undefined> {
  try {
    const width = image === true ? undefined : image.width;
    const result = width === undefined ? chart.getImage() : chart.getImage(width);
    await context.sync();
    return result.value;
  } catch (error: unknown) {
    warn('could not read the chart\'s image.', error);
    return undefined;
  }
}

/**
 * Read one chart into a snapshot.
 *
 * Needs ExcelApi 1.12, for `ChartSeries.getDimensionValues`; check
 * `Office.context.requirements.isSetSupported('ExcelApi', '1.12')` first.
 *
 * @param context - The batch's request context, from `Excel.run`.
 * @param chart - The chart, from the same context.
 * @param options - Whether to read the category cells and the image too.
 * @returns The snapshot, ready for `convertExcelChart`.
 * @throws Whatever Office.js throws reading the chart or its series' values.
 * The labels and the image never throw: losing one of them is warned, and the
 * snapshot is returned without it.
 *
 * @example
 * ```ts
 * const snapshot = await Excel.run(async (context) => {
 *   const chart = context.workbook.getActiveChartOrNullObject();
 *   return readExcelChart(context, chart);
 * });
 * const maidr = convertExcelChart(snapshot);
 * ```
 */
export async function readExcelChart(
  context: ExcelRequestContext,
  chart: ExcelChart,
  options: ExcelReadOptions = {},
): Promise<ExcelChartSnapshot> {
  chart.load(['id', 'name', 'chartType']);
  chart.title.load(['text', 'visible']);
  chart.worksheet.load('name');
  chart.series.load(['items/name', 'items/chartType']);
  await context.sync();

  const read = chart.series.items.map(series => queueSeries(series, chart.chartType));
  // Only a line, area or scatter reading changes with it, and only those are
  // sure to have it: the chart types Excel 2016 added are not asked.
  const blanks = read.some(one => one.needs.blanks);
  if (blanks) {
    chart.load('displayBlanksAs');
  }
  await context.sync();
  const series = read.map(seriesSnapshot);

  const measured = read.filter((one, i) => one.needs.dimensions.length > 0 && series[i].filtered !== true);
  const axes = measured.some(one => one.needs.axes)
    ? await readAxes(
        context,
        chart,
        series.some(one => one.axisGroup === 'Secondary' && one.filtered !== true),
        measured.some(one => one.needs.seriesAxis),
      )
    : undefined;

  const categorySource = measured.find(one => one.values.has('Categories'));
  const count = categorySource?.values.get('Categories')?.value.length ?? 0;
  const cells = options.categoryCells === true && categorySource !== undefined && count > 0
    ? await readCategoryCells(context, categorySource.series, count)
    : {};

  const sized = options.categoryCells === true ? measured.filter(one => one.values.has('BubbleSizes')) : [];
  const sizeHeaders = sized.length === 0
    ? []
    : await readSizeHeaders(
        context,
        sized.map(one => one.series),
        sized.map(one => one.values.get('BubbleSizes')?.value.length ?? 0),
      );
  const named = series.map((one, i) => {
    const header = sizeHeaders[sized.indexOf(read[i])];
    return header === undefined ? one : { ...one, sizeHeader: header };
  });

  const image = options.image === undefined || options.image === false
    ? undefined
    : await readImage(context, chart, options.image);

  return {
    id: chart.id,
    name: chart.name,
    worksheet: chart.worksheet.name,
    chartType: chart.chartType,
    ...(blanks ? { displayBlanksAs: chart.displayBlanksAs } : {}),
    title: titleSnapshot(chart.title),
    ...(axes === undefined ? {} : { axes }),
    series: named,
    ...cells,
    ...(image === undefined ? {} : { image }),
  };
}

/** A chart a picker offers, with the live chart it was read from. */
export interface FoundChart {
  readonly info: ExcelChartInfo;
  readonly chart: ExcelChart;
}

/**
 * Find every chart on the workbook's visible worksheets, and which one is
 * active.
 *
 * A hidden worksheet's charts are left out: no one can see or activate them.
 *
 * @param context - The batch's request context.
 * @returns The charts, in tab order and then the order Excel lists them in,
 * and the active chart's id, or `null` when no chart is active.
 */
export async function findExcelCharts(
  context: ExcelRequestContext,
): Promise<{ readonly charts: FoundChart[]; readonly activeId: string | null }> {
  const sheets = context.workbook.worksheets;
  sheets.load(['items/id', 'items/name', 'items/visibility']);
  const active = context.workbook.getActiveChartOrNullObject();
  active.load('id');
  await context.sync();

  const visible = sheets.items.filter(sheet => sheet.visibility !== 'Hidden' && sheet.visibility !== 'VeryHidden');
  for (const sheet of visible) {
    sheet.charts.load(['items/id', 'items/name']);
  }
  await context.sync();

  const found = visible.flatMap(sheet => sheet.charts.items.map(chart => ({ sheet, chart })));
  for (const { chart } of found) {
    chart.title.load(['text', 'visible']);
  }
  await context.sync();

  const titles = found.map(({ chart }) =>
    chart.title.visible && chart.title.text.trim() !== '' ? chart.title.text.trim() : undefined);
  const labels = distinct(found.map(({ sheet, chart }, i) => `${sheet.name} - ${titles[i] ?? chart.name}`));
  const charts = found.map(({ sheet, chart }, i) => {
    const title = titles[i];
    const info: ExcelChartInfo = {
      id: chart.id,
      name: chart.name,
      ...(title === undefined ? {} : { title }),
      worksheet: sheet.name,
      worksheetId: sheet.id,
      label: labels[i],
    };
    return { info, chart };
  });
  return { charts, activeId: active.isNullObject === true ? null : active.id };
}

/**
 * Make every label unique, since a picker's options are told apart by their
 * text alone: two charts with one title on one sheet become `Sales - Revenue`
 * and `Sales - Revenue (2)`.
 */
function distinct(labels: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return count === 1 ? label : `${label} (${count})`;
  });
}

/**
 * List every chart on the workbook's visible worksheets, as a picker offers
 * them: `Sheet - title`, or `Sheet - Chart 2` for a chart with no title.
 *
 * @param context - The batch's request context.
 * @returns The charts, in tab order and then the order Excel lists them in.
 */
export async function listExcelCharts(context: ExcelRequestContext): Promise<ExcelChartInfo[]> {
  const { charts } = await findExcelCharts(context);
  return charts.map(({ info }) => info);
}
