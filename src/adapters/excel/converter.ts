/**
 * Converts a snapshot of a native Excel chart into MAIDR's schema.
 *
 * Pure: no DOM, no Office.js, no React. The reader produces the snapshot, the
 * binder hands it here, and the tests call it with plain objects.
 *
 * What a series becomes is decided by what Excel draws it as, `Excel.ChartType`
 * read into a {@link Family}. A 3-D, cylinder, cone or pyramid chart reads as
 * the flat chart it is a variant of: depth and bar shape are decoration, not
 * data. In a combo chart every series carries its own type, so the series are
 * grouped by family (and by the value axis they are measured on) and each
 * group becomes one layer of the same subplot -- a column series and a line
 * series are a bar layer and a line layer.
 *
 * Every chart type Excel names has a reading. Some draw what Excel computed
 * from the data rather than the data itself -- a histogram's bins, a box's
 * quartiles, a Pareto chart's order -- and Office.js hands over only the data,
 * so those are computed again here, by the rules Microsoft documents for them
 * (`./statistics`). Where the snapshot cannot settle a question, the reading
 * is smaller rather than wrong, after the Power BI adapter's rules: a pie reads
 * its first series, and a blank is a gap, never a zero, unless the chart says
 * to plot blanks as zero.
 */

import type {
  AxisConfig,
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  ChoroplethPoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  TreemapPoint,
  WaterfallPoint,
} from '../../type/grammar';
import type { BinRule, QuartileMethod } from './statistics';
import type {
  ExcelBinOptionsSnapshot,
  ExcelChartSeriesDimension,
  ExcelChartSnapshot,
  ExcelConvertOptions,
  ExcelSeriesSnapshot,
  ExcelTitleSnapshot,
} from './types';
import { Orientation, TraceType } from '../../type/grammar';
import { binValues, boxSummary, tidy } from './statistics';

const ADAPTER_PREFIX = '[MAIDR excel]';

/**
 * What a blank category cell is announced as: Excel draws no label there, and
 * an empty announcement would sound like nothing was read.
 */
export const BLANK_LABEL = '(blank)';

/** The slice a pie of pie or bar of pie gathers its split-off points into. */
const OTHER_LABEL = 'Other';

/** What a bubble's size is called when no header cell names it. */
const SIZE_LABEL = 'Bubble size';

/** What a histogram's or Pareto chart's bars count, when no axis title says. */
const COUNT_LABEL = 'Count';

/** The line a Pareto chart draws over its bars. */
const CUMULATIVE_LABEL = 'Cumulative percentage';

/**
 * A Pareto line's values are shares of the whole, from 0 to 1, read as
 * percentages through MAIDR's own percent format rather than a `function`
 * string, which a page's content security policy may refuse to run.
 */
const PERCENT_FORMAT = { type: 'percent', decimals: 1 } as const;

/** How the series of a bar or column chart share a category. */
type BarMode = 'clustered' | 'stacked' | 'stacked100';

/** How the bands of an area chart relate. */
type AreaMode = 'plain' | 'stacked' | 'stacked100';

/** How a blank value is read: as a gap, or as the zero the chart plots. */
type Blanks = 'gap' | 'zero';

/**
 * What a series is drawn as, read as the reading MAIDR gives it.
 *
 * `unsupported` carries why, for the console: the reader hears only that the
 * chart cannot be read.
 */
type Family
  = | { readonly kind: 'bar'; readonly mode: BarMode; readonly horizontal: boolean }
    | { readonly kind: 'line'; readonly stack?: 'stacked' | 'stacked100' }
    | { readonly kind: 'area'; readonly mode: AreaMode }
    | { readonly kind: 'pie' }
    | { readonly kind: 'scatter'; readonly lines: boolean }
    | { readonly kind: 'bubble' }
    | { readonly kind: 'radar' }
    | { readonly kind: 'funnel' }
    | WholeFamily
    | { readonly kind: 'unsupported'; readonly reason: string };

/**
 * The families that are a whole chart of their own -- read from every series
 * of the chart together, never one layer of a combo chart among others.
 */
type WholeFamily
  = | { readonly kind: 'ofPie'; readonly second: 'pie' | 'bar' }
    | { readonly kind: 'stock'; readonly open: boolean; readonly volume: boolean }
    | { readonly kind: 'surface' }
    | { readonly kind: 'histogram' }
    | { readonly kind: 'pareto' }
    | { readonly kind: 'box' }
    | { readonly kind: 'waterfall' }
    | { readonly kind: 'hierarchy'; readonly type: TraceType.TREEMAP | TraceType.SUNBURST }
    | { readonly kind: 'map' };

const WHOLE_KINDS: ReadonlySet<Family['kind']> = new Set([
  'ofPie',
  'stock',
  'surface',
  'histogram',
  'pareto',
  'box',
  'waterfall',
  'hierarchy',
  'map',
]);

function isWhole(family: Family): family is WholeFamily {
  return WHOLE_KINDS.has(family.kind);
}

/** The chart families every flat chart type and its 3-D variants read as. */
const FAMILIES: Readonly<Record<string, Family>> = {
  ColumnClustered: { kind: 'bar', mode: 'clustered', horizontal: false },
  ColumnStacked: { kind: 'bar', mode: 'stacked', horizontal: false },
  ColumnStacked100: { kind: 'bar', mode: 'stacked100', horizontal: false },
  BarClustered: { kind: 'bar', mode: 'clustered', horizontal: true },
  BarStacked: { kind: 'bar', mode: 'stacked', horizontal: true },
  BarStacked100: { kind: 'bar', mode: 'stacked100', horizontal: true },
  Line: { kind: 'line' },
  LineMarkers: { kind: 'line' },
  LineStacked: { kind: 'line', stack: 'stacked' },
  LineMarkersStacked: { kind: 'line', stack: 'stacked' },
  LineStacked100: { kind: 'line', stack: 'stacked100' },
  LineMarkersStacked100: { kind: 'line', stack: 'stacked100' },
  Area: { kind: 'area', mode: 'plain' },
  AreaStacked: { kind: 'area', mode: 'stacked' },
  AreaStacked100: { kind: 'area', mode: 'stacked100' },
  Pie: { kind: 'pie' },
  PieExploded: { kind: 'pie' },
  Doughnut: { kind: 'pie' },
  DoughnutExploded: { kind: 'pie' },
  PieOfPie: { kind: 'ofPie', second: 'pie' },
  BarOfPie: { kind: 'ofPie', second: 'bar' },
  XYScatter: { kind: 'scatter', lines: false },
  XYScatterLines: { kind: 'scatter', lines: true },
  XYScatterLinesNoMarkers: { kind: 'scatter', lines: true },
  XYScatterSmooth: { kind: 'scatter', lines: true },
  XYScatterSmoothNoMarkers: { kind: 'scatter', lines: true },
  Bubble: { kind: 'bubble' },
  Bubble3DEffect: { kind: 'bubble' },
  Radar: { kind: 'radar' },
  RadarMarkers: { kind: 'radar' },
  RadarFilled: { kind: 'radar' },
  Funnel: { kind: 'funnel' },
  StockHLC: { kind: 'stock', open: false, volume: false },
  StockOHLC: { kind: 'stock', open: true, volume: false },
  StockVHLC: { kind: 'stock', open: false, volume: true },
  StockVOHLC: { kind: 'stock', open: true, volume: true },
  Surface: { kind: 'surface' },
  SurfaceWireframe: { kind: 'surface' },
  SurfaceTopView: { kind: 'surface' },
  SurfaceTopViewWireframe: { kind: 'surface' },
  Histogram: { kind: 'histogram' },
  Pareto: { kind: 'pareto' },
  Boxwhisker: { kind: 'box' },
  Waterfall: { kind: 'waterfall' },
  Treemap: { kind: 'hierarchy', type: TraceType.TREEMAP },
  Sunburst: { kind: 'hierarchy', type: TraceType.SUNBURST },
  RegionMap: { kind: 'map' },
};

