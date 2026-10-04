/**
 * Reads a DrawingML chart part (`c:chartSpace`) into the snapshot the Excel
 * adapter converts.
 *
 * A chart in a PowerPoint presentation or a Word document is a DrawingML chart
 * part, as an Excel chart is: the same schema, the same chart groups, and in
 * every file Office saves, a copy of each series' values as they were drawn,
 * its cache. Office.js offers no way to read a chart in PowerPoint or Word, so
 * the part itself is read, from that cache, into an {@link ExcelChartSnapshot}
 * -- what the Excel adapter's reader makes of a chart through Office.js -- and
 * the Excel adapter's converter makes a MAIDR figure of it.
 *
 * What the cache holds that Office.js does not report is read too: a custom
 * pie of pie split, and a chart's title as Excel would show it.
 *
 * @see https://learn.microsoft.com/openspecs/office_standards/ms-oi29500
 */

import type { ExcelAxisSnapshot, ExcelChartSnapshot, ExcelSeriesSnapshot, ExcelTitleSnapshot } from '../excel/types';
import { labelLevels } from '../excel/reader';
import { asNumber, categoryLabel } from './formats';
import { child, children, descendants, NS, path, richText, truthy, val } from './xml';

/** The most points a series is read with: a worksheet's row count. */
const MAX_POINTS = 1_048_576;

/** The most label levels a multi-level category is read with. */
const MAX_LEVELS = 32;

/** How many points a pie of pie moves to its second plot when the part does not say. */
const DEFAULT_SPLIT_POSITION = 3;

/** The chart groups read, by element name. */
type Kind
  = | 'barChart'
    | 'bar3DChart'
    | 'lineChart'
    | 'line3DChart'
    | 'pieChart'
    | 'pie3DChart'
    | 'doughnutChart'
    | 'ofPieChart'
    | 'scatterChart'
    | 'bubbleChart'
    | 'areaChart'
    | 'area3DChart'
    | 'radarChart'
    | 'stockChart'
    | 'surfaceChart'
    | 'surface3DChart';

const KINDS: ReadonlySet<string> = new Set<Kind>([
  'barChart',
  'bar3DChart',
  'lineChart',
  'line3DChart',
  'pieChart',
  'pie3DChart',
  'doughnutChart',
  'ofPieChart',
  'scatterChart',
  'bubbleChart',
  'areaChart',
  'area3DChart',
  'radarChart',
  'stockChart',
  'surfaceChart',
  'surface3DChart',
]);

/** The groups whose x values are numbers, read from `c:xVal`. */
const XY_KINDS: ReadonlySet<string> = new Set(['scatterChart', 'bubbleChart']);

/** What `c:dispBlanksAs` says, as `Excel.ChartDisplayBlanksAs` says it. */
const BLANKS: Readonly<Record<string, string>> = {
  gap: 'NotPlotted',
  zero: 'Zero',
  span: 'Interplotted',
};

/** What `c:splitType` says, as `Excel.ChartSplitType` says it. */
const SPLITS: Readonly<Record<string, string>> = {
  auto: 'SplitByPosition',
  pos: 'SplitByPosition',
  val: 'SplitByValue',
  percent: 'SplitByPercentValue',
  cust: 'SplitByCustomSplit',
};

/** One chart group of the plot area, read. */
interface GroupReading {
  readonly kind: string;
  readonly element: Element;
  /** Its `Excel.ChartType`, or `Invalid` for a group MAIDR does not know. */
  readonly chartType: string;
  /** Its series, each with its plot order and whether the part names it. */
  readonly series: readonly SeriesReading[];
  /** The axis its categories, or a scatter's x values, run along. */
  readonly categoryAxis: Element | null;
  /** The axis its values are measured on. */
  readonly valueAxis: Element | null;
  /** A 3-D chart's series axis. */
  readonly seriesAxis: Element | null;
  /** Whether its value axis is the secondary one, on the far side. */
  readonly secondary: boolean;
}

