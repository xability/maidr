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
 * Where the snapshot cannot settle a question, the reading is smaller rather
 * than wrong, after the Power BI adapter's rules: a pie reads its first series,
 * a blank is a gap and never a zero, and a chart type MAIDR has no faithful
 * reading for is declined with a message naming it rather than drawn as the
 * nearest shape.
 */

import type {
  AxisConfig,
  BarPoint,
  CandlestickPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
} from '../../type/grammar';
import type {
  ExcelChartSnapshot,
  ExcelConvertOptions,
  ExcelSeriesSnapshot,
  ExcelTitleSnapshot,
} from './types';
import { Orientation, TraceType } from '../../type/grammar';

const ADAPTER_PREFIX = '[MAIDR excel]';

/**
 * What a blank category cell is announced as: Excel draws no label there, and
 * an empty announcement would sound like nothing was read.
 */
export const BLANK_LABEL = '(blank)';

/** How the series of a bar or column chart share a category. */
type BarMode = 'clustered' | 'stacked' | 'stacked100';

/** How the bands of an area chart relate. */
type AreaMode = 'plain' | 'stacked' | 'stacked100';

/**
 * What a series is drawn as, read as the reading MAIDR gives it.
 *
 * `unsupported` carries why, for the console: the reader hears only that the
 * chart cannot be read yet.
 */
type Family
  = | { readonly kind: 'bar'; readonly mode: BarMode; readonly horizontal: boolean }
    | { readonly kind: 'line' }
    | { readonly kind: 'area'; readonly mode: AreaMode }
    | { readonly kind: 'pie' }
    | { readonly kind: 'scatter'; readonly lines: boolean }
    | { readonly kind: 'radar' }
    | { readonly kind: 'funnel' }
    | { readonly kind: 'stock'; readonly open: boolean; readonly volume: boolean }
    | { readonly kind: 'unsupported'; readonly reason: string };

/**
 * Why each declined family is declined, once, so the console says the same
 * thing wherever the chart is met.
 */
const DECLINED = {
  stackedLine:
    'a stacked line draws each series at the running total of the series '
    + 'before it. MAIDR has no stacked line reading: a line would announce '
    + 'the totals as the series\' own values, and a stacked area would name a '
    + 'chart the author did not draw.',
  ofPie: 'a pie of pie or bar of pie splits its slices across two plots by a rule Office.js does not report.',
  computed:
    'Excel computes what this chart draws -- bins, quartiles, running totals, '
    + 'a hierarchy or map regions -- and Office.js hands over only the source '
    + 'values it computed them from.',
  bubble: 'a bubble\'s size is a third magnitude no MAIDR scatter reading carries yet.',
  surface: 'a surface is a grid of values MAIDR does not read from Excel yet.',
  unknown: 'this chart type is not one MAIDR knows.',
} as const;

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
  LineStacked: { kind: 'unsupported', reason: DECLINED.stackedLine },
  LineStacked100: { kind: 'unsupported', reason: DECLINED.stackedLine },
  LineMarkersStacked: { kind: 'unsupported', reason: DECLINED.stackedLine },
  LineMarkersStacked100: { kind: 'unsupported', reason: DECLINED.stackedLine },
  Area: { kind: 'area', mode: 'plain' },
  AreaStacked: { kind: 'area', mode: 'stacked' },
  AreaStacked100: { kind: 'area', mode: 'stacked100' },
  Pie: { kind: 'pie' },
  PieExploded: { kind: 'pie' },
  Doughnut: { kind: 'pie' },
  DoughnutExploded: { kind: 'pie' },
  PieOfPie: { kind: 'unsupported', reason: DECLINED.ofPie },
  BarOfPie: { kind: 'unsupported', reason: DECLINED.ofPie },
  XYScatter: { kind: 'scatter', lines: false },
  XYScatterLines: { kind: 'scatter', lines: true },
  XYScatterLinesNoMarkers: { kind: 'scatter', lines: true },
  XYScatterSmooth: { kind: 'scatter', lines: true },
  XYScatterSmoothNoMarkers: { kind: 'scatter', lines: true },
  Radar: { kind: 'radar' },
  RadarMarkers: { kind: 'radar' },
  RadarFilled: { kind: 'radar' },
  Funnel: { kind: 'funnel' },
  StockHLC: { kind: 'stock', open: false, volume: false },
  StockOHLC: { kind: 'stock', open: true, volume: false },
  StockVHLC: { kind: 'stock', open: false, volume: true },
  StockVOHLC: { kind: 'stock', open: true, volume: true },
  Histogram: { kind: 'unsupported', reason: DECLINED.computed },
  Pareto: { kind: 'unsupported', reason: DECLINED.computed },
  Boxwhisker: { kind: 'unsupported', reason: DECLINED.computed },
  Waterfall: { kind: 'unsupported', reason: DECLINED.computed },
  Treemap: { kind: 'unsupported', reason: DECLINED.computed },
  Sunburst: { kind: 'unsupported', reason: DECLINED.computed },
  RegionMap: { kind: 'unsupported', reason: DECLINED.computed },
  Bubble: { kind: 'unsupported', reason: DECLINED.bubble },
  Bubble3DEffect: { kind: 'unsupported', reason: DECLINED.bubble },
  Surface: { kind: 'unsupported', reason: DECLINED.surface },
  SurfaceWireframe: { kind: 'unsupported', reason: DECLINED.surface },
  SurfaceTopView: { kind: 'unsupported', reason: DECLINED.surface },
  SurfaceTopViewWireframe: { kind: 'unsupported', reason: DECLINED.surface },
};

