import type {
  BarPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type { AxisCategories } from './grid';
import type {
  EChartsComponentModel,
  EChartsInstance,
  EChartsList,
  EChartsModel,
  EChartsSeriesModel,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';
import {
  candlestickLayer,
  categoriesOf,
  drawnCandleCount,
  drawnGridCount,
  GRID_VALUE,
  heatmapLayer,
} from './grid';
import {
  drawnNodeCount,
  HIERARCHY,
  hierarchyLayer,
  OUTLINED_HIERARCHY,
} from './hierarchy';
import { NETWORK, networkLayer } from './network';
import { markPerDatum, markPerSeries } from './selectors';
import { SINGLE_VALUE, singleValueLayers } from './single';

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
 * ECharts draws seventeen series types. Every one outside this set --
 * `boxplot`, `radar`, `parallel`, `themeRiver`, `pictorialBar` -- is left
 * unread **by name** rather than mapped onto whichever trace is closest.
 * Each wants its own measured layout before it claims to be readable.
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
]);

/**
 * The series types that take over the whole chart rather than sit on a grid.
 *
 * A pie, a funnel and a gauge carry one magnitude per named thing; a
 * treemap, sunburst or tree carries a hierarchy; a sankey or graph carries
 * a graph. What they share is that the chart is theirs alone.
 */