/** One series, read. */
interface SeriesReading {
  /** Its place in the chart's plot order, across every group. */
  readonly order: number;
  /** Whether the part names it; one that does not is called `Series<n>`. */
  readonly named: boolean;
  readonly snapshot: ExcelSeriesSnapshot;
}

/** What reading a group needs to know about the chart around it. */
interface ChartContext {
  readonly axes: ReadonlyMap<string, Element>;
  readonly date1904: boolean;
}

function intAttr(element: Element | null, local: string, fallback: number): number {
  const value = Number.parseInt(val(element, local) ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * The cached copy (or literal values) of a data source: `c:cat`, `c:val`,
 * `c:xVal`, `c:yVal`, `c:bubbleSize` or `c:tx`.
 */
function cacheOf(source: Element | null): Element | null {
  if (source === null) {
    return null;
  }
  for (const local of ['numCache', 'strCache', 'multiLvlStrCache']) {
    const found = descendants(source, NS.c, local)[0];
    if (found !== undefined) {
      return found;
    }
  }
  return child(source, NS.c, 'numLit') ?? child(source, NS.c, 'strLit');
}

/**
 * How many points a cache holds: as many as its highest index, not as many as
 * `c:ptCount` claims, so a damaged count cannot make a series of a million
 * blanks. A gap at the end is restored by the other dimension's length.
 */
function pointCount(points: readonly Element[]): number {
  let highest = -1;
  for (const point of points) {
    const index = Number.parseInt(point.getAttribute('idx') ?? '', 10);
    if (Number.isInteger(index) && index >= 0) {
      highest = Math.max(highest, index);
    }
  }
  return Math.min(highest + 1, MAX_POINTS);
}

/** A cache's points, one string per point, `''` for a gap. */
function cachedPoints(cache: Element): string[] {
  const points = children(cache, NS.c, 'pt');
  const out: string[] = Array.from({ length: pointCount(points) }, () => '');
  for (const point of points) {
    const index = Number.parseInt(point.getAttribute('idx') ?? '', 10);
    if (Number.isInteger(index) && index >= 0 && index < out.length) {
      out[index] = child(point, NS.c, 'v')?.textContent ?? '';
    }
  }
  return out;
}

/** The number format a cache records, unless it is `General`. */
function formatCodeOf(cache: Element | null): string | undefined {
  const code = child(cache, NS.c, 'formatCode')?.textContent?.trim();
  return code === undefined || code === '' || code.toLowerCase() === 'general' ? undefined : code;
}

/** An axis' own number format, when it is not linked to its data's. */
function axisFormat(axis: Element | null): string | undefined {
  const format = child(axis, NS.c, 'numFmt');
  if (format === null || truthy(format.getAttribute('sourceLinked'))) {
    return undefined;
  }
  const code = format.getAttribute('formatCode') ?? '';
  return code === '' || code.toLowerCase() === 'general' ? undefined : code;
}

/** The values of a source as Office.js returns them: the cached text, `''` for a gap. */
function rawValues(source: Element | null): string[] {
  const cache = cacheOf(source);
  return cache === null ? [] : cachedPoints(cache);
}

/** A multi-level category's levels: one list per category, outer first, carried down as Excel reads them. */
function multiLevels(cache: Element): string[][] {
  const levels = children(cache, NS.c, 'lvl').slice(0, MAX_LEVELS);
  const count = Math.min(intAttr(cache, 'ptCount', 0) || 0, MAX_POINTS);
  // Innermost first in the part; a row per category, outer first, here.
  const columns = levels.map(cachedPoints).reverse();
  const length = Math.max(count, ...columns.map(column => column.length));
  const rows = Array.from({ length }, (_, i) => columns.map(column => column[i] ?? ''));
  return labelLevels(rows, 'rows');
}

/**
 * A category source's labels, as the axis shows them, and its levels when it
 * has more than one.
 */
function categoryValues(
  source: Element | null,
  axis: Element | null,
  context: ChartContext,
): { labels: string[]; levels?: string[][] } {
  const cache = cacheOf(source);
  if (cache === null) {
    return { labels: [] };
  }
  if (cache.localName === 'multiLvlStrCache') {
    const levels = multiLevels(cache);
    return { labels: levels.map(list => list.filter(level => level !== '').join(' ')), levels };
  }
  const numeric = cache.localName === 'numCache' || cache.localName === 'numLit';
  const code = axisFormat(axis) ?? formatCodeOf(cache);
  const dates = axis !== null && axis.localName === 'dateAx';
  return { labels: cachedPoints(cache).map(value => categoryLabel(value, numeric, code, dates, context.date1904)) };
}

/**
 * A scatter's x values: its numbers, or 1, 2, 3, ... when it has none or any
 * is text, as Excel then plots the series.
 */
function xValues(source: Element | null, count: number): string[] {
  const raw = rawValues(source);
  const text = raw.some(value => value.trim() !== '' && asNumber(value) === undefined);
  if (raw.length === 0 || text) {
    return Array.from({ length: count }, (_, i) => String(i + 1));
  }
  return raw;
}

/** A series' name: its literal, or the first point of its cached reference. */
function seriesName(ser: Element): string | undefined {
  const tx = child(ser, NS.c, 'tx');
  const literal = child(tx, NS.c, 'v')?.textContent?.trim();
  if (literal !== undefined && literal !== '') {
    return literal;
  }
  const cached = rawValues(tx)[0]?.trim();
  return cached === undefined || cached === '' ? undefined : cached;
}

/** Whether a series draws markers: unless its marker symbol is `none`. */
function showsMarkers(ser: Element): boolean {
  return path(ser, NS.c, 'marker', 'symbol')?.getAttribute('val') !== 'none';
}

/** Whether a series draws no line: its outline has no fill. */
function drawsNoLine(ser: Element): boolean {
  const line = path(ser, NS.c, 'spPr');
  const outline = line === null ? null : child(line, NS.a, 'ln');
  return outline !== null && child(outline, NS.a, 'noFill') !== null;
}

/** The suffix `Excel.ChartType` gives a grouping. */
function stacking(group: Element): string {
  const grouping = val(group, 'grouping', 'standard');
  if (grouping === 'stacked') {
    return 'Stacked';
  }
  return grouping === 'percentStacked' ? 'Stacked100' : '';
}

/**
 * A chart group's `Excel.ChartType`. The 3-D and shaped variants read as
 * their flat type, as the Excel adapter reads them.
 */
function chartTypeOf(kind: string, group: Element, sers: readonly Element[]): string {
  switch (kind) {
    case 'barChart':
    case 'bar3DChart':
      return `${val(group, 'barDir', 'col') === 'bar' ? 'Bar' : 'Column'}${stacking(group) || 'Clustered'}`;
    case 'lineChart':
    case 'line3DChart':
      return `Line${kind === 'lineChart' && sers.some(showsMarkers) ? 'Markers' : ''}${stacking(group)}`;
    case 'areaChart':
    case 'area3DChart':
      return `Area${stacking(group)}`;
    case 'pieChart':
    case 'pie3DChart':
      return 'Pie';
    case 'doughnutChart':
      return 'Doughnut';
    case 'ofPieChart':
      return val(group, 'ofPieType', 'pie') === 'bar' ? 'BarOfPie' : 'PieOfPie';
    case 'scatterChart': {
      const style = val(group, 'scatterStyle', 'lineMarker') ?? 'lineMarker';
      const lines = style !== 'marker' && style !== 'none' && sers.some(ser => !drawsNoLine(ser));
      if (!lines) {
        return 'XYScatter';
      }
      const smooth = style.startsWith('smooth') || sers.some(ser => truthy(val(ser, 'smooth')));
      return `XYScatter${smooth ? 'Smooth' : 'Lines'}${sers.some(showsMarkers) ? '' : 'NoMarkers'}`;
    }
    case 'bubbleChart':
      return truthy(val(group, 'bubble3D')) ? 'Bubble3DEffect' : 'Bubble';
    case 'radarChart': {
      const style = val(group, 'radarStyle', 'standard');
      if (style === 'filled') {
        return 'RadarFilled';
      }
      return style === 'marker' && sers.some(showsMarkers) ? 'RadarMarkers' : 'Radar';
    }
    case 'stockChart':
      return sers.length >= 4 ? 'StockOHLC' : 'StockHLC';
    case 'surfaceChart':
      return truthy(val(group, 'wireframe')) ? 'SurfaceTopViewWireframe' : 'SurfaceTopView';
    case 'surface3DChart':
      return truthy(val(group, 'wireframe')) ? 'SurfaceWireframe' : 'Surface';
    default:
      return 'Invalid';
  }
}

/** A pie of pie's split, as the series' snapshot carries it. */
function splitOf(group: Element): Pick<ExcelSeriesSnapshot, 'splitType' | 'splitValue' | 'splitPoints'> {
  const type = val(group, 'splitType', 'auto') ?? 'auto';
  const splitType = SPLITS[type] ?? 'SplitByPosition';
  if (splitType === 'SplitByCustomSplit') {
    const points = children(child(group, NS.c, 'custSplit'), NS.c, 'secondPiePt')
      .map(point => Number.parseInt(point.getAttribute('val') ?? '', 10))
      .filter(index => Number.isInteger(index) && index >= 0);
    return { splitType, splitPoints: points };
  }
  const value = asNumber(val(group, 'splitPos'));
  if (value === undefined) {
    return splitType === 'SplitByPosition' ? { splitType, splitValue: DEFAULT_SPLIT_POSITION } : { splitType };
  }
  return { splitType, splitValue: value };
}

/** The axes a group is drawn on, by role. */
function groupAxes(
  kind: string,
  group: Element,
  context: ChartContext,
): Pick<GroupReading, 'categoryAxis' | 'valueAxis' | 'seriesAxis'> {
  const own = children(group, NS.c, 'axId')
    .map(id => context.axes.get(id.getAttribute('val') ?? ''))
    .filter((axis): axis is Element => axis !== undefined);
  const seriesAxis = own.find(axis => axis.localName === 'serAx') ?? null;
  if (XY_KINDS.has(kind)) {
    const categoryAxis = own.find(axis => ['b', 't'].includes(val(axis, 'axPos', 'b') ?? 'b')) ?? null;
    return { categoryAxis, valueAxis: own.find(axis => axis !== categoryAxis) ?? null, seriesAxis };
  }
  return {
    categoryAxis: own.find(axis => axis.localName === 'catAx' || axis.localName === 'dateAx') ?? null,
    valueAxis: own.find(axis => axis.localName === 'valAx') ?? null,
    seriesAxis,
  };
}

/** One series of a group, as the snapshot carries it. */
function readSeries(
  kind: string,
  chartType: string,
  group: Element,
  ser: Element,
  categoryAxis: Element | null,
  context: ChartContext,
): { snapshot: ExcelSeriesSnapshot; named: boolean; levels?: string[][] } {
  const own = seriesName(ser);
  // Excel's name for a series that has none.
  const name = own ?? `Series${intAttr(ser, 'idx', 0) + 1}`;
  const named = own !== undefined;
  if (XY_KINDS.has(kind)) {
    const yValues = rawValues(child(ser, NS.c, 'yVal'));
    const sizes = kind === 'bubbleChart' ? rawValues(child(ser, NS.c, 'bubbleSize')) : [];
    const count = Math.max(yValues.length, sizes.length);
    const x = xValues(child(ser, NS.c, 'xVal'), count);
    const length = Math.max(count, x.length);
    const pad = (values: string[]): string[] => [...values, ...Array.from({ length: length - values.length }, () => '')];
    return {
      snapshot: {
        name,
        chartType,
        xValues: pad(x),
        yValues: pad(yValues),
        ...(kind === 'bubbleChart' ? { bubbleSizes: pad(sizes) } : {}),
      },
      named,
    };
  }
  const { labels, levels } = categoryValues(child(ser, NS.c, 'cat'), categoryAxis, context);
  const values = rawValues(child(ser, NS.c, 'val'));
  const length = Math.max(labels.length, values.length);
  const pad = (list: string[]): string[] => [...list, ...Array.from({ length: length - list.length }, () => '')];
  const pie = kind === 'pieChart' || kind === 'pie3DChart' || kind === 'doughnutChart';
  return {
    snapshot: {
      name,
      chartType,
      categories: pad(labels),
      values: pad(values),
      ...(pie ? { firstSliceAngle: asNumber(val(group, 'firstSliceAng')) ?? 0 } : {}),
      ...(kind === 'ofPieChart' ? splitOf(group) : {}),
    },
    named,
    ...(levels !== undefined && levels.some(list => list.length > 1) ? { levels } : {}),
  };
}

/** Read one chart group. */
function readGroup(
  kind: string,
  group: Element,
  context: ChartContext,
): GroupReading & { readonly levels?: string[][] } {
  const sers = children(group, NS.c, 'ser');
  const chartType = KINDS.has(kind) ? chartTypeOf(kind, group, sers) : 'Invalid';
  const axes = groupAxes(kind, group, context);
  const horizontal = kind.startsWith('bar') && val(group, 'barDir', 'col') === 'bar';
  const position = val(axes.valueAxis, 'axPos', horizontal ? 'b' : 'l');
  let levels: string[][] | undefined;
  const series = sers.map((ser) => {
    const read = readSeries(kind, chartType, group, ser, axes.categoryAxis, context);
    levels ??= read.levels;
    return { order: intAttr(ser, 'order', intAttr(ser, 'idx', 0)), named: read.named, snapshot: read.snapshot };
  });
  return {
    kind,
    element: group,
    chartType,
    series,
    ...axes,
    secondary: position === (horizontal ? 't' : 'r'),
    ...(levels === undefined ? {} : { levels }),
  };
}

/** A title's text, from its rich text or its cached reference. */
function titleText(title: Element | null): string | undefined {
  if (title === null) {
    return undefined;
  }
  const tx = child(title, NS.c, 'tx');
  if (tx === null) {
    return undefined;
  }
  const rich = richText(child(tx, NS.c, 'rich'));
  if (rich !== undefined) {
    return rich;
  }
  const cached = rawValues(tx)[0]?.trim();
  return cached === undefined || cached === '' ? undefined : cached;
}

/** An axis' title, shown when the axis is. */
function axisSnapshot(axis: Element | null): ExcelAxisSnapshot | undefined {
  if (axis === null) {
    return undefined;
  }
  const text = titleText(child(axis, NS.c, 'title'));
  if (text === undefined) {
    return {};
  }
  return { title: { text, visible: !truthy(val(axis, 'delete', '0')) } };
}

/**
 * The title Excel shows on the chart: its own, or, for a chart of one named
 * series whose automatic title the author has not deleted, the series' name.
 */
function chartTitle(chart: Element, series: readonly SeriesReading[]): ExcelTitleSnapshot | undefined {
  const own = titleText(child(chart, NS.c, 'title'));
  if (own !== undefined) {
    return { text: own, visible: true };
  }
  if (truthy(val(chart, 'autoTitleDeleted', '0'))) {
    return undefined;
  }
  if (series.length === 1 && series[0].named) {
    return { text: series[0].snapshot.name, visible: true };
  }
  return undefined;
}

/**
 * Read a DrawingML chart part.
 *
 * @param root - The part's root element, `c:chartSpace`.
 * @returns The chart, as the Excel adapter converts it; `null` when the part
 * is not a chart. A chart of groups MAIDR does not know reads as
 * `Invalid`, so the converter says it cannot read it.
 */
export function readChartPart(root: Element): ExcelChartSnapshot | null {
  if (root.namespaceURI !== NS.c || root.localName !== 'chartSpace') {
    return null;
  }
  const chart = child(root, NS.c, 'chart');
  if (chart === null) {
    return null;
  }
  const plotArea = child(chart, NS.c, 'plotArea');
  const axes = new Map<string, Element>();
  for (const element of Array.from(plotArea?.children ?? [])) {
    if (element.namespaceURI === NS.c && ['catAx', 'valAx', 'dateAx', 'serAx'].includes(element.localName)) {
      axes.set(val(element, 'axId') ?? '', element);
    }
  }
  const context: ChartContext = { axes, date1904: truthy(val(root, 'date1904', '0')) };
  const groups = Array.from(plotArea?.children ?? [])
    .filter(element => element.namespaceURI === NS.c && element.localName.endsWith('Chart'))
    .map(element => readGroup(element.localName, element, context))
    .filter(group => group.series.length > 0);
  if (groups.length === 0) {
    return { chartType: 'Invalid', series: [] };
  }
  // A chart whose every group is on the far axis has no other: read it as near.
  const everySecondary = groups.every(group => group.secondary);
  const axisGroup = (group: GroupReading): 'Primary' | 'Secondary' => (group.secondary && !everySecondary ? 'Secondary' : 'Primary');
  const ordered = groups
    .flatMap(group => group.series.map(one => ({ group, one: { ...one, snapshot: { ...one.snapshot, axisGroup: axisGroup(group) } } })))
    .sort((a, b) => a.one.order - b.one.order);

  let chartType = groups.find(group => group.chartType !== 'Invalid')?.chartType ?? 'Invalid';
  let series = ordered.map(({ one }) => one);
  const stock = groups.find(group => group.kind === 'stockChart');
  if (stock !== undefined) {
    // A stock chart reads by position: its volume first, then its prices.
    const prices = ordered.filter(({ group }) => group === stock).map(({ one }) => one);
    const volume = ordered.find(({ group }) => group.kind === 'barChart')?.one;
    chartType = `Stock${volume === undefined ? '' : 'V'}${prices.length >= 4 ? 'O' : ''}HLC`;
    series = [...(volume === undefined ? [] : [volume]), ...prices]
      .map(one => ({ ...one, snapshot: { ...one.snapshot, chartType } }));
  }

  const primary = groups.find(group => !group.secondary || everySecondary) ?? groups[0];
  const secondary = everySecondary ? undefined : groups.find(group => group.secondary);
  const levels = groups.find(group => group.levels !== undefined)?.levels;
  const category = axisSnapshot(primary.categoryAxis);
  const value = axisSnapshot(primary.valueAxis);
  const secondaryValue = axisSnapshot(secondary?.valueAxis ?? null);
  const seriesAxis = axisSnapshot(primary.seriesAxis);
  const title = chartTitle(chart, series);
  const blanks = BLANKS[val(chart, 'dispBlanksAs', 'gap') ?? 'gap'];
  return {
    chartType,
    ...(blanks === undefined ? {} : { displayBlanksAs: blanks }),
    ...(title === undefined ? {} : { title }),
    axes: {
      ...(category === undefined ? {} : { category }),
      ...(value === undefined ? {} : { value }),
      ...(secondaryValue === undefined ? {} : { secondaryValue }),
      ...(seriesAxis === undefined ? {} : { series: seriesAxis }),
    },
    series: series.map(one => one.snapshot),
    ...(levels === undefined ? {} : { categoryLevels: levels }),
  };
}