/**
 * What a chart type is called in a message, as Excel's Insert Chart dialog
 * names it, where the enum name split into words would not say it.
 */
const TYPE_NAMES: Readonly<Record<string, string>> = {
  LineStacked: 'Stacked Line',
  LineStacked100: '100% Stacked Line',
  LineMarkersStacked: 'Stacked Line with Markers',
  LineMarkersStacked100: '100% Stacked Line with Markers',
  PieOfPie: 'Pie of Pie',
  BarOfPie: 'Bar of Pie',
  Histogram: 'Histogram',
  Pareto: 'Pareto',
  Boxwhisker: 'Box and Whisker',
  Waterfall: 'Waterfall',
  Treemap: 'Treemap',
  Sunburst: 'Sunburst',
  RegionMap: 'Map',
  Bubble: 'Bubble',
  Bubble3DEffect: '3-D Bubble',
  Surface: '3-D Surface',
  SurfaceWireframe: 'Wireframe 3-D Surface',
  SurfaceTopView: 'Contour',
  SurfaceTopViewWireframe: 'Wireframe Contour',
  Invalid: 'unknown',
};

/** Why a chart type MAIDR does not know is not read. */
const UNKNOWN_REASON = 'this chart type is not one MAIDR knows.';

function warn(message: string): void {
  console.warn(`${ADAPTER_PREFIX} ${message}`);
}

/**
 * The flat chart type a variant reads as.
 *
 * `3DColumnClustered`, `CylinderColClustered` and `ConeColClustered` are all a
 * clustered column chart drawn with depth or with shaped bars; `3DColumn` and
 * its cylinder, cone and pyramid kin plot each series in its own row along a
 * depth axis, which is the same categories-by-series grid a clustered column
 * chart is. The `…Ex` types Excel's preview API adds are the same charts too.
 *
 * @param chartType - An `Excel.ChartType` value.
 * @returns The flat type it reads as.
 */
function flatChartType(chartType: string): string {
  const flat = chartType
    .replace(/Ex$/, '')
    .replace(/^3D/, '')
    .replace(/^(?:Cylinder|Cone|Pyramid)Col/, 'Column')
    .replace(/^(?:Cylinder|Cone|Pyramid)Bar/, 'Bar');
  return flat === 'Column' ? 'ColumnClustered' : flat;
}

/**
 * The family a chart type reads as.
 *
 * @param chartType - An `Excel.ChartType` value.
 * @returns The family; `unsupported` for a type MAIDR does not know.
 */
function familyOf(chartType: string): Family {
  return FAMILIES[flatChartType(chartType)] ?? { kind: 'unsupported', reason: UNKNOWN_REASON };
}

/** What reading one series of a chart type needs from Office.js. */
export interface ExcelSeriesNeeds {
  /** The dimensions whose values are read; none for a type MAIDR does not know. */
  readonly dimensions: readonly ExcelChartSeriesDimension[];
  /**
   * Whether a chart filter can hide the series, so `filtered` is read. Not
   * for a surface, where Office.js says it does not apply, or for the chart
   * types Excel 2016 added, which have no chart filter.
   */
  readonly filtered: boolean;
  /** Whether the series picks its value axis, so `axisGroup` is read. */
  readonly axisGroup: boolean;
  /** Whether the chart has axes whose titles name the reading. */
  readonly axes: boolean;
  /** Whether a 3-D series axis names the rows: a surface's. */
  readonly seriesAxis: boolean;
  /** Whether the series is a pie's, whose first slice angle is read. */
  readonly pie: boolean;
  /** Whether the series is a pie of pie's, whose split is read. */
  readonly split: boolean;
  /** Whether the series is binned, a histogram's or Pareto chart's. */
  readonly bins: boolean;
  /** Whether the series is a box and whisker chart's, whose quartile calculation is read. */
  readonly box: boolean;
  /** Whether the chart's way of plotting blanks changes the reading. */
  readonly blanks: boolean;
}

const NOTHING: ExcelSeriesNeeds = {
  dimensions: [],
  filtered: false,
  axisGroup: false,
  axes: false,
  seriesAxis: false,
  pie: false,
  split: false,
  bins: false,
  box: false,
  blanks: false,
};

/** The values of a series read along categories: one value per category. */
const CATEGORY_VALUES: readonly ExcelChartSeriesDimension[] = ['Categories', 'Values'];

/**
 * What reading one series of a chart needs, so the reader loads only what this
 * reading uses: a pie has no axes to ask about, and a type MAIDR does not know
 * is not read at all.
 *
 * A series of a chart that is a whole chart of its own -- a histogram, a
 * treemap -- is read as the chart's type says, whatever type the series
 * reports; any other series as its own type, or the chart's when it reports
 * none, since in a combo chart each series has its own.
 *
 * @param chartType - The chart's `Excel.ChartType`.
 * @param seriesType - The series' `Excel.ChartType`, empty when it has none.
 * @returns The dimensions and properties to read.
 */
export function excelSeriesNeeds(chartType: string, seriesType = ''): ExcelSeriesNeeds {
  const chart = familyOf(chartType);
  const family = isWhole(chart) ? chart : familyOf(seriesType || chartType);
  const classic = { ...NOTHING, dimensions: CATEGORY_VALUES, filtered: true };
  switch (family.kind) {
    case 'unsupported':
      return NOTHING;
    case 'bar':
    case 'stock':
      return { ...classic, axisGroup: true, axes: true };
    case 'line':
    case 'area':
      return { ...classic, axisGroup: true, axes: true, blanks: true };
    case 'scatter':
      return { ...classic, dimensions: ['XValues', 'YValues'], axisGroup: true, axes: true, blanks: true };
    case 'bubble':
      return { ...classic, dimensions: ['XValues', 'YValues', 'BubbleSizes'], axisGroup: true, axes: true };
    case 'pie':
      return { ...classic, pie: true };
    case 'ofPie':
      return { ...classic, split: true };
    case 'radar':
      return classic;
    case 'surface':
      return { ...NOTHING, dimensions: CATEGORY_VALUES, axes: true, seriesAxis: true };
    case 'histogram':
    case 'pareto':
      return { ...NOTHING, dimensions: CATEGORY_VALUES, axes: true, bins: true };
    case 'box':
      return { ...NOTHING, dimensions: CATEGORY_VALUES, axes: true, box: true };
    case 'waterfall':
      return { ...NOTHING, dimensions: CATEGORY_VALUES, axes: true };
    case 'funnel':
    case 'hierarchy':
    case 'map':
      return { ...NOTHING, dimensions: CATEGORY_VALUES };
  }
}

/**
 * Whether MAIDR reads a chart type at all.
 *
 * Every type `Excel.ChartType` names is read; `Invalid`, and a type a later
 * Excel adds, is not. A type it reads can still convert to nothing: a chart
 * whose every value is blank has nothing to navigate.
 *
 * @param chartType - An `Excel.ChartType` value, such as `ColumnClustered`.
 * @returns `true` when the type has a reading.
 */
export function isSupportedExcelChartType(chartType: string): boolean {
  return familyOf(chartType).kind !== 'unsupported';
}

/**
 * A chart type as a message names it: `Boxwhisker` is `Box and Whisker`,
 * `LineStacked` is `Stacked Line`, and a type with no entry of its own is its
 * enum name split into words, `ColumnClustered` as `Column Clustered`.
 *
 * @param chartType - An `Excel.ChartType` value.
 * @returns The type in words.
 */
