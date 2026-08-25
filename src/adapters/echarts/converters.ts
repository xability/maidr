import type {
  BarPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type {
  EChartsComponentModel,
  EChartsInstance,
  EChartsList,
  EChartsModel,
  EChartsSeriesModel,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
import { markPerDatum, markPerSeries } from './selectors';

/**
 * Options accepted by {@link createMaidrFromEChart}.
 */
export interface EChartsAdapterOptions {
  /** The figure's id. Defaults to the container's, then to a generated one. */
  id?: string;
  /** The figure's title. Defaults to the chart's own `title.text`. */
  title?: string;
}

let generated = 0;

function nextId(prefix: string): string {
  generated += 1;
  return `${prefix}-${generated}`;
}

/**
 * The series types this tier reads.
 *
 * ECharts draws seventeen. Every other one -- `pie`, `boxplot`,
 * `candlestick`, `heatmap`, `radar`, `funnel`, `gauge`, `treemap`,
 * `sunburst`, `sankey`, `graph`, `parallel`, `themeRiver`, `pictorialBar` --
 * is left unread by name rather than mapped onto whichever trace is closest.
 * Most of them have a trace waiting and are the later tiers of #1195; each
 * wants its own measured layout before it claims to be readable.
 */
const READ: ReadonlySet<string> = new Set(['bar', 'line', 'scatter']);

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

  const axes = axisNames(model);
  const layers = buildLayers(readable, axes, container);
  const title = options.title ?? componentText(model, 'title', 'text');
  const subplot: MaidrSubplot = { layers };

  return {
    id: options.id ?? container.id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
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
  container: HTMLElement,
): MaidrLayer[] {
  const bars = series.filter(seriesModel => seriesModel.subType === 'bar');
  const others = series.filter(seriesModel => seriesModel.subType !== 'bar');

  // Every per-datum mark of the chart is painted alike and only its position
  // tells it apart, so they are located once for all of them, in the order
  // the series were declared.
  const marked = series.filter(seriesModel => seriesModel.subType !== 'line');
  const perDatum = markPerDatum(
    container,
    marked.map(seriesModel => drawnCount(seriesModel.getData(), axes.horizontal)),
  );
  const selectorFor = (seriesModel: EChartsSeriesModel): string[] | undefined =>
    perDatum?.[marked.indexOf(seriesModel)];

  const layers: MaidrLayer[] = [];
  if (bars.length > 0) {
    layers.push(barLayer(bars, axes, selectorFor));
  }

  const lines = others.filter(seriesModel => seriesModel.subType === 'line');
  const polylines = markPerSeries(container, lines.length);
  for (const seriesModel of others) {
    layers.push(
      seriesModel.subType === 'line'
        ? lineLayer(seriesModel, axes, polylines?.[lines.indexOf(seriesModel)])
        : scatterLayer(seriesModel, axes, selectorFor(seriesModel)),
    );
  }

  return layers;
}

/**
 * How many marks a series actually drew.
 *
 * A datum with no value draws nothing -- measured, a three-category bar with
 * one `null` puts **two** rects on the page -- so counting the data list
 * would make every count check fail on a chart with a gap, and drop the
 * highlighting with it (#1002).
 */
function drawnCount(data: EChartsList, horizontal: boolean): number {
  let drawn = 0;
  for (let index = 0; index < data.count(); index++) {
    if (measured(magnitudeOf(data, index, horizontal))) {
      drawn += 1;
    }
  }
  return drawn;
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
  const highlight = selectors.every((list): list is string[] => list !== undefined)
    ? selectors.flat()
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
      ...(highlight ? { selectors: highlight } : {}),
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
    ...(highlight ? { selectors: highlight } : {}),
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
  selectors: string[] | undefined,
): MaidrLayer {
  const data = seriesModel.getData();
  // A `symbolSize` reading a third column shows up as an extra dimension,
  // measured -- `['x', 'y', 'value']`. That is the point's magnitude, which
  // `ScatterPoint.z` carries and `zIntensityFor()` makes audible (#826).
  const sized = data.dimensions.length > 2 ? data.dimensions[2] : undefined;

  const points: ScatterPoint[] = [];
  for (let index = 0; index < data.count(); index++) {
    const x = data.get(data.dimensions[0], index);
    const y = data.get(data.dimensions[1], index);
    if (typeof x !== 'number' || typeof y !== 'number') {
      continue;
    }
    const size = sized === undefined ? undefined : data.get(sized, index);
    points.push({
      x,
      y,
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