/**
 * What a chart type is called in a message, as Excel's Insert Chart dialog
 * names it, for every type a message can be about: the ones MAIDR declines.
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
 * @returns The family; `unsupported` for a type MAIDR does not read.
 */
function familyOf(chartType: string): Family {
  return FAMILIES[flatChartType(chartType)] ?? { kind: 'unsupported', reason: DECLINED.unknown };
}

/**
 * Whether MAIDR reads a chart type at all.
 *
 * A type it reads can still convert to nothing: a chart whose every value is
 * blank has nothing to navigate.
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
 * @returns The number; `null` for a blank or an error value, which Excel draws
 * no mark for; `undefined` for text that is not a number, which is a gap too
 * but one the console should hear about.
 */
function parseCell(raw: string | undefined): number | null | undefined {
  if (raw === undefined) {
    return null;
  }
  const text = raw.trim();
  if (text === '' || ERROR_VALUE.test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Read a series' values as numbers, one per position.
 *
 * A blank is a gap, `null`, never a zero: a zero is a reading, and sonifying a
 * blank as one would put a mark where the chart has none. Text that is not a
 * number is a gap too, and the console says which, since it may mean Excel
 * handed over formatted text rather than values.
 *
 * @param series - The series' name, for the warning.
 * @param raws - The dimension's strings.
 * @param length - How many positions to read.
 * @returns The values; `null` where there is none.
 */
function readNumbers(series: string, raws: readonly string[] | undefined, length: number): (number | null)[] {
  const values: (number | null)[] = [];
  const unreadable: string[] = [];
  for (let i = 0; i < length; i++) {
    const value = parseCell(raws?.[i]);
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

function buildAxes(x: string | undefined, y: string | undefined): NonNullable<MaidrLayer['axes']> {
  const axes: { x?: AxisConfig; y?: AxisConfig } = {};
  const xAxis = axisConfig(x);
  const yAxis = axisConfig(y);
  if (xAxis) {
    axes.x = xAxis;
  }
  if (yAxis) {
    axes.y = yAxis;
  }
  return axes;
}

/** The series one layer is built from, and what they are drawn as. */
interface Group {
  readonly family: Exclude<Family, { kind: 'unsupported' } | { kind: 'stock' }>;
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
}

/** A built layer, without its id, and the series it was built from. */
interface Built {
  readonly layer: Omit<MaidrLayer, 'id'>;
  readonly series: readonly ExcelSeriesSnapshot[];
}

function hasValue(values: readonly (number | null)[]): boolean {
  return values.some(value => value !== null);
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
 * position. Rows are named by series when there are several.
 */
function buildRows(group: Group, type: TraceType, labels: Labels): Built | null {
  const named = group.series.length > 1;
  let measured = false;
  const data: LinePoint[][] = group.series.map((series) => {
    const values = readNumbers(series.name, series.values, labels.categories.length);
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
 * An area chart's series as one layer. Each band carries its own series'
 * value, never the running edge: `AreaTrace` sums a stacked layer itself.
 * One series of a 100% stacked area stays normalized, as a bar does.
 */
function buildAreas(group: Group, mode: AreaMode, labels: Labels): Built | null {
  const single = group.series.length === 1;
  const type = mode === 'stacked100'
    ? TraceType.NORMALIZED_AREA
    : mode === 'stacked' && !single ? TraceType.STACKED_AREA : TraceType.AREA;
  return buildRows(group, type, labels);
}

/**
 * A pie or doughnut as one layer, from its first series: a doughnut's further
 * rings are named in a warning and not read. A blank, zero or negative value
 * has no slice in Excel's pie, so it has none here either.
 */
function buildPie(group: Group, labels: Labels): Built | null {
  const [series, ...rest] = group.series;
  if (rest.length > 0) {
    warn(`a pie reads one series; reading "${series.name}" and ignoring ${rest.length} more.`);
  }
  const values = readNumbers(series.name, series.values, labels.categories.length);
  const data: PiePoint[] = [];
  let negative = 0;
  values.forEach((value, i) => {
    if (value === null || value <= 0) {
      negative += value !== null && value < 0 ? 1 : 0;
      return;
    }
    data.push({ x: labels.categories[i], y: value });
  });
  if (negative > 0) {
    warn(`${negative} negative value(s) have no slice in a pie; skipping them.`);
  }
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
  const [series, ...rest] = group.series;
  if (rest.length > 0) {
    warn(`a funnel reads one series; reading "${series.name}" and ignoring ${rest.length} more.`);
  }
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
function scatterPoints(series: ExcelSeriesSnapshot): [number | null, number | null][] {
  const length = Math.max(series.xValues?.length ?? 0, series.yValues?.length ?? 0);
  const ys = readNumbers(series.name, series.yValues, length);
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
    const data: ScatterPoint[] = scatterPoints(series)
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
    const points = scatterPoints(series).filter((point): point is [number, number | null] => point[0] !== null);
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

/** The series of a stock chart, in the order Excel requires them. */
const STOCK_ORDER = {
  HLC: ['high', 'low', 'close'],
  OHLC: ['open', 'high', 'low', 'close'],
  VHLC: ['volume', 'high', 'low', 'close'],
  VOHLC: ['volume', 'open', 'high', 'low', 'close'],
} as const;

/**
 * A stock chart as one `candlestick` layer.
 *
 * Excel reads a stock chart's series by position -- open, high, low, close,
 * with volume first in the volume variants -- whatever they are called, so
 * they are read the same way here. A period missing its high, low or close,
 * or its open where the chart has one, is left out; a high-low-close chart
 * has no open at all, and `CandlestickPoint` leaves it out rather than
 * inventing one. The price axis is the secondary one when volume takes the
 * primary.
 */
function buildStock(
  snapshot: ExcelChartSnapshot,
  series: readonly ExcelSeriesSnapshot[],
  family: { open: boolean; volume: boolean },
  category: string | undefined,
): Built | null {
  const key = `${family.volume ? 'V' : ''}${family.open ? 'O' : ''}HLC` as keyof typeof STOCK_ORDER;
  const order = STOCK_ORDER[key];
  if (series.length !== order.length) {
    warn(
      `a ${snapshot.chartType} chart reads ${order.length} series (${order.join(', ')}), `
      + `in that order; this one has ${series.length}. Nothing to read.`,
    );
    return null;
  }
  const categories = categoryLabels(snapshot, series);
  const columns = new Map(order.map((field, i) =>
    [field, readNumbers(series[i].name, series[i].values, categories.length)] as const));
  const at = (field: (typeof order)[number], i: number): number | null => columns.get(field)?.[i] ?? null;

  const data: CandlestickPoint[] = [];
  categories.forEach((value, i) => {
    const high = at('high', i);
    const low = at('low', i);
    const close = at('close', i);
    const open = family.open ? at('open', i) : null;
    if (high === null || low === null || close === null || (family.open && open === null)) {
      return;
    }
    const volume = family.volume ? at('volume', i) : null;
    data.push({
      value,
      ...(open === null ? {} : { open }),
      high,
      low,
      close,
      ...(volume === null ? {} : { volume }),
      volatility: high - low,
    });
  });
  if (data.length === 0) {
    return null;
  }
  const price = shownText(family.volume ? snapshot.axes?.secondaryValue?.title : snapshot.axes?.value?.title);
  return {
    layer: { type: TraceType.CANDLESTICK, axes: buildAxes(category, price), data },
    series,
  };
}

/** The family every group key stands for, so equal families group together. */
function familyKey(family: Family): string {
  switch (family.kind) {
    case 'bar':
      return `bar:${family.mode}:${family.horizontal ? 'h' : 'v'}`;
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
 * in the order each group first appears.
 *
 * @returns The groups, or the first unsupported family met.
 */
function groupSeries(
  snapshot: ExcelChartSnapshot,
  series: readonly ExcelSeriesSnapshot[],
): Group[] | { readonly chartType: string; readonly reason: string } {
  const groups = new Map<string, { family: Group['family']; secondary: boolean; series: ExcelSeriesSnapshot[] }>();
  for (const one of series) {
    const chartType = one.chartType ?? snapshot.chartType;
    const family = familyOf(chartType);
    if (family.kind === 'unsupported') {
      return { chartType, reason: family.reason };
    }
    if (family.kind === 'stock') {
      return { chartType, reason: 'a stock series reads only as part of a stock chart.' };
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
  return [...groups.values()];
}

function buildGroup(group: Group, labels: Labels): Built[] {
  const { family } = group;
  switch (family.kind) {
    case 'bar':
      return [buildBars(group, family, labels)].filter((built): built is Built => built !== null);
    case 'line':
      return [buildRows(group, TraceType.LINE, labels)].filter((built): built is Built => built !== null);
    case 'area':
      return [buildAreas(group, family.mode, labels)].filter((built): built is Built => built !== null);
    case 'radar':
      return [buildRows(group, TraceType.RADAR, labels)].filter((built): built is Built => built !== null);
    case 'pie':
      return [buildPie(group, labels)].filter((built): built is Built => built !== null);
    case 'funnel':
      return [buildFunnel(group, labels)].filter((built): built is Built => built !== null);
    case 'scatter':
      return family.lines
        ? [buildScatterLines(group, labels)].filter((built): built is Built => built !== null)
        : buildScatter(group, labels);
  }
}

/**
 * Name the layers a reader could not otherwise tell apart.
 *
 * A layer switch announces the layer's type, which is enough between a
 * column layer and a line layer. Two layers of one type -- the clouds of a
 * scatter, or two lines on different value axes -- are told apart by name, so
 * each is named after its series.
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
 * What converting one snapshot came to: a figure, a chart type MAIDR cannot
 * read yet, or nothing to read. The binder tells the reader which.
 */
export type ExcelConversionOutcome
  = | { readonly kind: 'figure'; readonly maidr: Maidr }
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
  const chartFamily = familyOf(snapshot.chartType);
  const category = shownText(snapshot.axes?.category?.title) ?? (snapshot.categoryHeader?.trim() || undefined);

  let built: Built[];
  if (chartFamily.kind === 'stock') {
    const stock = buildStock(snapshot, visible, chartFamily, category);
    built = stock === null ? [] : [stock];
  } else {
    if (visible.length === 0) {
      warn(`${chart} has no series to read${snapshot.series.length > 0 ? ': a chart filter hides every one' : ''}.`);
      return { kind: 'empty' };
    }
    const groups = groupSeries(snapshot, visible);
    if (!Array.isArray(groups)) {
      warn(`${chart} is a ${excelChartTypeName(groups.chartType)} chart, which MAIDR cannot read: ${groups.reason}`);
      return { kind: 'unsupported', chartType: groups.chartType };
    }
    const labels: Labels = {
      category,
      categories: categoryLabels(snapshot, visible.filter(one => one.values !== undefined)),
      value: (group) => {
        const axis = group.secondary ? snapshot.axes?.secondaryValue : snapshot.axes?.value;
        return shownText(axis?.title) ?? (group.series.length === 1 ? group.series[0].name : undefined);
      },
    };
    built = groups.flatMap(group => buildGroup(group, labels));
  }
  if (built.length === 0) {
    warn(`${chart} has no value MAIDR can read: every reading is blank.`);
    return { kind: 'empty' };
  }

  nameLayers(built);
  const title = shownText(snapshot.title);
  const layers: MaidrLayer[] = built.map(({ layer }, index) => ({
    id: String(index),
    ...(title === undefined ? {} : { title }),
    ...layer,
  }));
  const subplot: MaidrSubplot = { layers };
  const drawn = built.flatMap(({ series }) => series.map(one => one.name));
  if (drawn.length > 1 && chartFamily.kind !== 'stock') {
    subplot.legend = drawn;
  }
  const maidr: Maidr = {
    id: options.id ?? nextFigureId(),
    subplots: [[subplot]],
  };
  if (title !== undefined) {
    maidr.title = title;
  }
  return { kind: 'figure', maidr };
}

/**
 * Convert a snapshot of an Excel chart into a MAIDR figure.
 *
 * @param snapshot - One read of a chart, from `readExcelChart` or written by
 * hand.
 * @param options - The figure id.
 * @returns The figure, or `null` -- with a console warning saying why -- when
 * the chart's type has no MAIDR reading yet, or it holds nothing to navigate.
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