export function excelChartTypeName(chartType: string): string {
  const named = TYPE_NAMES[chartType];
  if (named !== undefined) {
    return named;
  }
  return chartType
    .replace(/^3D/, '3-D ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

/**
 * A title as a label: its text when the chart shows it, otherwise nothing.
 *
 * A hidden title is not announced. Excel keeps the text of a title the author
 * turned off, and reading it would name the chart something no sighted reader
 * of it sees.
 *
 * @param title - The title, as Excel reports it.
 * @returns The text, or `undefined`.
 */
function shownText(title: ExcelTitleSnapshot | undefined): string | undefined {
  if (title === undefined || !title.visible) {
    return undefined;
  }
  const text = title.text.trim();
  return text === '' ? undefined : text;
}

/** An error value Excel shows in a cell instead of a number: `#N/A`, `#DIV/0!`. */
const ERROR_VALUE = /^#[\w/]+[!?]?$/;

/**
 * Read one value cell.
 *
 * @param raw - What `getDimensionValues` returned for the cell.
 * @param blanks - Whether the chart plots a blank cell as zero.
 * @returns The number; `null` for a blank or an error value, which Excel draws
 * no mark for; `undefined` for text that is not a number, which is a gap too
 * but one the console should hear about.
 */
function parseCell(raw: string | undefined, blanks: Blanks = 'gap'): number | null | undefined {
  if (raw === undefined) {
    return null;
  }
  const text = raw.trim();
  if (text === '') {
    return blanks === 'zero' ? 0 : null;
  }
  if (ERROR_VALUE.test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Read a series' values as numbers, one per position.
 *
 * A blank is a gap, `null`, never a zero -- a zero is a reading, and
 * sonifying a blank as one would put a mark where the chart has none -- unless
 * the chart plots blanks as zero, when it is the zero Excel draws. Text that
 * is not a number is a gap too, and the console says which, since it may mean
 * Excel handed over formatted text rather than values.
 *
 * @param series - The series' name, for the warning.
 * @param raws - The dimension's strings.
 * @param length - How many positions to read.
 * @param blanks - Whether the chart plots a blank cell as zero.
 * @returns The values; `null` where there is none.
 */
function readNumbers(
  series: string,
  raws: readonly string[] | undefined,
  length: number,
  blanks: Blanks = 'gap',
): (number | null)[] {
  const values: (number | null)[] = [];
  const unreadable: string[] = [];
  for (let i = 0; i < length; i++) {
    const value = parseCell(raws?.[i], blanks);
    if (value === undefined) {
      unreadable.push(raws?.[i] ?? '');
      values.push(null);
    } else {
      values.push(value);
    }
  }
  if (unreadable.length > 0) {
    warn(
      `${unreadable.length} value(s) of series "${series}" are not numbers `
      + `(${unreadable.slice(0, 3).map(text => `"${text}"`).join(', ')}); reading them as gaps.`,
    );
  }
  return values;
}

/** A series' numbers, blanks and text left out: what a histogram or box counts. */
function measuredNumbers(series: ExcelSeriesSnapshot): number[] {
  return readNumbers(series.name, series.values, series.values?.length ?? 0)
    .filter((value): value is number => value !== null);
}

function isBlank(text: string | undefined): boolean {
  return text === undefined || text.trim() === '';
}

/**
 * Whether the cells' displayed text can stand in for the raw categories.
 *
 * Only when it lines up: one label per category, and each raw category that is
 * text found within its label. A source range that also covers rows the chart
 * leaves out -- hidden ones, say -- fails the first test, and a label taken
 * from the wrong row fails the second, so a label is never announced against
 * another category's value.
 */
function labelsLineUp(raw: readonly string[], labels: readonly string[]): boolean {
  if (raw.length !== labels.length) {
    return false;
  }
  return raw.every((category, i) => {
    const text = category.trim();
    return text === '' || Number.isFinite(Number(text)) || labels[i].includes(text);
  });
}

/**
 * The label of each category position.
 *
 * The category cells' displayed text when it was read and lines up with the
 * raw categories; otherwise the raw categories `getDimensionValues` returned,
 * a blank one as {@link BLANK_LABEL}. With no categories at all -- a series
 * plotted without a category range -- the positions are numbered from 1, as
 * Excel numbers them on the axis.
 *
 * @param snapshot - The chart.
 * @param series - The series read along the categories.
 * @returns One label per position, as many as the longest series.
 */
function categoryLabels(snapshot: ExcelChartSnapshot, series: readonly ExcelSeriesSnapshot[]): string[] {
  const raw = series.find(one => one.categories !== undefined && one.categories.length > 0)?.categories ?? [];
  const length = Math.max(raw.length, ...series.map(one => one.values?.length ?? 0));
  let labels: readonly string[] = raw;
  const cells = snapshot.categoryLabels;
  if (cells !== undefined && cells.length > 0) {
    const fits = raw.length > 0 ? labelsLineUp(raw, cells) : cells.length === length;
    if (fits) {
      labels = cells;
    } else {
      warn('the category cells do not line up with the chart\'s categories; reading the categories as Excel returned them.');
    }
  }
  const numbered = labels.every(label => isBlank(label));
  return Array.from({ length }, (_, i) => {
    if (numbered) {
      return String(i + 1);
    }
    const label = labels[i];
    return isBlank(label) ? BLANK_LABEL : label.trim();
  });
}

function axisConfig(label: string | undefined): AxisConfig | undefined {
  return label === undefined || label === '' ? undefined : { label };
}

function buildAxes(x: string | undefined, y: string | undefined, z?: string): NonNullable<MaidrLayer['axes']> {
  const axes: { x?: AxisConfig; y?: AxisConfig; z?: AxisConfig } = {};
  const xAxis = axisConfig(x);
  const yAxis = axisConfig(y);
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

/** The series one layer is built from, and what they are drawn as. */
interface Group {
  readonly family: Exclude<Family, WholeFamily | { kind: 'unsupported' }>;
  readonly secondary: boolean;
  readonly series: readonly ExcelSeriesSnapshot[];
}

/** What every layer builder reads the chart's labels from. */
interface Labels {
  /** The category axis' label, or its header cell's text. */
  readonly category: string | undefined;
  /** The value axis' label for a group, falling back to a lone series' name. */
  readonly value: (group: Group) => string | undefined;
  /** One label per category position. */
  readonly categories: readonly string[];
  /** How the chart plots a blank cell. */
  readonly blanks: Blanks;
}

/** What a chart of a whole-chart family is read from. */
interface Whole {
  readonly snapshot: ExcelChartSnapshot;
  /** The series the chart draws, filtered ones left out. */
  readonly series: readonly ExcelSeriesSnapshot[];
  /** The category axis' label, or its header cell's text. */
  readonly category: string | undefined;
}

/** A built layer, without its id, and the series it was built from. */
interface Built {
  readonly layer: Omit<MaidrLayer, 'id'>;
  readonly series: readonly ExcelSeriesSnapshot[];
}

/** A series a combo chart left out, and why. */
export interface ExcelOmittedSeries {
  readonly name: string;
  readonly chartType: string;
  readonly reason: string;
}

function hasValue(values: readonly (number | null)[]): boolean {
  return values.some(value => value !== null);
}

/** The primary value axis' shown title, or else the name of the one series. */
function valueLabel(snapshot: ExcelChartSnapshot, series: readonly ExcelSeriesSnapshot[]): string | undefined {
  return shownText(snapshot.axes?.value?.title) ?? (series.length === 1 ? series[0].name : undefined);
}

/** The first series of a chart that reads one; a warning names the rest. */
function onlySeries(what: string, series: readonly ExcelSeriesSnapshot[]): ExcelSeriesSnapshot {
  const [first, ...rest] = series;
  if (rest.length > 0) {
    warn(`a ${what} reads one series; reading "${first.name}" and ignoring ${rest.length} more.`);
  }
  return first;
}

/**
 * A bar or column chart's series as one layer.
 *
 * One series is a plain `bar`, its blanks left out because Excel draws no bar
 * there. Several are a `dodged_bar` (clustered) or a `stacked_bar`, padded with
 * `NaN` -- MAIDR's gap sentinel, announced as missing and left silent --
 * because `SegmentedTrace` sums across series by index and needs every row the
 * same length. A 100% stacked chart is always a `stacked_normalized_bar`, even
 * with one series: Excel draws every bar of it full height.
 */
function buildBars(group: Group, family: { mode: BarMode; horizontal: boolean }, labels: Labels): Built | null {
  const { horizontal, mode } = family;
  const orientation = horizontal ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  const value = labels.value(group);
  const [x, y] = horizontal ? [value, labels.category] : [labels.category, value];
  const { categories } = labels;

  if (group.series.length === 1 && mode !== 'stacked100') {
    const [series] = group.series;
    const values = readNumbers(series.name, series.values, categories.length);
    const data: BarPoint[] = [];
    values.forEach((magnitude, i) => {
      if (magnitude !== null) {
        data.push(horizontal ? { x: magnitude, y: categories[i] } : { x: categories[i], y: magnitude });
      }
    });
    if (data.length === 0) {
      return null;
    }
    return { layer: { type: TraceType.BAR, orientation, axes: buildAxes(x, y), data }, series: group.series };
  }

  let measured = false;
  const data: SegmentedPoint[][] = group.series.map((series) => {
    const values = readNumbers(series.name, series.values, categories.length);
    measured ||= hasValue(values);
    return values.map((raw, i) => {
      const magnitude = raw ?? Number.NaN;
      return horizontal
        ? { x: magnitude, y: categories[i], z: series.name }
        : { x: categories[i], y: magnitude, z: series.name };
    });
  });
  if (!measured) {
    return null;
  }
  const type = mode === 'clustered'
    ? TraceType.DODGED
    : mode === 'stacked' ? TraceType.STACKED : TraceType.NORMALIZED;
  return { layer: { type, orientation, axes: buildAxes(x, y), data }, series: group.series };
}

/**
 * Series read along the categories, one row each, as a line-shaped layer: a
 * line, an area or a radar. A blank stays in its row as a gap at its own
 * position, or is the zero the chart plots. Rows are named by series when
 * there are several, or always where the reading wants them named.
 */
function buildRows(
  group: Group,
  type: TraceType,
  labels: Labels,
  options: { readonly blanks?: Blanks; readonly named?: boolean } = {},
): Built | null {
  const named = options.named ?? group.series.length > 1;
  let measured = false;
  const data: LinePoint[][] = group.series.map((series) => {
    const values = readNumbers(series.name, series.values, labels.categories.length, options.blanks);
    measured ||= hasValue(values);
    return values.map((value, i) => {
      const point: LinePoint = { x: labels.categories[i], y: value };
      if (named) {
        point.z = series.name;
      }
      return point;
    });
  });
  if (!measured) {
    return null;
  }
  return {
    layer: { type, axes: buildAxes(labels.category, labels.value(group)), data },
    series: group.series,
  };
}

/**
 * A line chart's series as one layer. A stacked line is drawn at each
 * series' running total, so it reads as a stacked area -- each band its own
 * series' value, the total derived by `AreaTrace` -- and a 100% stacked line as
 * a normalized one. A single stacked series is a plain line, where a single
 * 100% stacked one stays normalized: Excel draws it at 100% throughout.
 */
function buildLines(group: Group, stack: 'stacked' | 'stacked100' | undefined, labels: Labels): Built | null {
  const single = group.series.length === 1;
  const type = stack === 'stacked100'
    ? TraceType.NORMALIZED_AREA
    : stack === 'stacked' && !single ? TraceType.STACKED_AREA : TraceType.LINE;
  return buildRows(group, type, labels, { blanks: labels.blanks });
}

/**
 * An area chart's series as one layer. Each band carries its own series'
 * value, never the running edge: `AreaTrace` sums a stacked layer itself.
 * One series of a 100% stacked area stays normalized, as a bar does.
 */
function buildAreas(group: Group, mode: AreaMode, labels: Labels): Built | null {
  const single = group.series.length === 1;
  const type = mode === 'stacked100'
    ? TraceType.NORMALIZED_AREA
    : mode === 'stacked' && !single ? TraceType.STACKED_AREA : TraceType.AREA;
  return buildRows(group, type, labels, { blanks: labels.blanks });
}

/**
 * The slices of a pie, from one series: a blank, zero or negative value has no
 * slice in Excel's pie, so it has none here either, and a warning counts the
 * negative ones.
 */
function pieSlices(series: ExcelSeriesSnapshot, categories: readonly string[]): PiePoint[] {
  const values = readNumbers(series.name, series.values, categories.length);
  const slices: PiePoint[] = [];
  let negative = 0;
  values.forEach((value, i) => {
    if (value === null || value <= 0) {
      negative += value !== null && value < 0 ? 1 : 0;
      return;
    }
    slices.push({ x: categories[i], y: value });
  });
  if (negative > 0) {
    warn(`${negative} negative value(s) have no slice in a pie; skipping them.`);
  }
  return slices;
}

/**
 * A pie or doughnut as one layer, from its first series: a doughnut's further
 * rings are named in a warning and not read.
 */
function buildPie(group: Group, labels: Labels): Built | null {
  const series = onlySeries('pie', group.series);
  const data = pieSlices(series, labels.categories);
  if (data.length === 0) {
    return null;
  }
  const layer: Omit<MaidrLayer, 'id'> = {
    type: TraceType.PIE,
    axes: buildAxes(labels.category, series.name),
    data,
  };
  // Excel and MAIDR both measure the first slice clockwise from 12 o'clock.
  const angle = series.firstSliceAngle;
  if (angle !== undefined && Number.isFinite(angle) && angle % 360 !== 0) {
    layer.startAngle = ((angle % 360) + 360) % 360;
  }
  return { layer, series: [series] };
}

/**
 * A funnel as one layer, from its first series. Excel draws a funnel's stages
 * top to bottom with the value as the band's width, which is a horizontal
 * funnel here: `x` is the value, `y` the stage.
 */
function buildFunnel(group: Group, labels: Labels): Built | null {
  const series = onlySeries('funnel', group.series);
  const values = readNumbers(series.name, series.values, labels.categories.length);
  const data: BarPoint[] = [];
  values.forEach((value, i) => {
    if (value !== null) {
      data.push({ x: value, y: labels.categories[i] });
    }
  });
  if (data.length === 0) {
    return null;
  }
  return {
    layer: {
      type: TraceType.FUNNEL,
      orientation: Orientation.HORIZONTAL,
      axes: buildAxes(series.name, labels.category),
      data,
    },
    series: [series],
  };
}

/**
 * A scatter series' points.
 *
 * When no X value is a number -- the series has no X range, or one holding
 * text -- Excel plots the points at 1, 2, 3 and so on, and so are they read.
 *
 * @returns One `[x, y]` per position; either may be `null`.
 */
function scatterPoints(series: ExcelSeriesSnapshot, blanks: Blanks = 'gap'): [number | null, number | null][] {
  const length = Math.max(series.xValues?.length ?? 0, series.yValues?.length ?? 0);
  const ys = readNumbers(series.name, series.yValues, length, blanks);
  const counted = (series.xValues ?? []).every(raw => parseCell(raw) === null)
    || (series.xValues ?? []).some(raw => parseCell(raw) === undefined);
  const xs = counted
    ? ys.map((_, i) => i + 1)
    : readNumbers(series.name, series.xValues, length);
  return ys.map((y, i) => [xs[i], y]);
}

/**
 * A scatter of markers: one `point` layer per series, since each series is
 * its own cloud. A point missing either coordinate is left out: there is no
 * position to place it at.
 */
function buildScatter(group: Group, labels: Labels): Built[] {
  const built: Built[] = [];
  for (const series of group.series) {
    const data: ScatterPoint[] = scatterPoints(series, labels.blanks)
      .filter((point): point is [number, number] => point[0] !== null && point[1] !== null)
      .map(([x, y]) => ({ x, y }));
    if (data.length === 0) {
      continue;
    }
    built.push({
      layer: {
        type: TraceType.SCATTER,
        axes: buildAxes(labels.category, labels.value({ ...group, series: [series] })),
        data,
      },
      series: [series],
    });
  }
  return built;
}

/**
 * A scatter with lines -- straight or smoothed -- as one `line` layer over
 * numeric X, a row per series, in the order Excel joins the points. A point
 * with no X is left out; one with no Y stays as a gap.
 */
function buildScatterLines(group: Group, labels: Labels): Built | null {
  const named = group.series.length > 1;
  let measured = false;
  const data: LinePoint[][] = group.series.map((series) => {
    const points = scatterPoints(series, labels.blanks).filter((point): point is [number, number | null] => point[0] !== null);
    measured ||= points.some(([, y]) => y !== null);
    return points.map(([x, y]) => (named ? { x, y, z: series.name } : { x, y }));
  });
  if (!measured) {
    return null;
  }
  return {
    layer: { type: TraceType.LINE, axes: buildAxes(labels.category, labels.value(group)), data },
    series: group.series,
  };
}

/**
 * A bubble chart: one `point` layer per series, as a scatter is, with each
 * bubble's size as the point's `z` -- a third measured quantity, which MAIDR
 * announces and sonifies. The size is named by the header cell above the
 * sizes when it was read. A bubble whose size is blank, zero or negative is
 * one Excel does not draw, by default, and is left out.
 */
function buildBubbles(group: Group, labels: Labels): Built[] {
  const built: Built[] = [];
  for (const series of group.series) {
    const points = scatterPoints(series);
    const sizes = readNumbers(series.name, series.bubbleSizes, points.length);
    let unsized = 0;
    const data: ScatterPoint[] = [];
    points.forEach(([x, y], i) => {
      const size = sizes[i];
      if (x === null || y === null) {
        return;
      }
      if (size === null || size <= 0) {
        unsized += 1;
        return;
      }
      data.push({ x, y, z: size });
    });
    if (unsized > 0) {
      warn(`${unsized} bubble(s) of series "${series.name}" have no positive size, so Excel draws none; skipping them.`);
    }
    if (data.length === 0) {
      continue;
    }
    built.push({
      layer: {
        type: TraceType.SCATTER,
        axes: buildAxes(labels.category, labels.value({ ...group, series: [series] }), series.sizeHeader?.trim() || SIZE_LABEL),
        data,
      },
      series: [series],
    });
  }
  return built;
}

/** The series of a stock chart, in the order Excel requires them. */
const STOCK_ORDER = {
  HLC: ['high', 'low', 'close'],
  OHLC: ['open', 'high', 'low', 'close'],
  VHLC: ['volume', 'high', 'low', 'close'],
  VOHLC: ['volume', 'open', 'high', 'low', 'close'],
} as const;

type StockField = 'volume' | 'open' | 'high' | 'low' | 'close';

/**
 * A stock chart.
 *
 * Excel reads a stock chart's series by position -- open, high, low, close,
 * with volume first in the volume variants -- whatever they are called, so
 * they are read the same way here, as a `candlestick` layer. A period missing
 * its high, low or close, or its open where the chart has one, is left out.
 * A high-low-close chart has no open at all, and none is invented: its
 * candles carry no `open`, which MAIDR reads as candles with no body -- no
 * open, trend or pattern announced, the high, low and close are.
 *
 * The volume of a volume variant is a `bar` layer of its own beside the
 * candles, as Excel draws it as columns on an axis of its own, and the prices
 * are then measured on the secondary axis. Folded into the candles, MAIDR
 * would list the volume only in the chart's description, where the reader
 * could neither walk it nor hear it.
 */
function buildStock(whole: Whole, family: { open: boolean; volume: boolean }): Built[][] {
  const { snapshot, series, category } = whole;
  const key = `${family.volume ? 'V' : ''}${family.open ? 'O' : ''}HLC` as keyof typeof STOCK_ORDER;
  const order: readonly StockField[] = STOCK_ORDER[key];
  if (series.length !== order.length) {
    warn(
      `a ${snapshot.chartType} chart reads ${order.length} series (${order.join(', ')}), `
      + `in that order; this one has ${series.length}. Nothing to read.`,
    );
    return [];
  }
  const categories = categoryLabels(snapshot, series);
  const fields = new Map(order.map((field, i) => [field, series[i]] as const));
  const columns = new Map(order.map((field, i) =>
    [field, readNumbers(series[i].name, series[i].values, categories.length)] as const));
  const at = (field: StockField, i: number): number | null => columns.get(field)?.[i] ?? null;
  const price = shownText(family.volume ? snapshot.axes?.secondaryValue?.title : snapshot.axes?.value?.title);
  const priced = order.filter(field => field !== 'volume').map(field => fields.get(field) as ExcelSeriesSnapshot);

  const built: Built[] = [];
  const candles: CandlestickPoint[] = [];
  categories.forEach((value, i) => {
    const high = at('high', i);
    const low = at('low', i);
    const close = at('close', i);
    const open = family.open ? at('open', i) : null;
    if (high === null || low === null || close === null || (family.open && open === null)) {
      return;
    }
    candles.push({ value, ...(open === null ? {} : { open }), high, low, close, volatility: tidy(high - low) });
  });
  if (candles.length > 0) {
    built.push({ layer: { type: TraceType.CANDLESTICK, axes: buildAxes(category, price), data: candles }, series: priced });
  }
  if (family.volume) {
    const volume = fields.get('volume') as ExcelSeriesSnapshot;
    const data: BarPoint[] = [];
    categories.forEach((x, i) => {
      const y = at('volume', i);
      if (y !== null) {
        data.push({ x, y });
      }
    });
    if (data.length > 0) {
      const label = shownText(snapshot.axes?.value?.title) ?? volume.name;
      built.push({ layer: { type: TraceType.BAR, axes: buildAxes(category, label), data }, series: [volume] });
    }
  }
  return built.length === 0 ? [] : [built];
}

/**
 * A surface or contour chart as a `heat` grid: the categories across, the
 * series down, each cell the series' value at the category, a blank cell a
 * cell with no value. The grid lists its rows top first, and Excel's contour
 * view draws the first series at the bottom, as its series axis runs, so the
 * rows are the series in reverse. The series axis' title names the rows and
 * the value axis' title the cells.
 */
function buildSurface(whole: Whole): Built[][] {
  const { snapshot, series, category } = whole;
  const x = categoryLabels(snapshot, series);
  const rows = [...series].reverse();
  const points = rows.map(one => readNumbers(one.name, one.values, x.length));
  if (!points.some(hasValue)) {
    return [];
  }
  const data: HeatmapData = { x, y: rows.map(one => one.name), points };
  const axes = buildAxes(category, shownText(snapshot.axes?.series?.title), shownText(snapshot.axes?.value?.title));
  return [[{ layer: { type: TraceType.HEATMAP, axes, data }, series }]];
}

/**
 * Which slices a pie of pie or bar of pie splits off into its second plot, by
 * index, or `null` for a split no one outside Excel can know.
 *
 * - By position, the last `splitValue` slices.
 * - By value, the slices worth less than `splitValue`.
 * - By percentage, the slices worth less than `splitValue` percent of the pie.
 * - A custom split is the points the author moved one by one, which Office.js
 *   does not report: `null`.
 * - Excel's automatic split, or no split read, is its default: by position,
 *   the last three.
 */
function splitOff(slices: readonly PiePoint[], type: string | undefined, value: number | undefined): Set<number> | null {
  const indices = slices.map((_, i) => i);
  const threshold = value !== undefined && Number.isFinite(value) ? value : undefined;
  const last = (count: number): Set<number> => new Set(indices.slice(Math.max(0, slices.length - count)));
  if (type === 'SplitByCustomSplit') {
    return null;
  }
  if (type === 'SplitByPosition' && threshold !== undefined) {
    return last(Math.max(0, Math.round(threshold)));
  }
  if (type === 'SplitByValue' && threshold !== undefined) {
    return new Set(indices.filter(i => slices[i].y < threshold));
  }
  if (type === 'SplitByPercentValue' && threshold !== undefined) {
    const total = slices.reduce((sum, slice) => sum + slice.y, 0);
    return new Set(indices.filter(i => (slices[i].y / total) * 100 < threshold));
  }
  return last(3);
}

/**
 * A pie of pie or bar of pie, as two subplots side by side, as Excel draws
 * it: the main pie, with the points split off gathered into one `Other`
 * slice, and the split-off points again as a pie or as bars. A custom split
 * cannot be read, so the chart then reads as one pie of every point, which is
 * true to the values if not to the drawing.
 */
function buildOfPie(whole: Whole, second: 'pie' | 'bar'): Built[][] {
  const { snapshot, category } = whole;
  const series = onlySeries(second === 'pie' ? 'pie of pie' : 'bar of pie', whole.series);
  const slices = pieSlices(series, categoryLabels(snapshot, [series]));
  if (slices.length === 0) {
    return [];
  }
  const axes = buildAxes(category, series.name);
  const split = splitOff(slices, series.splitType, series.splitValue);
  if (split === null) {
    warn('a custom pie split is not reported by Office.js; reading every point as one pie.');
  }
  if (split === null || split.size === 0) {
    return [[{ layer: { type: TraceType.PIE, axes, data: slices }, series: [series] }]];
  }
  const kept = slices.filter((_, i) => !split.has(i));
  const parted = slices.filter((_, i) => split.has(i));
  const other = tidy(parted.reduce((sum, slice) => sum + slice.y, 0));
  const main: Built = {
    layer: { type: TraceType.PIE, axes, data: [...kept, { x: OTHER_LABEL, y: other }] },
    series: [series],
  };
  const detail: Built = {
    layer: second === 'pie'
      ? { type: TraceType.PIE, name: OTHER_LABEL, axes, data: parted }
      : { type: TraceType.BAR, name: OTHER_LABEL, axes, data: parted.map(({ x, y }): BarPoint => ({ x, y })) },
    series: [series],
  };
  return [[main], [detail]];
}

/**
 * How a histogram or Pareto series was told to bin, as a rule `binValues`
 * follows, or `category` for one bar per category.
 */
function binRuleOf(options: ExcelBinOptionsSnapshot | undefined): BinRule | 'category' {
  const type = options?.type ?? 'Auto';
  if (type === 'Category') {
    return 'category';
  }
  const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);
  return {
    type: type === 'BinWidth' || type === 'BinCount' ? type : 'Auto',
    ...(type === 'BinWidth' && finite(options?.width) ? { width: options.width } : {}),
    ...(type === 'BinCount' && finite(options?.count) ? { count: options.count } : {}),
    ...(options?.allowUnderflow === true && finite(options.underflowValue) ? { underflow: options.underflowValue } : {}),
    ...(options?.allowOverflow === true && finite(options.overflowValue) ? { overflow: options.overflowValue } : {}),
  };
}

/**
 * Binning by category: Excel groups the same categories and sums their
 * values, one bar per category in the order each first appears.
 */
function categoryTotals(snapshot: ExcelChartSnapshot, series: ExcelSeriesSnapshot): { label: string; amount: number }[] {
  const labels = categoryLabels(snapshot, [series]);
  const values = readNumbers(series.name, series.values, labels.length);
  const totals = new Map<string, number>();
  values.forEach((value, i) => {
    if (value !== null) {
      totals.set(labels[i], tidy((totals.get(labels[i]) ?? 0) + value));
    }
  });
  return [...totals].map(([label, amount]) => ({ label, amount }));
}

/**
 * A histogram, from its first series' raw values, binned as the chart's bin
 * options say (`./statistics`): a `hist` layer, one bin per bar, each read as
 * its range and its count. Binned by category, it is a `bar` layer of each
 * category's total instead, since such a bar has no range.
 */
function buildHistogram(whole: Whole): Built[][] {
  const { snapshot, category } = whole;
  const series = onlySeries('histogram', whole.series);
  const rule = binRuleOf(series.binOptions);
  const valueTitle = shownText(snapshot.axes?.value?.title);
  if (rule === 'category') {
    const totals = categoryTotals(snapshot, series);
    if (totals.length === 0) {
      return [];
    }
    const data: BarPoint[] = totals.map(({ label, amount }) => ({ x: label, y: amount }));
    return [[{ layer: { type: TraceType.BAR, axes: buildAxes(category, valueTitle ?? series.name), data }, series: [series] }]];
  }
  const bins = binValues(measuredNumbers(series), rule);
  if (bins.length === 0) {
    return [];
  }
  const data: HistogramPoint[] = bins.map(bin => ({
    x: tidy((bin.min + bin.max) / 2),
    y: bin.count,
    xMin: bin.min,
    xMax: bin.max,
    yMin: 0,
    yMax: bin.count,
  }));
  const axes = buildAxes(category ?? series.name, valueTitle ?? COUNT_LABEL);
  return [[{ layer: { type: TraceType.HISTOGRAM, axes, data }, series: [series] }]];
}

/**
 * A Pareto chart: the bars sorted from largest to smallest -- each category's
 * total, or, for numbers, each bin's count, the bins as a histogram makes them
 * -- as a `bar` layer, and the line of their cumulative share of the whole, as
 * a fraction read as a percentage, as a `line` layer over the same bars.
 */
function buildPareto(whole: Whole): Built[][] {
  const { snapshot, category } = whole;
  const series = onlySeries('Pareto chart', whole.series);
  const rule = binRuleOf(series.binOptions);
  const entries = rule === 'category'
    ? categoryTotals(snapshot, series)
    : binValues(measuredNumbers(series), rule).map(bin => ({ label: bin.label, amount: bin.count }));
  const sorted = entries
    .map((entry, i) => ({ ...entry, i }))
    .sort((a, b) => b.amount - a.amount || a.i - b.i);
  const total = sorted.reduce((sum, entry) => sum + entry.amount, 0);
  if (sorted.length === 0 || !(total > 0)) {
    return [];
  }
  const x = category ?? (rule === 'category' ? undefined : series.name);
  const valueTitle = shownText(snapshot.axes?.value?.title) ?? (rule === 'category' ? series.name : COUNT_LABEL);
  const bars: BarPoint[] = sorted.map(({ label, amount }) => ({ x: label, y: amount }));
  let running = 0;
  const line: LinePoint[] = sorted.map(({ label, amount }) => {
    running += amount;
    return { x: label, y: tidy(running / total) };
  });
  const cumulative: NonNullable<MaidrLayer['axes']> = {
    ...buildAxes(x, undefined),
    y: { label: CUMULATIVE_LABEL, format: PERCENT_FORMAT },
  };
  return [[
    { layer: { type: TraceType.BAR, axes: buildAxes(x, valueTitle), data: bars }, series: [series] },
    { layer: { type: TraceType.LINE, axes: cumulative, data: [line] }, series: [series] },
  ]];
}

/**
 * A box and whisker chart: a `box` layer per series, a box per category --
 * the series' values grouped by the category beside each one, or all of them
 * in one box, named after the series, when there are no categories. The
 * quartiles follow the chart's quartile calculation, exclusive by default as
 * in Excel, and the whiskers reach the furthest values within 1.5 times the
 * interquartile range, every value beyond an outlier.
 */
function buildBoxes(whole: Whole): Built[][] {
  const { snapshot, series, category } = whole;
  const built: Built[] = [];
  for (const one of series) {
    const method: QuartileMethod = one.quartileCalculation === 'Inclusive' ? 'Inclusive' : 'Exclusive';
    const labels = categoryLabels(snapshot, [one]);
    const values = readNumbers(one.name, one.values, labels.length);
    const grouped = (one.categories ?? []).some(text => !isBlank(text));
    const groups = new Map<string, number[]>();
    values.forEach((value, i) => {
      if (value !== null) {
        const key = grouped ? labels[i] : one.name;
        groups.set(key, [...(groups.get(key) ?? []), value]);
      }
    });
    if (groups.size === 0) {
      continue;
    }
    const data: BoxPoint[] = [...groups].map(([z, numbers]) => ({ z, ...boxSummary(numbers, method) }));
    built.push({
      layer: { type: TraceType.BOX, axes: buildAxes(category, valueLabel(snapshot, [one])), data },
      series: [one],
    });
  }
  return built.length === 0 ? [] : [built];
}

/**
 * A waterfall, from its first series: each value a step from the running
 * total, rising or falling by it. A point set as a total stands on the
 * baseline at its own value, and the running total goes on from there. Office.js
 * does not say which points the author set as totals, so a read has none, and
 * every point is read as a step; a snapshot that names them (`totals`) is read
 * with them.
 */
function buildWaterfall(whole: Whole): Built[][] {
  const { snapshot, category } = whole;
  const series = onlySeries('waterfall', whole.series);
  const labels = categoryLabels(snapshot, [series]);
  const values = readNumbers(series.name, series.values, labels.length);
  const totals = new Set(series.totals ?? []);
  const data: WaterfallPoint[] = [];
  let running = 0;
  values.forEach((value, i) => {
    if (value === null) {
      return;
    }
    if (totals.has(i)) {
      running = value;
      data.push({ x: labels[i], start: 0, end: value, delta: value, kind: 'total' });
      return;
    }
    const start = running;
    running = tidy(running + value);
    data.push({ x: labels[i], start, end: running, delta: value, kind: value < 0 ? 'decrease' : 'increase' });
  });
  if (data.length === 0) {
    return [];
  }
  return [[{ layer: { type: TraceType.WATERFALL, axes: buildAxes(category, valueLabel(snapshot, [series])), data }, series: [series] }]];
}

/**
 * A treemap or sunburst, from its first series: each value a leaf, named by
 * its innermost category level, under the levels outside it -- the category
 * cells' levels when they were read, or else one level, the categories as
 * Excel returned them. A blank, zero or negative value has no area to draw
 * and is left out.
 */
function buildHierarchy(whole: Whole, type: TraceType.TREEMAP | TraceType.SUNBURST): Built[][] {
  const { snapshot, category } = whole;
  const series = onlySeries(type === TraceType.TREEMAP ? 'treemap' : 'sunburst', whole.series);
  const flat = categoryLabels(snapshot, [series]);
  const levels = snapshot.categoryLevels?.length === flat.length
    ? snapshot.categoryLevels
    : flat.map(label => [label]);
  const values = readNumbers(series.name, series.values, flat.length);
  const data: TreemapPoint[] = [];
  let dropped = 0;
  values.forEach((value, i) => {
    if (value === null) {
      return;
    }
    if (value <= 0) {
      dropped += 1;
      return;
    }
    const named = levels[i].map(level => level.trim()).filter(level => level !== '');
    const parts = named.length > 0 ? named : [flat[i]];
    const path = parts.slice(0, -1);
    data.push({ x: parts[parts.length - 1], y: value, ...(path.length > 0 ? { path } : {}) });
  });
  if (dropped > 0) {
    warn(`${dropped} zero or negative value(s) have no area in a ${excelChartTypeName(snapshot.chartType)} chart; skipping them.`);
  }
  if (data.length === 0) {
    return [];
  }
  return [[{ layer: { type, axes: buildAxes(category, series.name), data }, series: [series] }]];
}

/**
 * A map chart, from its first series: a `choropleth` of each region's value.
 * Office.js names the regions and gives no position for them, so they are
 * read as a list in the order of the data; the picture is Excel's own map.
 */
function buildMap(whole: Whole): Built[][] {
  const { snapshot, category } = whole;
  const series = onlySeries('map', whole.series);
  const labels = categoryLabels(snapshot, [series]);
  const values = readNumbers(series.name, series.values, labels.length);
  const data: ChoroplethPoint[] = [];
  values.forEach((value, i) => {
    if (value !== null) {
      data.push({ x: labels[i], y: value });
    }
  });
  if (data.length === 0) {
    return [];
  }
  return [[{ layer: { type: TraceType.CHOROPLETH, axes: buildAxes(category, series.name), data }, series: [series] }]];
}

function buildWhole(family: WholeFamily, whole: Whole): Built[][] {
  switch (family.kind) {
    case 'ofPie':
      return buildOfPie(whole, family.second);
    case 'stock':
      return buildStock(whole, family);
    case 'surface':
      return buildSurface(whole);
    case 'histogram':
      return buildHistogram(whole);
    case 'pareto':
      return buildPareto(whole);
    case 'box':
      return buildBoxes(whole);
    case 'waterfall':
      return buildWaterfall(whole);
    case 'hierarchy':
      return buildHierarchy(whole, family.type);
    case 'map':
      return buildMap(whole);
  }
}

/** The family every group key stands for, so equal families group together. */
function familyKey(family: Group['family']): string {
  switch (family.kind) {
    case 'bar':
      return `bar:${family.mode}:${family.horizontal ? 'h' : 'v'}`;
    case 'line':
      return `line:${family.stack ?? 'plain'}`;
    case 'area':
      return `area:${family.mode}`;
    case 'scatter':
      return `scatter:${family.lines ? 'lines' : 'markers'}`;
    default:
      return family.kind;
  }
}

/**
 * Group series by what they are drawn as and the axis they are measured on,
 * in the order each group first appears, and set aside the series that cannot
 * be one layer among others: one of a type MAIDR does not know, or of a type
 * that is a whole chart of its own.
 */
function groupSeries(
  snapshot: ExcelChartSnapshot,
  series: readonly ExcelSeriesSnapshot[],
): { readonly groups: Group[]; readonly omitted: ExcelOmittedSeries[] } {
  const groups = new Map<string, { family: Group['family']; secondary: boolean; series: ExcelSeriesSnapshot[] }>();
  const omitted: ExcelOmittedSeries[] = [];
  for (const one of series) {
    // An empty type is no type: the series is drawn as the chart is.
    const chartType = one.chartType || snapshot.chartType;
    const family = familyOf(chartType);
    if (family.kind === 'unsupported') {
      omitted.push({ name: one.name, chartType, reason: family.reason });
      continue;
    }
    if (isWhole(family)) {
      omitted.push({ name: one.name, chartType, reason: `a ${excelChartTypeName(chartType)} series reads only as a chart of its own.` });
      continue;
    }
    const secondary = one.axisGroup === 'Secondary';
    const key = `${familyKey(family)}|${secondary ? 'secondary' : 'primary'}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { family, secondary, series: [one] });
    } else {
      group.series.push(one);
    }
  }
  return { groups: [...groups.values()], omitted };
}

function present(built: Built | null): Built[] {
  return built === null ? [] : [built];
}

function buildGroup(group: Group, labels: Labels): Built[] {
  const { family } = group;
  switch (family.kind) {
    case 'bar':
      return present(buildBars(group, family, labels));
    case 'line':
      return present(buildLines(group, family.stack, labels));
    case 'area':
      return present(buildAreas(group, family.mode, labels));
    case 'radar':
      return present(buildRows(group, TraceType.RADAR, labels, { named: true }));
    case 'pie':
      return present(buildPie(group, labels));
    case 'funnel':
      return present(buildFunnel(group, labels));
    case 'scatter':
      return family.lines ? present(buildScatterLines(group, labels)) : buildScatter(group, labels);
    case 'bubble':
      return buildBubbles(group, labels);
  }
}

/**
 * Name the layers a reader could not otherwise tell apart.
 *
 * A layer switch announces the layer's type, which is enough between a
 * column layer and a line layer. Two layers of one type -- the clouds of a
 * scatter, the boxes of two series, or two lines on different value axes --
 * are told apart by name, so each is named after its series.
 */
function nameLayers(built: readonly Built[]): void {
  const counts = new Map<TraceType, number>();
  for (const { layer } of built) {
    counts.set(layer.type, (counts.get(layer.type) ?? 0) + 1);
  }
  for (const { layer, series } of built) {
    if ((counts.get(layer.type) ?? 0) > 1) {
      layer.name = series.map(one => one.name).join(', ');
    }
  }
}

let figureCounter = 0;

/**
 * A figure id no other Excel figure on the page has.
 *
 * @returns `maidr-excel-<n>`.
 */
export function nextFigureId(): string {
  figureCounter += 1;
  return `maidr-excel-${figureCounter}`;
}

/**
 * What converting one snapshot came to: a figure -- with the series a combo
 * chart left out, when it left any -- a chart type MAIDR cannot read, or
 * nothing to read. The binder tells the reader which.
 */
export type ExcelConversionOutcome
  = | { readonly kind: 'figure'; readonly maidr: Maidr; readonly omitted: readonly ExcelOmittedSeries[] }
    | { readonly kind: 'unsupported'; readonly chartType: string }
    | { readonly kind: 'empty' };

/**
 * Convert a snapshot, and say why when there is no figure.
 *
 * Every reason is also warned in the console, with the detail a developer
 * needs and a reader does not.
 *
 * @param snapshot - One read of a chart.
 * @param options - The figure id.
 * @returns The outcome.
 */
export function convertExcelChartOutcome(
  snapshot: ExcelChartSnapshot | null | undefined,
  options: ExcelConvertOptions = {},
): ExcelConversionOutcome {
  if (snapshot === null || snapshot === undefined) {
    return { kind: 'empty' };
  }
  const chart = snapshot.name === undefined ? 'the chart' : `"${snapshot.name}"`;
  const visible = snapshot.series.filter(one => one.filtered !== true);
  if (visible.length === 0) {
    warn(`${chart} has no series to read${snapshot.series.length > 0 ? ': a chart filter hides every one' : ''}.`);
    return { kind: 'empty' };
  }
  const chartFamily = familyOf(snapshot.chartType);
  const category = shownText(snapshot.axes?.category?.title) ?? (snapshot.categoryHeader?.trim() || undefined);

  let subplots: Built[][];
  let omitted: ExcelOmittedSeries[] = [];
  if (isWhole(chartFamily)) {
    subplots = buildWhole(chartFamily, { snapshot, series: visible, category });
  } else {
    const grouped = groupSeries(snapshot, visible);
    if (grouped.groups.length === 0) {
      const [first] = grouped.omitted;
      warn(`${chart} is a ${excelChartTypeName(first.chartType)} chart, which MAIDR cannot read: ${first.reason}`);
      return { kind: 'unsupported', chartType: first.chartType };
    }
    omitted = grouped.omitted;
    if (omitted.length > 0) {
      const left = omitted.map(one => `"${one.name}" (${excelChartTypeName(one.chartType)}: ${one.reason})`).join(', ');
      warn(`${chart} is read in part, leaving out ${left}`);
    }
    const labels: Labels = {
      category,
      categories: categoryLabels(snapshot, visible.filter(one => one.values !== undefined)),
      value: (group) => {
        const axis = group.secondary ? snapshot.axes?.secondaryValue : snapshot.axes?.value;
        return shownText(axis?.title) ?? (group.series.length === 1 ? group.series[0].name : undefined);
      },
      blanks: snapshot.displayBlanksAs === 'Zero' ? 'zero' : 'gap',
    };
    subplots = [grouped.groups.flatMap(group => buildGroup(group, labels))];
  }
  const drawnSubplots = subplots.filter(built => built.length > 0);
  if (drawnSubplots.length === 0) {
    warn(`${chart} has no value MAIDR can read: every reading is blank.`);
    return { kind: 'empty' };
  }

  const title = shownText(snapshot.title);
  let nextLayer = 0;
  const row: MaidrSubplot[] = drawnSubplots.map((built) => {
    nameLayers(built);
    const layers: MaidrLayer[] = built.map(({ layer }) => ({
      id: String(nextLayer++),
      ...(title === undefined ? {} : { title }),
      ...layer,
    }));
    const subplot: MaidrSubplot = { layers };
    const drawn = [...new Set(built.flatMap(({ series }) => series.map(one => one.name)))];
    if (drawn.length > 1 && chartFamily.kind !== 'stock') {
      subplot.legend = drawn;
    }
    return subplot;
  });
  const maidr: Maidr = {
    id: options.id ?? nextFigureId(),
    subplots: [row],
  };
  if (title !== undefined) {
    maidr.title = title;
  }
  return { kind: 'figure', maidr, omitted };
}

/**
 * Convert a snapshot of an Excel chart into a MAIDR figure.
 *
 * @param snapshot - One read of a chart, from `readExcelChart` or written by
 * hand.
 * @param options - The figure id.
 * @returns The figure, or `null` -- with a console warning saying why -- when
 * the chart's type has no MAIDR reading, or it holds nothing to navigate. A
 * combo chart with a series MAIDR cannot read is read without it, and the
 * console names it.
 *
 * @example
 * ```ts
 * const maidr = convertExcelChart({
 *   chartType: 'ColumnClustered',
 *   title: { text: 'Sales', visible: true },
 *   series: [{ name: 'Sales', categories: ['Q1', 'Q2'], values: ['120', '135'] }],
 * });
 * ```
 */
export function convertExcelChart(
  snapshot: ExcelChartSnapshot | null | undefined,
  options: ExcelConvertOptions = {},
): Maidr | null {
  const outcome = convertExcelChartOutcome(snapshot, options);
  return outcome.kind === 'figure' ? outcome.maidr : null;
}