const OWNS_CHART: ReadonlySet<string> = new Set([
  ...SINGLE_VALUE,
  ...HIERARCHY,
  ...NETWORK,
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

  const owning = readable.filter(seriesModel => OWNS_CHART.has(seriesModel.subType));
  const layers = owning.length > 0
    // A pie, a funnel, a gauge, a hierarchy and a graph each own the whole
    // chart -- none of them sits on a grid -- so a figure holding one holds
    // nothing else this adapter would stamp, and the two stamping passes
    // never meet. A chart that declares both families anyway is read as the
    // owning half and says so, rather than dropping the other in silence.
    ? readOwning(owning, readable, container)
    : buildLayers(readable, axisNames(model), categories(model), container);
  const title = options.title ?? componentText(model, 'title', 'text');
  const subplot: MaidrSubplot = { layers };

  return {
    id: options.id ?? container.id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
}

/**
 * The layers of a chart whose series own it outright.
 *
 * @param owning    - The series that own the chart
 * @param readable  - Every series the adapter reads, including those
 * @param container - The element the chart was rendered into
 * @returns One or more layers per series
 */
function readOwning(
  owning: EChartsSeriesModel[],
  readable: EChartsSeriesModel[],
  container: HTMLElement,
): MaidrLayer[] {
  if (owning.length !== readable.length) {
    const dropped = readable
      .filter(seriesModel => !OWNS_CHART.has(seriesModel.subType))
      .map(seriesModel => seriesModel.subType)
      .join(', ');
    console.warn(
      `[MAIDR] ECharts chart mixes whole-chart and cartesian series. `
      + `Reading the whole-chart ones; ignoring: ${dropped}.`,
    );
  }

  return owning.flatMap((seriesModel) => {
    if (SINGLE_VALUE.has(seriesModel.subType)) {
      return singleValueLayers(seriesModel, container);
    }
    if (NETWORK.has(seriesModel.subType)) {
      const layer = networkLayer(seriesModel);
      return layer ? [layer] : [];
    }
    const layer = hierarchyLayer(seriesModel, hierarchyMarks(seriesModel, container));
    return layer ? [layer] : [];
  });
}

/**
 * One selector per node of a hierarchy, when its marks can be paired.
 *
 * Only a sunburst's can -- see `hierarchy.ts` -- so the others are not even
 * counted, which keeps a treemap's leaf-only painting from being mistaken
 * for a count that merely came out wrong.
 *
 * @param seriesModel - The series to read
 * @param container   - The element the chart was rendered into
 * @returns One selector per node in walk order, or `undefined`
 */
function hierarchyMarks(
  seriesModel: EChartsSeriesModel,
  container: HTMLElement,
): string[] | undefined {
  if (!OUTLINED_HIERARCHY.has(seriesModel.subType)) {
    return undefined;
  }
  return markPerDatum(container, [drawnNodeCount(seriesModel)])?.points[0];
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
}

function axisNames(model: EChartsModel): Axes {
  const x = firstComponent(model, 'xAxis');
  const y = firstComponent(model, 'yAxis');

  return {
    x: text(x?.get('name')),
    y: text(y?.get('name')),
    horizontal: text(y?.get('type')) === 'category',
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
  const marked = series.filter(seriesModel => seriesModel.subType !== 'line');
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
    default:
      return drawnCount(seriesModel, axes.horizontal);
  }
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
  const x = data.get(data.dimensions[0], index);
  const y = data.get(data.dimensions[1], index);
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
  const dimension = data.dimensions[horizontal ? 0 : 1];
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
 * Which coordinate needs no deciding; see the comment at the fallback.
 */
function positionOf(data: EChartsList, index: number): string | number {
  const name = data.getName(index);
  if (name) {
    return name;
  }

  // Always x. Reaching here means the point carries no category name, which
  // means neither axis is categorical -- and a chart is only "horizontal"
  // because its **y** axis is the categorical one. So the two cannot both be
  // true, and asking which axis to read would be a branch nothing can take.
  const value = data.get(data.dimensions[0], index);

  return typeof value === 'number' ? value : index;
}

/**
 * The series' name, when the author wrote one.
 *
 * `seriesModel.name` is always resolved -- ECharts invents one for a series
 * declared without a name -- so emitting it would name a layer after an
 * internal counter. The **option** is the thing that says whether an author
 * wrote anything: measured, `get('name')` is `undefined` on the same series
 * whose `.name` had already become an invented string.
 */
function authoredName(seriesModel: EChartsSeriesModel): string {
  return text(seriesModel.get('name'));
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
      const position = positionOf(data, index);
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

  const stacked = bars.some(seriesModel => Boolean(seriesModel.get('stack')));
  const data: SegmentedPoint[][] = bars.map((seriesModel, order) => {
    const list = seriesModel.getData();
    const fill = authoredName(seriesModel) || `Series ${order + 1}`;
    const points: SegmentedPoint[] = [];
    for (let index = 0; index < list.count(); index++) {
      const value = magnitudeOf(list, index, axes.horizontal);
      if (!measured(value)) {
        continue;
      }
      const position = positionOf(list, index);
      points.push(
        axes.horizontal
          ? { x: value, y: position, z: fill }
          : { x: position, y: value, z: fill },
      );
    }
    return points;
  });

  return {
    id: nextId('layer'),
    type: stacked ? TraceType.STACKED : TraceType.DODGED,
    orientation,
    // A row per series, not one flat list. `SegmentedTrace` routes an array
    // to `mapGridToSvgElements`, which wants a row per series and declines a
    // flat one -- for the reason it gives itself, that a flat list says which
    // bars there are but not which cell each one is in.
    ...(named ? { selectors: named } : {}),
    axes: axisConfig(axes),
    data,
  };
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
      x: positionOf(data, index),
      // Positioned but not measured, which `LinePoint` can say and
      // `BarPoint` cannot: the gap keeps the samples either side of it in
      // their places instead of closing over it, and it is not a zero (#925).
      y: measured(value) ? value : null,
    });
  }

  // `areaStyle` is what fills the band under the curve, so it is what makes
  // the chart an area chart rather than a line one -- read off the resolved
  // option so an author cannot mislabel one as the other.
  const area = Boolean(seriesModel.get('areaStyle'));
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
  const sized = data.dimensions.length > 2 ? data.dimensions[2] : undefined;

  const points: ScatterPoint[] = [];
  for (let index = 0; index < data.count(); index++) {
    const at = placed(data, index);
    if (!at) {
      continue;
    }
    const size = sized === undefined ? undefined : data.get(sized, index);
    points.push({
      ...at,
      ...(typeof size === 'number' && Number.isFinite(size) ? { z: size } : {}),
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
