import type {
  BarPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
  TreemapPoint,
} from '@type/grammar';
import type { AxisCategories } from './grid';
import type { ChartBox } from './selectors';
import type {
  EChartsComponentModel,
  EChartsInstance,
  EChartsList,
  EChartsModel,
  EChartsSeriesModel,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';
import { drawCanvasMarks } from './canvas';
import { dimensionOf } from './dimension';
import {
  boxplotLayer,
  candlestickLayer,
  categoriesOf,
  drawnCandleCount,
  drawnGridCount,
  GRID_VALUE,
  heatmapLayer,
} from './grid';
import {
  HIERARCHY,
  hierarchyLayer,
  hierarchyNodes,
  OUTLINED_HIERARCHY,
} from './hierarchy';
import {
  drawnBandCount,
  instant,
  PARALLEL,
  parallelLayer,
  THEME_RIVER,
  themeRiverLayer,
} from './multiAxis';
import { NETWORK, networkLayer } from './network';
import { drawnOutlineCount, RADAR, radarLayer } from './radar';
import { markLegends, markPerDatum, markPerSeries } from './selectors';
import { drawnValueCount, SINGLE_VALUE, singleValueLayers } from './single';

/**
 * Options accepted by {@link createMaidrFromEChart}.
 */
export interface EChartsAdapterOptions {
  /** The figure's id. Defaults to the container's, then to a generated one. */
  id?: string;
  /** The figure's title. Defaults to the chart's own `title.text`. */
  title?: string;
}

/**
 * The series types that live on a grid.
 *
 * Not the whole of what the adapter reads -- see `READ` below, which is this
 * set together with the single-valued ones. The two are kept apart because
 * they are read by different code: one has axes and positions, the other
 * names and magnitudes.
 */
const CARTESIAN: ReadonlySet<string> = new Set([
  'bar',
  'line',
  'scatter',
  'pictorialBar',
]);

/**
 * The series types read as a bar.
 *
 * `pictorialBar` swaps the rectangle for a repeated symbol and changes
 * nothing else. Measured on echarts 6.1.0, its model reports the same
 * `['x', 'y']` a plain bar does, `getName(i)` gives the same category, and it
 * paints one filled mark per datum in data order -- confirmed by giving each
 * datum its own `itemStyle.color` and reading the fills in document order.
 * So it takes the bar reading whole, highlighting included, and the only
 * thing this set exists for is to say so once rather than in two filters.
 */
const BAR: ReadonlySet<string> = new Set(['bar', 'pictorialBar']);

/**
 * Everything the adapter reads.
 *
 * Every series type this adapter has measured now has a reading, so nothing
 * is refused for want of one. A type outside this set is still refused **by
 * name** rather than mapped onto whichever trace is closest -- an ECharts
 * extension such as `wordCloud` registers its own, and core gains types
 * between releases.
 *
 * Two of the readings carry no outline, for reasons measured off the drawing
 * rather than assumed; `grid.ts`'s footer records both.
 *
 * Exported because `EChartsSeriesType` is the public statement of this set
 * and the two have to agree. They drifted once already: tier 2b added
 * `heatmap` and `candlestick` here and left the union naming six types, so
 * the published type refused a series the adapter reads.
 * `test/adapters/echarts/cartesian.test.ts` now fails if they disagree in
 * either direction.
 */
export const READ: ReadonlySet<string> = new Set([
  ...CARTESIAN,
  ...SINGLE_VALUE,
  ...GRID_VALUE,
  ...HIERARCHY,
  ...NETWORK,
  ...THEME_RIVER,
  ...PARALLEL,
  ...RADAR,
]);

/**
 * The series types that take over the whole chart rather than sit on a grid.
 *
 * A pie, a funnel and a gauge carry one magnitude per named thing; a
 * treemap, sunburst or tree carries a hierarchy; a sankey or graph carries
 * a graph; a themeRiver sits on a `singleAxis`, a parallel on one
 * `parallelAxis` per variable, and a radar on a `radar` component. What they
 * share is that the chart is theirs alone -- none of them sits on the x/y
 * grid.
 */
const OWNS_CHART: ReadonlySet<string> = new Set([
  ...SINGLE_VALUE,
  ...HIERARCHY,
  ...NETWORK,
  ...THEME_RIVER,
  ...PARALLEL,
  ...RADAR,
]);

/**
 * Converts a rendered ECharts instance into a MAIDR figure.
 *
 * Read from the chart's **model** rather than from its geometry:
 * `getModel()` resolves every default the author did not write, so the
 * values, the series names, the axis names and the stacking are all
 * available without measuring a pixel. The drawing is consulted only to
 * locate marks -- see `selectors.ts` for why that is the harder half.
 *
 * @param chart     - The instance returned by `echarts.init`
 * @param container - The element it was rendered into
 * @param options   - Overrides for the figure's id and title
 * @returns The MAIDR figure
 * @throws When no series the adapter reads is present
 */
export function createMaidrFromEChart(
  chart: EChartsInstance,
  container: HTMLElement,
  options: EChartsAdapterOptions = {},
): Maidr {
  if (!container.id) {
    container.id = nextId('maidr-echarts');
  }

  const model = chart.getModel();
  const series: EChartsSeriesModel[] = [];
  model.eachSeries(seriesModel => series.push(seriesModel));

  const readable = series.filter(seriesModel => READ.has(seriesModel.subType));
  if (readable.length === 0) {
    const seen = series.map(seriesModel => seriesModel.subType).join(', ') || 'none';
    throw new Error(
      `Unsupported ECharts series type(s): ${seen}. `
      + `Supported types: ${[...READ].join(', ')}.`,
    );
  }

  // A canvas has no elements to point at, so its marks are drawn from the
  // model into an overlay first; see `canvas.ts`. An SVG chart is untouched.
  drawCanvasMarks(container, readable);

  // Set aside before anything is counted: a legend's icons are painted like
  // the marks they stand for (#1315).
  markLegends(container, legendBoxes(chart, model));

  const owning = readable.filter(seriesModel => OWNS_CHART.has(seriesModel.subType));
  const layers = owning.length > 0
    // A pie, a funnel, a gauge, a hierarchy and a graph each own the whole
    // chart -- none of them sits on a grid -- so a figure holding one holds
    // nothing else this adapter would stamp, and the two stamping passes
    // never meet. A chart that declares both families anyway is read as the
    // owning half and says so, rather than dropping the other in silence.
    ? readOwning(owning, readable, container, model)
    : buildLayers(readable, axisNames(model, readable), categories(model), container);
  const title = options.title ?? componentText(model, 'title', 'text');
  const subplot: MaidrSubplot = { layers };

  return {
    id: options.id ?? container.id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
}

/**
 * Where each legend on the chart was drawn, in the chart's pixels.
 *
 * Read from the legend's view, since its model keeps no layout: the view's
 * group holds everything the legend drew -- icons, labels, the pager of a
 * scrolling legend -- and its bounding rect, carried through the group's
 * transform, is the box they sit in. A legend that is hidden draws nothing and
 * has no box; an instance without the view accessor yields none at all, and
 * the chart is counted as it was before.
 *
 * @param chart - The rendered instance
 * @param model - Its model
 * @returns One box per drawn legend
 */
function legendBoxes(chart: EChartsInstance, model: EChartsModel): ChartBox[] {
  if (typeof chart.getViewOfComponentModel !== 'function') {
    return [];
  }

  const boxes: ChartBox[] = [];
  model.eachComponent({ mainType: 'legend' }, (legend) => {
    const group = chart.getViewOfComponentModel?.(legend)?.group;
    if (!group) {
      return;
    }
    const rect = group.getBoundingRect();
    if (!(rect.width > 0 && rect.height > 0)) {
      return;
    }

    const [a, b, c, d, e, f] = group.getComputedTransform?.()
      ?? [1, 0, 0, 1, group.x ?? 0, group.y ?? 0];
    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
    ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    boxes.push({
      x: left,
      y: top,
      width: Math.max(...xs) - left,
      height: Math.max(...ys) - top,
    });
  });
  return boxes;
}

/**
 * The layers of a chart whose series own it outright.
 *
 * @param owning    - The series that own the chart
 * @param readable  - Every series the adapter reads, including those
 * @param container - The element the chart was rendered into
 * @param model     - The chart's model, for the axes a themeRiver or a
 *                    parallel is drawn against
 * @returns One or more layers per series
 */
function readOwning(
  owning: EChartsSeriesModel[],
  readable: EChartsSeriesModel[],
  container: HTMLElement,
  model: EChartsModel,
): MaidrLayer[] {
  if (owning.length !== readable.length) {
    const dropped = readable
      .filter(seriesModel => !OWNS_CHART.has(seriesModel.subType))
      .map(seriesModel => seriesModel.subType)
      .join(', ');
    console.warn(
      `[MAIDR] ECharts chart mixes whole-chart and gridded series. `
      + `Reading the whole-chart ones; ignoring: ${dropped}.`,
    );
  }

  // Found in one pass for every series, the way the gridded path does it.
  // `markPerDatum` counts every filled mark in the SVG, so asking it once per
  // series compares one series' count against the whole chart's marks: a
  // nested pie -- two pie series, an inner ring and an outer one -- has both
  // counts disagree and both rings lose their outline. It also unstamps
  // before the count, so a later series with nothing to count would strip the
  // stamps an earlier series' selectors already name.
  // A hierarchy is walked once and its nodes serve both the count and the
  // layer: the walk allocates a point per node, copies the ancestor path at
  // each one and reads every node's and every child's value, so a sunburst of
  // a few thousand nodes paid all of that twice for a number the first walk
  // already had.
  const nodes = owning.map(seriesModel =>
    HIERARCHY.has(seriesModel.subType) ? hierarchyNodes(seriesModel) : undefined);
  const counts = owning.map((seriesModel, index) =>
    ownedMarkCount(seriesModel, nodes[index]));
  const marks = markPerDatum(container, counts);
  const eachMarkOf = (index: number): string[] | undefined =>
    counts[index] > 0 ? marks?.points[index] : undefined;
  const wholeSeriesOf = (index: number): string | undefined =>
    counts[index] > 0 ? marks?.series[index] : undefined;

  return owning.flatMap((seriesModel, index) => {
    if (SINGLE_VALUE.has(seriesModel.subType)) {
      return singleValueLayers(seriesModel, eachMarkOf(index), wholeSeriesOf(index));
    }
    if (NETWORK.has(seriesModel.subType)) {
      const layer = networkLayer(seriesModel);
      return layer ? [layer] : [];
    }
    if (THEME_RIVER.has(seriesModel.subType)) {
      const layer = themeRiverLayer(seriesModel, model, eachMarkOf(index));
      return layer ? [layer] : [];
    }
    if (PARALLEL.has(seriesModel.subType)) {
      const layer = parallelLayer(seriesModel, model);
      return layer ? [layer] : [];
    }
    if (RADAR.has(seriesModel.subType)) {
      const outlines = markPerSeries(container, drawnOutlineCount(seriesModel));
      const layer = radarLayer(seriesModel, model, outlines);
      return layer ? [layer] : [];
    }
    const layer = hierarchyLayer(seriesModel, nodes[index] ?? [], eachMarkOf(index));
    return layer ? [layer] : [];
  });
}

/**
 * How many per-datum filled marks a whole-chart series drew.
 *
 * Zero says the series has no mark this pass can pair, and every reading that
 * answers zero says so for a measured reason: a gauge draws a track and a
 * progress arc for its one datum, a graph and a parallel draw no filled
 * per-datum mark at all, and among the hierarchies only a sunburst's marks
 * can be paired -- see `hierarchy.ts` -- so a treemap's leaf-only painting is
 * never mistaken for a count that merely came out wrong.
 *
 * @param seriesModel - The series to ask
 * @param nodes       - Its walked nodes, when it carries a hierarchy
 * @returns The number of marks the drawing should hold for it
 */
function ownedMarkCount(
  seriesModel: EChartsSeriesModel,
  nodes: TreemapPoint[] | undefined,
): number {
  if (SINGLE_VALUE.has(seriesModel.subType)) {
    return drawnValueCount(seriesModel);
  }
  if (THEME_RIVER.has(seriesModel.subType)) {
    return drawnBandCount(seriesModel);
  }
  if (OUTLINED_HIERARCHY.has(seriesModel.subType)) {
    return nodes?.length ?? 0;
  }
  return 0;
}

/**
 * Which way the chart is drawn, and what each axis is called.
 *
 * ECharts has no "horizontal" option: a bar chart is turned on its side by
 * making the **y** axis the categorical one, which is how the model reports
 * it and the only thing that says so. Measured on a horizontal bar, the
 * series' own values come back `[magnitude, categoryIndex]` -- already in
 * axis terms -- so the orientation decides which of the pair is the reading
 * rather than requiring the payload to be turned over afterwards.
 */
interface Axes {
  x: string;
  y: string;
  horizontal: boolean;
  /**
   * Whether the axis the points are positioned along is `type: 'time'`,
   * whose positions ECharts hands over as epoch milliseconds -- see
   * {@link positionOf}.
   */
  dated: boolean;
  /**
   * Whether a time is announced in UTC, which ECharts' `useUTC` decides for
   * the whole chart -- see {@link instant}.
   */
  utc: boolean;
  /** Whether the x axis names categories rather than measuring anything. */
  categoricalX: boolean;
}

function axisNames(model: EChartsModel, series: EChartsSeriesModel[]): Axes {
  const x = firstComponent(model, 'xAxis');
  const y = firstComponent(model, 'yAxis');

  const xType = text(x?.get('type'));
  const yType = text(y?.get('type'));
  // A time axis is a position axis too. Superset turns a time-series bar on
  // its side by exchanging its axes, which leaves `yAxis: {type: 'time'}`
  // against `xAxis: {type: 'value'}` -- measured on Superset 6.1.0, where the
  // bars were read upright with their dates as the magnitude's partner and
  // announced as "1704067200000" (#1304). Only for bars: a line drawn down a
  // time axis on y was read correctly as it was, x against its own name, and
  // turning it would pair each axis's name with the other axis's values.
  const sidewaysTime = yType === 'time'
    && xType !== 'time'
    && xType !== 'category'
    && series.every(seriesModel => BAR.has(seriesModel.subType));
  const horizontal = yType === 'category' || sidewaysTime;

  return {
    x: text(x?.get('name')),
    y: text(y?.get('name')),
    horizontal,
    dated: (horizontal ? yType : xType) === 'time',
    // ECharts' own default is local time; a model that cannot say is read in
    // UTC, which is what both Superset and Metabase ask for.
    utc: model.get ? model.get('useUTC') === true : true,
    categoricalX: xType === 'category',
  };
}

function firstComponent(
  model: EChartsModel,
  mainType: string,
): EChartsComponentModel | undefined {
  let first: EChartsComponentModel | undefined;
  model.eachComponent({ mainType }, (component, index) => {
    if (index === 0) {
      first = component;
    }
  });
  return first;
}

function componentText(model: EChartsModel, mainType: string, key: string): string {
  return text(firstComponent(model, mainType)?.get(key));
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * One layer per reading, in the order the series were declared.
 *
 * Bar series are gathered rather than emitted one by one: two of them are a
 * dodged* chart and two sharing a `stack` are a *stacked* one, and both are
 * a single layer whose points carry their series name. Lines and scatters
 * stay one layer each, which is what they are.
 */
function buildLayers(
  series: EChartsSeriesModel[],
  axes: Axes,
  grid: AxisCategories,
  container: HTMLElement,
): MaidrLayer[] {
  const bars = series.filter(seriesModel => BAR.has(seriesModel.subType));
  const others = series.filter(seriesModel => !BAR.has(seriesModel.subType));

  // Every per-datum mark of the chart is painted alike and only its position
  // tells it apart, so they are located once for all of them, in the order
  // the series were declared. A heat cell and a candle body join that pool:
  // both are one filled mark per datum, which is the only thing the count
  // check asks of a series.
  // A boxplot is excluded alongside a line: it paints one path per box, but
  // that path is box AND whiskers together, which no selector shape wants --
  // counting it would spend a slot and shift every later series' marks.
  // A line declared with `areaStyle` is the exception among lines: it fills
  // the band under its curve in the series colour, which is a mark by every
  // test `isFilledMark` applies. Excluded, the band is found among the
  // candidates with nothing to account for it, and the mismatch drops the
  // highlighting of every other series on the chart along with its own.
  const marked = series.filter(seriesModel =>
    seriesModel.subType !== 'boxplot'
    && (seriesModel.subType !== 'line' || fillsBand(seriesModel)));
  const perDatum = markPerDatum(
    container,
    marked.map(seriesModel => drawnMarks(seriesModel, axes, grid)),
  );
  // A bar names each of its marks; a scatter names its series in one string.
  // Not a preference: `ScatterTrace` reads `layer.selectors as string` and
  // `Svg.selectAllElements` guards on `typeof query === 'string'`, so an
  // array there matches nothing and the layer loses its highlighting without
  // saying so -- the failure `Svg.isUsableSelector` was written for (#990).
  const eachMarkOf = (seriesModel: EChartsSeriesModel): string[] | undefined =>
    perDatum?.points[marked.indexOf(seriesModel)];
  const wholeSeriesOf = (seriesModel: EChartsSeriesModel): string | undefined =>
    perDatum?.series[marked.indexOf(seriesModel)];

  const layers: MaidrLayer[] = [];
  if (bars.length > 0) {
    layers.push(barLayer(bars, axes, eachMarkOf));
  }

  const lines = others.filter(seriesModel => seriesModel.subType === 'line');
  const polylines = markPerSeries(container, lines.length);
  for (const seriesModel of others) {
    const layer = otherLayer(
      seriesModel,
      axes,
      grid,
      polylines?.[lines.indexOf(seriesModel)],
      eachMarkOf(seriesModel),
      wholeSeriesOf(seriesModel),
    );
    if (layer) {
      layers.push(layer);
    }
  }

  return layers;
}

/**
 * The layer for one non-bar series.
 *
 * @param seriesModel  - The series to read
 * @param axes         - The chart's orientation and axis names
 * @param grid         - The category names of both axes
 * @param polyline     - Its stroked line, when it drew one
 * @param eachMark     - One selector per mark, when they were found
 * @param wholeSeries  - One selector naming the whole series
 * @returns The layer, or `undefined` when the series has no reading
 */
function otherLayer(
  seriesModel: EChartsSeriesModel,
  axes: Axes,
  grid: AxisCategories,
  polyline: string | undefined,
  eachMark: string[] | undefined,
  wholeSeries: string | undefined,
): MaidrLayer | undefined {
  switch (seriesModel.subType) {
    case 'line':
      return lineLayer(seriesModel, axes, polyline);
    case 'heatmap':
      return heatmapLayer(seriesModel, grid, axes, eachMark);
    case 'candlestick':
      return candlestickLayer(seriesModel, axes, eachMark);
    case 'boxplot':
      // Read without an outline; `grid.ts` records what was measured. A
      // category **y** axis is the whole of what says a chart is drawn
      // sideways in ECharts -- the same question `axisNames` already asks for
      // the bar family, and a distribution turned that way is read the same
      // way round a bar is.
      return boxplotLayer(seriesModel, axes, axes.horizontal);
    default:
      return scatterLayer(seriesModel, axes, wholeSeries);
  }
}

/**
 * The category names both axes were drawn with.
 *
 * @param model - The chart's model
 * @returns The labels of each axis, empty where the axis carries numbers
 */
function categories(model: EChartsModel): AxisCategories {
  return {
    x: categoriesOf(firstComponent(model, 'xAxis')),
    y: categoriesOf(firstComponent(model, 'yAxis')),
  };
}

/**
 * How many marks a series drew, asked the way its own layer asks it.
 *
 * @param seriesModel - The series to read
 * @param axes        - The chart's orientation
 * @param grid        - The category names of both axes
 * @returns The number of marks the drawing should hold for this series
 */
function drawnMarks(
  seriesModel: EChartsSeriesModel,
  axes: Axes,
  grid: AxisCategories,
): number {
  switch (seriesModel.subType) {
    case 'heatmap':
      return drawnGridCount(seriesModel, grid);
    case 'candlestick':
      return drawnCandleCount(seriesModel);
    case 'line':
      // One band for the whole series rather than one mark per sample, and
      // only when the series fills one -- the same count `markPerSeries`
      // asks of the stroked curve above it.
      return fillsBand(seriesModel) ? 1 : 0;
    default:
      return drawnCount(seriesModel, axes.horizontal);
  }
}

/**
 * Whether a line series fills the band under its curve.
 *
 * `areaStyle` is what fills it, so it is what makes the chart an area chart
 * rather than a line one -- read off the resolved option so an author cannot
 * mislabel one as the other. The band is also a filled mark, which is why
 * the count asks the same question the reading does.
 *
 * @param seriesModel - The series to read
 * @returns True when the series paints a band
 */
function fillsBand(seriesModel: EChartsSeriesModel): boolean {
  return Boolean(seriesModel.get('areaStyle'));
}

/**
 * How many marks a series actually drew.
 *
 * A datum with no value draws nothing -- measured, a three-category bar with
 * one `null` puts **two** rects on the page -- so counting the data list
 * would make every count check fail on a chart with a gap, and drop the
 * highlighting with it (#1002).
 *
 * Asked through {@link drewMark} rather than inline, so that the count and
 * the layer that reads the same series agree on which data drew. They did
 * not: this counted a scatter datum whose magnitude was a number, while
 * `scatterLayer` emits a point only when **both** coordinates are, so a
 * series with one such datum would stamp a mark no point stood for.
 */
function drawnCount(seriesModel: EChartsSeriesModel, horizontal: boolean): number {
  const data = seriesModel.getData();
  let drawn = 0;
  for (let index = 0; index < data.count(); index++) {
    if (drewMark(seriesModel.subType, data, index, horizontal)) {
      drawn += 1;
    }
  }
  return drawn;
}

/**
 * Whether one datum put a mark on the page, asked the way its layer asks it.
 *
 * @param subType    - The series type, which decides the question
 * @param data       - The series' data list
 * @param index      - Which datum to ask about
 * @param horizontal - Whether the chart's category axis is `y`
 * @returns True when the datum drew
 */
function drewMark(
  subType: string,
  data: EChartsList,
  index: number,
  horizontal: boolean,
): boolean {
  if (subType === 'scatter') {
    return placed(data, index) !== undefined;
  }
  return measured(magnitudeOf(data, index, horizontal));
}

/**
 * A scatter point's coordinates, when it has both.
 *
 * @param data  - The series' data list
 * @param index - Which datum to read
 * @returns The pair, or `undefined` when either coordinate is not a number
 */
function placed(
  data: EChartsList,
  index: number,
): { x: number; y: number } | undefined {
  const x = data.get(dimensionOf(data, 'x', 0), index);
  const y = data.get(dimensionOf(data, 'y', 1), index);
  if (typeof x !== 'number' || typeof y !== 'number') {
    return undefined;
  }
  return { x, y };
}

function measured(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** The dimension a cartesian series' reading lives on. */
function magnitudeOf(
  data: EChartsList,
  index: number,
  horizontal: boolean,
): number | null {
  const dimension = horizontal
    ? dimensionOf(data, 'x', 0)
    : dimensionOf(data, 'y', 1);
  const value = data.get(dimension, index);

  return typeof value === 'number' ? value : null;
}

/**
 * What a point sits at.
 *
 * `getName` answers on a category axis and returns the empty string on a
 * value axis, so an empty name is "this axis carries numbers" rather than
 * "this point is unnamed" -- and the position is then the coordinate itself.
 *
 * @param data  - The series' data list
 * @param index - Which datum
 * @param axes  - The chart's axes, for which coordinate is the position and
 *                whether it is a time
 * @returns The category, the date, or the coordinate
 */
function positionOf(
  data: EChartsList,
  index: number,
  axes: Axes,
): string | number {
  const name = data.getName(index);
  if (name) {
    return name;
  }

  // No category name, so the position is a coordinate: x on an upright
  // chart, and y on one turned sideways, which without a category axis only
  // a time axis on y does -- see `axisNames`.
  const value = axes.horizontal
    ? data.get(dimensionOf(data, 'y', 1), index)
    : data.get(dimensionOf(data, 'x', 0), index);
  if (typeof value !== 'number') {
    return index;
  }

  // A time axis positions a point at epoch milliseconds, which announced raw
  // is "1577836800000". Superset draws every time series on one, and so does
  // Metabase for a date column (#1304) -- the reading a theme river's time
  // axis already gets.
  return axes.dated ? instant(value, true, axes.utc) : value;
}

/**
 * The series' name, when the author wrote one.
 *
 * `seriesModel.name` is always resolved -- ECharts invents one for a series
 * declared without a name -- so emitting it would name a layer after an
 * internal counter. The **option** is the thing that says whether an author
 * wrote anything: measured, `get('name')` is `undefined` on the same series
 * whose `.name` had already become an invented string.
 *
 * A series with no name but an `id` the author gave it is named by that.
 * Metabase names none of its series -- its legend is its own HTML -- and
 * identifies each by an id that carries what the legend says, such as
 * `43:CNT:Widget` for the Widget segment of a stacked bar; without it every
 * segment was announced as "Series 1", "Series 2", … and a reader could not
 * tell which was which (#1304). The id ECharts invents for a series given
 * none begins with a NUL character (`'\0series\0…'`), so it is never taken
 * for the author's.
 */
function authoredName(seriesModel: EChartsSeriesModel): string {
  const name = text(seriesModel.get('name'));
  if (name) {
    return name;
  }
  const id = text(seriesModel.get('id'));
  return id.includes('\0') ? '' : id;
}

function axisConfig(axes: Axes): MaidrLayer['axes'] {
  return {
    x: { label: axes.x || undefined },
    y: { label: axes.y || undefined },
  };
}

function barLayer(
  bars: EChartsSeriesModel[],
  axes: Axes,
  selectorFor: (seriesModel: EChartsSeriesModel) => string[] | undefined,
): MaidrLayer {
  const orientation = axes.horizontal ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  const selectors = bars.map(selectorFor);
  const named = selectors.every((list): list is string[] => list !== undefined)
    ? selectors
    : undefined;

  // One bar series is a plain bar chart; several are segmented, and `stack`
  // is the one thing that says which kind.
  if (bars.length === 1) {
    const data = bars[0].getData();
    const points: BarPoint[] = [];
    for (let index = 0; index < data.count(); index++) {
      const value = magnitudeOf(data, index, axes.horizontal);
      if (!measured(value)) {
        continue;
      }
      const position = positionOf(data, index, axes);
      points.push(
        axes.horizontal ? { x: value, y: position } : { x: position, y: value },
      );
    }

    const name = authoredName(bars[0]);

    return {
      id: nextId('layer'),
      type: TraceType.BAR,
      orientation,
      ...(name ? { name } : {}),
      // One row, flattened: `AbstractBarPlot`'s array branch takes a list of
      // marks and declines a nested one outright.
      ...(named ? { selectors: named[0] } : {}),
      axes: axisConfig(axes),
      data: points,
    };
  }

  const stacked = oneStack(bars);
  // A gap keeps its column rather than being dropped from the row.
  // `SegmentedTrace` pairs the series by column index -- its summary row reads
  // `barValues.map(row => row[i])` and takes the category off `points[0][i]`
  // -- so a row one short puts every later category against another series'
  // value, announces a total no bar on the page adds up to, and drops the last
  // category from the summary altogether.
  //
  // The magnitude is `NaN` and never `0`: a zero sounds like a real low
  // reading, can be reached as the row's minimum and pulls the range every
  // other bar's pitch is scaled against, which is what `isMeasured` keeps a
  // gap out of (#1002).
  const rows = bars.map((seriesModel, order) => {
    const list = seriesModel.getData();
    const fill = authoredName(seriesModel) || `Series ${order + 1}`;
    const points: SegmentedPoint[] = [];
    const drew: boolean[] = [];
    for (let index = 0; index < list.count(); index++) {
      const value = magnitudeOf(list, index, axes.horizontal);
      const magnitude = measured(value) ? value : Number.NaN;
      const position = positionOf(list, index, axes);
      points.push(
        axes.horizontal
          ? { x: magnitude, y: position, z: fill }
          : { x: position, y: magnitude, z: fill },
      );
      drew.push(measured(value));
    }
    return { points, drew };
  });

  return {
    id: nextId('layer'),
    type: stacked ? TraceType.STACKED : TraceType.DODGED,
    orientation,
    // A row per series, not one flat list. `SegmentedTrace` routes an array
    // to `mapGridToSvgElements`, which wants a row per series and declines a
    // flat one -- for the reason it gives itself, that a flat list says which
    // bars there are but not which cell each one is in. A cell the chart drew
    // nothing at names no element, which the grid says with a `null` and the
    // trace stands in for -- and which is why the row has to be as long as the
    // series rather than as long as the marks.
    ...(named
      ? { selectors: named.map((marks, order) => paired(marks, rows[order].drew)) }
      : {}),
    axes: axisConfig(axes),
    data: rows.map(row => row.points),
  };
}

/**
 * Whether every bar series is stacked, and stacked on the same pile.
 *
 * ECharts stacks the series that share a `stack` name and draws the rest
 * beside them, so a chart is only a stacked bar chart when they all name the
 * same one. Two names is grouped stacks -- `'a', 'a', 'b', 'b'` is two stacks
 * side by side, which ECharts draws routinely -- and a stacked series next to
 * a plain one is a mixed chart. Calling either a stack tells the reader the
 * bars sit on top of one another when they do not.
 *
 * @param bars - The chart's bar series
 * @returns True when they are all in one stack
 */
function oneStack(bars: EChartsSeriesModel[]): boolean {
  const first = text(bars[0]?.get('stack'));
  if (!first) {
    return false;
  }
  return bars.every(seriesModel => text(seriesModel.get('stack')) === first);
}

/**
 * One selector per cell of a series, `null` where it drew no mark.
 *
 * @param marks - The selectors of the marks the series drew, in order
 * @param drew  - Whether each cell of the series drew one
 * @returns One entry per cell
 */
function paired(marks: string[], drew: boolean[]): (string | null)[] {
  let mark = 0;
  return drew.map(drawn => (drawn ? marks[mark++] ?? null : null));
}

function lineLayer(
  seriesModel: EChartsSeriesModel,
  axes: Axes,
  selector: string | undefined,
): MaidrLayer {
  const data = seriesModel.getData();
  const points: LinePoint[] = [];
  for (let index = 0; index < data.count(); index++) {
    const value = magnitudeOf(data, index, axes.horizontal);
    points.push({
      x: positionOf(data, index, axes),
      // Positioned but not measured, which `LinePoint` can say and
      // `BarPoint` cannot: the gap keeps the samples either side of it in
      // their places instead of closing over it, and it is not a zero (#925).
      y: measured(value) ? value : null,
    });
  }

  const area = fillsBand(seriesModel);
  const step = seriesModel.get('step');
  const name = authoredName(seriesModel);

  return {
    id: nextId('layer'),
    type: area ? TraceType.AREA : TraceType.LINE,
    ...(name ? { name } : {}),
    ...(selector ? { selectors: selector } : {}),
    // A staircase holds its value across the interval and then jumps, which
    // the trace reads from `stepDirection` -- ECharts spells the same choices
    // `'start'`, `'middle'` and `'end'`.
    ...(typeof step === 'string' ? { stepDirection: stepDirectionOf(step) } : {}),
    axes: axisConfig(axes),
    data: [points],
  };
}

/**
 * What a scatter point's x is called, when the axis says more than a number.
 *
 * `ScatterPoint.x` stays numeric, because the trace does arithmetic on it,
 * and a category axis hands over the category's **index** while a time axis
 * hands over epoch milliseconds. Neither is what a reader should hear --
 * Superset's time-series scatter was announced as "X is 1704067200000"
 * (#1304) -- so the name or the date is carried as the label beside it.
 *
 * @param data  - The series' data list
 * @param index - Which datum
 * @param axes  - The chart's axes
 * @returns The category or the date, or `undefined` on a value axis
 */
function xLabelOf(data: EChartsList, index: number, axes: Axes): string | undefined {
  // Sideways, the category or the time is on y, and a name is y's.
  if (axes.horizontal) {
    return undefined;
  }
  // Only a category axis's name: on a value axis `getName` is the point's
  // own name (`{ name: 'Japan', value: [1, 2] }`), which is not what its x
  // is called, and an x label there would take the x value out of the reading.
  if (axes.categoricalX) {
    return data.getName(index) || undefined;
  }
  if (!axes.dated) {
    return undefined;
  }
  const at = instant(data.get(dimensionOf(data, 'x', 0), index), true, axes.utc);
  return typeof at === 'string' ? at : undefined;
}

/**
 * ECharts' step spelling, in the grammar's own terms.
 *
 * `'start'` jumps at the sample and holds to the next, which is a vertical
 * riser then a horizontal hold; `'end'` holds first and jumps at the next
 * sample. `'middle'` splits the difference and has no spelling of its own
 * here -- it is read as the hold-then-jump it more nearly is.
 */
function stepDirectionOf(step: string): 'vh' | 'hv' {
  return step === 'start' ? 'vh' : 'hv';
}

function scatterLayer(
  seriesModel: EChartsSeriesModel,
  axes: Axes,
  selectors: string | undefined,
): MaidrLayer {
  const data = seriesModel.getData();
  // A `symbolSize` reading a third column shows up as an extra dimension,
  // measured -- `['x', 'y', 'value']`. That is the point's magnitude, which
  // `ScatterPoint.z` carries and `zIntensityFor()` makes audible (#826).
  // Only when it is the **one** column the coordinates leave over: a series
  // fed from a dataset carries every column of it (see `dimension.ts`), and
  // with two left over there is nothing to say which one sized the symbols.
  const x = dimensionOf(data, 'x', 0);
  const y = dimensionOf(data, 'y', 1);
  const spare = data.dimensions.filter(dimension => dimension !== x && dimension !== y);
  const sized = spare.length === 1 ? spare[0] : undefined;

  const points: ScatterPoint[] = [];
  for (let index = 0; index < data.count(); index++) {
    const at = placed(data, index);
    if (!at) {
      continue;
    }
    const size = sized === undefined ? undefined : data.get(sized, index);
    const label = xLabelOf(data, index, axes);
    points.push({
      ...at,
      ...(typeof size === 'number' && Number.isFinite(size) ? { z: size } : {}),
      ...(label ? { xLabel: label } : {}),
    });
  }

  const name = authoredName(seriesModel);

  return {
    id: nextId('layer'),
    type: TraceType.SCATTER,
    ...(name ? { name } : {}),
    ...(selectors ? { selectors } : {}),
    axes: axisConfig(axes),
    data: points,
  };
}
