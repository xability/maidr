/**
 * Core adapter that converts a rendered ApexCharts chart into MAIDR data.
 *
 * The returned {@link Maidr} object can be passed to the `<Maidr data={...}>`
 * React component or serialised into a `maidr-data` attribute; most pages
 * use {@link bindApexCharts}, which does the latter and keeps it current.
 *
 * @example
 * ```ts
 * import ApexCharts from 'apexcharts';
 * import { apexchartsToMaidr } from 'maidr/apexcharts';
 *
 * const chart = new ApexCharts(el, { chart: { type: 'bar' }, ... });
 * await chart.render();
 * const maidrData = apexchartsToMaidr(chart);
 * ```
 */

import type {
  AxisConfig,
  AxisFormat,
  BarPoint,
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  GanttData,
  GanttPoint,
  GaugePoint,
  HeatmapData,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  TreemapPoint,
} from '../../type/grammar';
import type { ApexChartsAdapterOptions, ApexChartsInstance } from './types';
import { Orientation, TraceType } from '../../type/grammar';
import { isAngle, pieGeometry } from '../shared/pieGeometry';
import {
  authoredX,
  chartType,
  dateFormat,
  dateOptions,
  firstYAxis,
  formatDate,
  isDatetime,
  isHorizontal,
  labelText,
  markerSize,
  seriesName,
  seriesType,
  seriesValues,
  strokeCurve,
  toNumber,
  visibleSeries,
  xAt,
  yAxisTitle,
} from './read';
import {
  areaPathSelector,
  barSelector,
  gaugeSelector,
  heatCellSelector,
  linePathSelector,
  markerAtSelector,
  markerSelector,
  partSelector,
  pieSelector,
  radarMarkerSelector,
  rangeBarSelector,
  rootSelector,
  seriesGroupSelector,
  treemapSelector,
} from './selectors';
import { splitBoxes, splitCandles } from './split';

/** Prefix of every console message the adapter writes. */
const LOG_PREFIX = '[maidr/apexcharts]';

/**
 * What every converter needs to know about the chart being read.
 */
interface Context {
  /** The chart. */
  chart: ApexChartsInstance;
  /** The wrapper element, when the chart has been drawn. */
  wrap: Element | null;
  /** The selector for the wrapper, which scopes every other selector. */
  root: string;
  /** The MAIDR figure id; layer ids are derived from it. */
  id: string;
  /** Axis labels, the caller's overrides applied. */
  labels: { x?: string; y?: string; z?: string };
  /** Whether the caller named the y axis, which then wins over every title. */
  yOverride: boolean;
  /** How many layers have been given an id. */
  layerCount: number;
}

/**
 * One box's outliers, taken from a scatter series drawn over a box plot.
 */
interface BoxOutliers {
  lower: { value: number; selector: string }[];
  upper: { value: number; selector: string }[];
}

/** Charts already warned about, per message, so a rebind stays quiet. */
const warned = new WeakMap<object, Set<string>>();

/**
 * Writes a warning once per chart.
 *
 * @param chart   - The chart the warning is about
 * @param key     - What makes two warnings the same one
 * @param message - The warning
 */
function warnOnce(chart: ApexChartsInstance, key: string, message: string): void {
  const seen = warned.get(chart) ?? new Set<string>();
  warned.set(chart, seen);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  console.warn(`${LOG_PREFIX} ${message}`);
}

/**
 * Converts a rendered ApexCharts chart into a MAIDR data structure.
 *
 * Call it once the chart has finished drawing — after `render()` resolves
 * and its entry animation has ended, or with animations disabled — because
 * the selectors are generated against the drawn SVG and the box plot and
 * candlestick parts are cut from it. {@link bindApexCharts} does that
 * waiting for you.
 *
 * Supported ApexCharts types:
 * - `line` → {@link TraceType.LINE}, or {@link TraceType.STEP} for the
 *   `stepline` (`hv`) and `linestep` (`vh`) curves
 * - `area` → {@link TraceType.AREA}; stacked → {@link TraceType.STACKED_AREA};
 *   `stackType: '100%'` → {@link TraceType.NORMALIZED_AREA}, with a console
 *   warning, since ApexCharts 7.6.0 draws that chart outside its plot area
 * - `bar` / `column` → {@link TraceType.BAR}; several series →
 *   {@link TraceType.DODGED}, stacked → {@link TraceType.STACKED},
 *   `stackType: '100%'` → {@link TraceType.NORMALIZED}, one stacked layer per
 *   `series[i].group` when there are several; horizontal bars are
 *   {@link Orientation.HORIZONTAL}
 * - `bar` with `plotOptions.bar.isFunnel` → {@link TraceType.FUNNEL}
 * - `scatter` and `bubble` → {@link TraceType.SCATTER}, one layer per series
 * - `pie` / `donut` → {@link TraceType.PIE}
 * - `polarArea` → {@link TraceType.POLAR_AREA}
 * - `heatmap` → {@link TraceType.HEATMAP}
 * - `candlestick` → {@link TraceType.CANDLESTICK}, one layer per series
 * - `boxPlot` → {@link TraceType.BOX}, one layer per series; a `scatter`
 *   series drawn over it becomes the boxes' outliers
 * - `radar` → {@link TraceType.RADAR}
 * - `rangeBar` → {@link TraceType.GANTT}
 * - `treemap` → {@link TraceType.TREEMAP}
 * - `radialBar` → {@link TraceType.GAUGE}, one layer per ring
 *
 * A combo chart (`series[i].type` differing) becomes one subplot holding a
 * layer per group of series. Series of any other type (`rangeArea`, for one)
 * are skipped with a console warning, as are series hidden through the
 * legend.
 *
 * @param chart   - A rendered ApexCharts instance
 * @param options - Overrides for the id, titles and axis labels
 * @returns The MAIDR data for the chart
 */
export function apexchartsToMaidr(
  chart: ApexChartsInstance,
  options: ApexChartsAdapterOptions = {},
): Maidr {
  const { config, globals } = chart.w;
  const wrap = wrapperOf(chart);
  const wrapperId = wrap?.id || `apexcharts${globals.chartID}`;
  if (!wrap) {
    warnOnce(
      chart,
      'not-drawn',
      'The chart has not been drawn yet, so no element can be highlighted. '
      + 'Call apexchartsToMaidr() after chart.render() has resolved, or use bindApexCharts().',
    );
  }
  warnKeyboardNavigation(chart);

  const ctx: Context = {
    chart,
    wrap,
    root: rootSelector(wrapperId),
    id: options.id ?? `maidr-apexcharts-${globals.chartID}`,
    labels: {
      x: options.axes?.x ?? textOf(config.xaxis?.title?.text),
      y: options.axes?.y ?? textOf(firstYAxis(chart)?.title?.text),
      z: options.axes?.z,
    },
    yOverride: options.axes?.y !== undefined,
    layerCount: 0,
  };

  const subplot: MaidrSubplot = { layers: buildLayers(ctx) };
  if (subplot.layers.length === 0) {
    // MAIDR takes a figure with no layer without complaint and then answers
    // no key at all, not even at a boundary, so the page's author has to
    // hear it from here.
    warnOnce(
      chart,
      'no-layers',
      'The chart has nothing MAIDR can read: every series is empty, hidden through the legend '
      + 'or of a type the adapter does not support, so MAIDR stays silent on it until one is shown.',
    );
  }
  const names = legendOf(chart);
  if (names.length > 1) {
    subplot.legend = names;
  }

  const title = options.title ?? textOf(config.title?.text);
  const subtitle = options.subtitle ?? textOf(config.subtitle?.text);
  return {
    id: ctx.id,
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(options.caption ? { caption: options.caption } : {}),
    subplots: [[subplot]],
  };
}

/**
 * The chart's `div.apexcharts-canvas` wrapper.
 *
 * @param chart - The chart
 * @returns The wrapper, or null when the chart has not been drawn
 */
function wrapperOf(chart: ApexChartsInstance): Element | null {
  const fromState = chart.w.dom?.elWrap ?? chart.w.globals.dom?.elWrap ?? null;
  if (fromState && chart.el.contains(fromState)) {
    return fromState;
  }
  return chart.el.querySelector('.apexcharts-canvas');
}

/**
 * A title-like option as text.
 *
 * @param value - The option's value
 * @returns The text, or undefined when it is empty
 */
function textOf(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return textOf(value.join(' '));
  }
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * Warns, once per chart, when ApexCharts' own keyboard navigation is on.
 *
 * ApexCharts 7 makes its svg a `role="application"` tab stop that moves its
 * own tooltip with the arrow keys and announces points through its own live
 * region. Inside MAIDR that is a second, competing keyboard model and a
 * second voice, so the page should turn it off with
 * `chart: { accessibility: { enabled: false } }`. MAIDR needs nothing that
 * setting removes.
 *
 * @param chart - The chart
 */
function warnKeyboardNavigation(chart: ApexChartsInstance): void {
  const a11y = chart.w.config.chart.accessibility;
  const on = a11y !== undefined
    && a11y.enabled !== false
    && a11y.keyboard?.enabled !== false
    && a11y.keyboard?.navigation?.enabled !== false;
  if (on) {
    warnOnce(
      chart,
      'keyboard',
      'ApexCharts\' own keyboard navigation is enabled. It moves ApexCharts\' tooltip with the '
      + 'arrow keys and announces points through its own live region, which competes with '
      + 'MAIDR\'s keyboard controls and speech. Set chart.accessibility.enabled to false when '
      + 'the chart is read through MAIDR.',
    );
  }
}

/**
 * The names the chart's legend shows for the drawn series.
 *
 * @param chart - The chart
 * @returns One name per drawn series
 */
function legendOf(chart: ApexChartsInstance): string[] {
  const type = chartType(chart);
  if (['pie', 'donut', 'polarArea', 'radialBar', 'heatmap', 'treemap'].includes(type)) {
    return [];
  }
  return visibleSeries(chart).map(i => seriesName(chart, i));
}

/**
 * A fresh layer id, unique on the page when the figure id is.
 *
 * @param ctx - The conversion context
 * @returns The id
 */
function nextLayerId(ctx: Context): string {
  const id = `${ctx.id}-layer-${ctx.layerCount}`;
  ctx.layerCount += 1;
  return id;
}

/**
 * An axis config holding only the fields that have a value.
 *
 * @param label  - The axis label
 * @param format - The axis format
 * @returns The config
 */
function axis(label?: string, format?: AxisFormat): AxisConfig {
  return {
    ...(label !== undefined ? { label } : {}),
    ...(format ? { format } : {}),
  };
}

/**
 * The y label of a layer drawn from some series of a cartesian chart.
 *
 * A chart can give each series a y axis of its own. The layer is named after
 * the axis its series are drawn against; when they are drawn against axes
 * with different titles, no one title is true of them all, so none is given.
 *
 * @param ctx     - The conversion context
 * @param indices - The layer's series
 * @returns The label, or undefined
 */
function yLabelOf(ctx: Context, indices: number[]): string | undefined {
  if (ctx.yOverride) {
    return ctx.labels.y;
  }
  const titles = new Set(indices.map(i => yAxisTitle(ctx.chart, i)));
  return titles.size === 1 ? [...titles][0] : undefined;
}

/**
 * The data indices (`j`) of the elements a selector matches in the drawn
 * chart — which points ApexCharts drew a marker for.
 *
 * @param ctx      - The conversion context
 * @param selector - A selector matching elements that carry `j`
 * @returns The indices, or null when the chart has not been drawn
 */
function drawnIndices(ctx: Context, selector: string): Set<number> | null {
  if (!ctx.wrap) {
    return null;
  }
  const indices = new Set<number>();
  ctx.chart.el.querySelectorAll(selector).forEach((element) => {
    const j = toNumber(element.getAttribute('j'));
    if (j !== null) {
      indices.add(j);
    }
  });
  return indices;
}

/**
 * The series group of one series, in the drawn chart.
 *
 * @param ctx - The conversion context
 * @param i   - The series' index
 * @returns The group, or null
 */
function groupOf(ctx: Context, i: number): Element | null {
  return ctx.wrap ? ctx.chart.el.querySelector(seriesGroupSelector(ctx.root, i)) : null;
}

/**
 * The integers `0 … count - 1`.
 *
 * @param count - How many
 * @returns The range
 */
function range(count: number): number[] {
  return Array.from({ length: count }, (_, k) => k);
}

/**
 * A point's x, or its one-based position when it has no label: ApexCharts
 * still draws the points of a series longer than `xaxis.categories`, at
 * slots the categories do not name.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @param j     - The point's index
 * @returns The x
 */
function xOrSlot(chart: ApexChartsInstance, i: number, j: number): string | number {
  const x = xAt(chart, i, j);
  return x === '' ? String(j + 1) : x;
}

/**
 * The category labels of one series' points, datetimes formatted as dates.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @param count - How many points
 * @returns One label per point
 */
function categoriesOf(chart: ApexChartsInstance, i: number, count: number): (string | number)[] {
  const xs = range(count).map(j => xOrSlot(chart, i, j));
  if (!isDatetime(chart)) {
    return xs;
  }
  const options = dateOptions(chart, xs.filter((x): x is number => typeof x === 'number'));
  return xs.map(x => (typeof x === 'number' ? formatDate(x, options) : x));
}

/**
 * The x axis of a layer whose x values are positions, formatted as dates
 * on a datetime axis.
 *
 * @param ctx  - The conversion context
 * @param rows - The layer's points
 * @returns The x axis config
 */
function positionalXAxis(ctx: Context, rows: { x: number | string }[][]): AxisConfig {
  if (!isDatetime(ctx.chart)) {
    return axis(ctx.labels.x);
  }
  const stamps = rows.flat().map(p => p.x).filter((x): x is number => typeof x === 'number');
  return axis(ctx.labels.x, dateFormat(ctx.chart, stamps));
}

/**
 * Builds every layer of the chart.
 *
 * @param ctx - The conversion context
 * @returns The layers, in the order their first series appears
 */
function buildLayers(ctx: Context): MaidrLayer[] {
  const { chart } = ctx;
  switch (chartType(chart)) {
    case 'pie':
    case 'donut':
      return [pieLayer(ctx)];
    case 'polarArea':
      return [polarAreaLayer(ctx)];
    case 'radialBar':
      return gaugeLayers(ctx);
    case 'heatmap':
      return compact([heatmapLayer(ctx)]);
    case 'treemap':
      return compact([treemapLayer(ctx)]);
    case 'radar':
      return compact([radarLayer(ctx)]);
    default:
      return cartesianLayers(ctx);
  }
}

/**
 * Drops missing layers.
 *
 * @param layers - Layers, some possibly null
 * @returns The layers that exist
 */
function compact(layers: (MaidrLayer | null)[]): MaidrLayer[] {
  return layers.filter((layer): layer is MaidrLayer => layer !== null);
}

/**
 * The step direction a line or area series' curve draws, if it is a step.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @returns `hv` for `stepline`, `vh` for `linestep`, else undefined
 */
function stepOf(chart: ApexChartsInstance, i: number): StepDirection | undefined {
  const curve = strokeCurve(chart, i);
  if (curve === 'stepline') {
    return 'hv';
  }
  if (curve === 'linestep') {
    return 'vh';
  }
  return undefined;
}

/**
 * Builds the layers of a chart drawn on x and y axes, combo charts included.
 *
 * Bars share one layer, because stacking and dodging only exist between
 * them; so do areas, for the same reason, and lines drawn with the same kind
 * of curve. Everything else is a layer per series.
 *
 * @param ctx - The conversion context
 * @returns The layers, in the order their first series appears
 */
function cartesianLayers(ctx: Context): MaidrLayer[] {
  const { chart } = ctx;
  const buckets = new Map<string, Bucket>();
  const add = (key: string, kind: BucketKind, i: number, step?: StepDirection): void => {
    const bucket = buckets.get(key) ?? { kind, step, indices: [] };
    bucket.indices.push(i);
    buckets.set(key, bucket);
  };

  // Lines and areas drawn against y axes with different titles are layers of
  // their own, so each is announced with its own axis' title.
  const axisKey = (i: number): string => (ctx.yOverride ? '' : yAxisTitle(chart, i) ?? '');

  const visible = visibleSeries(chart);
  warnNormalizedLines(chart, visible);
  const boxes = visible.filter(i => seriesType(chart, i) === 'boxPlot');
  const outliers = boxes.length === 1 ? foldOutliers(ctx, boxes[0], visible) : null;

  for (const i of visible) {
    const type = seriesType(chart, i);
    switch (type) {
      case 'bar':
        if (chart.w.config.plotOptions?.bar?.isFunnel) {
          add(`funnel:${i}`, 'funnel', i);
        } else {
          add('bar', 'bar', i);
        }
        break;
      case 'line': {
        const step = stepOf(chart, i);
        add(`line:${step ?? ''}:${axisKey(i)}`, 'line', i, step);
        break;
      }
      case 'area':
        add(`area:${axisKey(i)}`, 'area', i);
        break;
      case 'scatter':
      case 'bubble':
        if (!outliers?.series.includes(i)) {
          add(`scatter:${i}`, 'scatter', i);
        }
        break;
      case 'candlestick':
        add(`candlestick:${i}`, 'candlestick', i);
        break;
      case 'boxPlot':
        add(`box:${i}`, 'box', i);
        break;
      case 'rangeBar':
        add('rangeBar', 'rangeBar', i);
        break;
      default:
        warnOnce(
          chart,
          `type:${type}`,
          `Series "${seriesName(chart, i)}" is drawn as "${type}", which MAIDR cannot read yet; it is skipped.`,
        );
    }
  }

  return [...buckets.values()].flatMap(bucket => bucketLayers(ctx, bucket, outliers?.byBox));
}

/**
 * Warns, once per chart, that ApexCharts 7.6.0 draws 100% stacked lines and
 * areas outside the plot.
 *
 * It computes their y positions hundreds of pixels above the chart, so the
 * bands are not drawn where the chart's axis says, and MAIDR's highlights,
 * which follow the drawn marks, land outside the chart too. The values MAIDR
 * reads are the right shares; only the picture is wrong.
 *
 * @param chart   - The chart
 * @param visible - The drawn series
 */
function warnNormalizedLines(chart: ApexChartsInstance, visible: number[]): void {
  const { stacked, stackType } = chart.w.config.chart;
  if (!stacked || stackType !== '100%') {
    return;
  }
  if (visible.some(i => ['area', 'line'].includes(seriesType(chart, i)))) {
    warnOnce(
      chart,
      'normalized-lines',
      'ApexCharts 7.6.0 draws area and line series with stackType \'100%\' outside the plot area, '
      + 'so the chart and MAIDR\'s highlights are off the canvas. MAIDR still reads each series\' '
      + 'share correctly. Draw the shares as a 100% stacked bar chart instead.',
    );
  }
}

/**
 * The kinds of series group a cartesian chart is split into.
 */
type BucketKind = 'bar' | 'funnel' | 'line' | 'area' | 'scatter' | 'candlestick' | 'box' | 'rangeBar';

/**
 * A group of series that become one layer (or, for bars, one family).
 */
interface Bucket {
  kind: BucketKind;
  /** The step direction shared by a group of step lines. */
  step?: StepDirection;
  indices: number[];
}

/**
 * Builds the layers of one group of series.
 *
 * @param ctx      - The conversion context
 * @param bucket   - The group
 * @param outliers - Box outliers found in a scatter series
 * @returns The group's layers
 */
function bucketLayers(ctx: Context, bucket: Bucket, outliers?: Map<number, BoxOutliers>): MaidrLayer[] {
  const [first] = bucket.indices;
  switch (bucket.kind) {
    case 'bar':
      return barLayers(ctx, bucket.indices);
    case 'funnel':
      return [singleBarLayer(ctx, first, TraceType.FUNNEL)];
    case 'line':
      return compact([lineLayer(ctx, bucket.indices, bucket.step)]);
    case 'area':
      return compact([areaLayer(ctx, bucket.indices)]);
    case 'scatter':
      return compact([scatterLayer(ctx, first)]);
    case 'candlestick':
      return compact([candlestickLayer(ctx, first)]);
    case 'box':
      return compact([boxLayer(ctx, first, outliers)]);
    case 'rangeBar':
      return compact([ganttLayer(ctx, bucket.indices)]);
  }
}

/**
 * The stack a bar series was put in with `series[i].group`, when the author
 * named one. ApexCharts files every other series under a default group of
 * its own, `apexcharts-axis-<n>`, which is not a stack the author drew.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @returns The group's name, or undefined
 */
function stackGroup(chart: ApexChartsInstance, i: number): string | undefined {
  const group = chart.w.config.series[i]?.group ?? chart.w.globals.initialSeries?.[i]?.group;
  return typeof group === 'string' && group !== '' && !group.startsWith('apexcharts-axis-') ? group : undefined;
}

/**
 * Builds the layer(s) for a chart's bar series.
 *
 * A stacked chart whose series name more than one `group` draws one stack
 * per group side by side, so each group becomes a stacked layer of its own,
 * named after the group: summing the groups into one stack would announce a
 * total no bar reaches.
 *
 * @param ctx     - The conversion context
 * @param indices - The bar series
 * @returns A bar layer for a single series; otherwise one dodged, stacked
 *   or 100% stacked layer, or one stacked layer per group
 */
function barLayers(ctx: Context, indices: number[]): MaidrLayer[] {
  if (indices.length === 1) {
    return [singleBarLayer(ctx, indices[0], TraceType.BAR)];
  }
  const { chart } = ctx;
  if (chart.w.config.chart.stacked) {
    const groups = new Map<string, number[]>();
    for (const i of indices) {
      const group = stackGroup(chart, i) ?? '';
      groups.set(group, [...(groups.get(group) ?? []), i]);
    }
    if (groups.size > 1) {
      return [...groups].map(([group, members]) => segmentedBarLayer(ctx, members, group || undefined));
    }
  }
  return [segmentedBarLayer(ctx, indices)];
}

/**
 * Builds a dodged, stacked or 100% stacked layer from several bar series.
 *
 * @param ctx     - The conversion context
 * @param indices - The bar series
 * @param name    - The layer's name: the stack's group, when there are several
 * @returns The layer
 */
function segmentedBarLayer(ctx: Context, indices: number[], name?: string): MaidrLayer {
  const { chart } = ctx;
  const horizontal = isHorizontal(chart);
  const stacked = Boolean(chart.w.config.chart.stacked);
  const normalized = stacked && chart.w.config.chart.stackType === '100%';
  const type = normalized ? TraceType.NORMALIZED : stacked ? TraceType.STACKED : TraceType.DODGED;

  const count = Math.max(...indices.map(i => seriesValues(chart, i).length));
  const categories = categoriesOf(chart, indices[0], count);
  const magnitudes = indices.map((i) => {
    const values = seriesValues(chart, i);
    return range(count).map(j => toNumber(values[j]) ?? Number.NaN);
  });
  const shown = normalized ? shares(magnitudes) : magnitudes;

  const data: SegmentedPoint[][] = indices.map((i, s) => {
    const series = seriesName(chart, i);
    return range(count).map((j) => {
      const magnitude = shown[s][j];
      return horizontal
        ? { x: magnitude, y: categories[j], z: series }
        : { x: categories[j], y: magnitude, z: series };
    });
  });

  // One selector per cell, `null` where ApexCharts drew no bar at all — a
  // series shorter than the others. A null or zero value still has a path.
  // One query per series rather than one per cell: this runs on every redraw.
  const selectors = indices.map((i) => {
    const drawn = drawnIndices(ctx, `${seriesGroupSelector(ctx.root, i)} path.apexcharts-bar-area[j]`);
    return range(count).map(j => (drawn === null || drawn.has(j) ? barSelector(ctx.root, i, j) : null));
  });

  return {
    id: nextLayerId(ctx),
    type,
    ...(name !== undefined ? { name } : {}),
    ...(horizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: { x: axis(ctx.labels.x), y: axis(horizontal ? ctx.labels.y : yLabelOf(ctx, indices)) },
    selectors,
    data,
  };
}

/**
 * Each value as a percentage of its category's total, a gap left a gap.
 *
 * @param values - Magnitudes as `[series][category]`, `NaN` for a gap
 * @returns The shares, each category summing to 100
 */
function shares(values: number[][]): number[][] {
  const count = values[0]?.length ?? 0;
  const totals = range(count).map(j =>
    values.reduce((sum, row) => sum + (Number.isNaN(row[j]) ? 0 : Math.abs(row[j])), 0));
  return values.map(row => row.map((value, j) =>
    Number.isNaN(value) || totals[j] === 0 ? value : (value / totals[j]) * 100));
}

/**
 * Builds a bar or funnel layer for one series.
 *
 * Each bar is named by its data index rather than matched by position, so a
 * null point — which ApexCharts still draws, at zero size — can be left out
 * of the data without shifting every bar after it.
 *
 * @param ctx  - The conversion context
 * @param i    - The series' index
 * @param type - {@link TraceType.BAR} or {@link TraceType.FUNNEL}
 * @returns The layer
 */
function singleBarLayer(ctx: Context, i: number, type: TraceType): MaidrLayer {
  const { chart } = ctx;
  const funnel = type === TraceType.FUNNEL;
  const horizontal = funnel || isHorizontal(chart);
  const values = seriesValues(chart, i);
  const categories = categoriesOf(chart, i, values.length);

  const data: BarPoint[] = [];
  const selectors: string[] = [];
  values.forEach((raw, j) => {
    const value = toNumber(raw);
    if (value === null) {
      return;
    }
    data.push(horizontal ? { x: value, y: categories[j] } : { x: categories[j], y: value });
    selectors.push(barSelector(ctx.root, i, j));
  });

  // A funnel names what its two axes are when the chart does not: the band
  // width is a count and the rows are stages.
  const x = funnel ? (ctx.labels.x ?? 'Count') : ctx.labels.x;
  const y = funnel ? (ctx.labels.y ?? 'Stage') : horizontal ? ctx.labels.y : yLabelOf(ctx, [i]);
  return {
    id: nextLayerId(ctx),
    type,
    name: seriesName(chart, i),
    ...(horizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: { x: axis(x), y: axis(y) },
    selectors,
    data,
  };
}

/**
 * Chooses how a line-family layer is highlighted, and shapes its data to
 * match.
 *
 * - When every series draws markers, each point is highlighted by its own
 *   marker. A null point has none, so nulls are dropped from the data.
 * - Otherwise each series is highlighted along its path, which has one
 *   vertex per point only when the series has no nulls: ApexCharts joins
 *   the pieces of a broken line into one path and drops an isolated point
 *   from it, which would silently shift every highlight after the gap.
 * - A layer with nulls and no markers is left without a highlight, and the
 *   console says how to get one.
 *
 * @param ctx      - The conversion context
 * @param indices  - The layer's series
 * @param rows     - The layer's points, one row per series, nulls included
 * @param pathOf   - The path selector for a series
 * @returns The points to emit and the selectors, if any
 */
function lineFamily(
  ctx: Context,
  indices: number[],
  rows: LinePoint[][],
  pathOf: (root: string, i: number) => string,
): { rows: LinePoint[][]; selectors?: string[] } {
  const { chart } = ctx;
  if (indices.every(i => markerSize(chart, i) > 0)) {
    const selectors = indices.map(i => markerSelector(ctx.root, i));
    return {
      rows: rows.map((row, r) => {
        const drawn = drawnIndices(ctx, selectors[r]);
        return row.filter((point, j) => point.y !== null && (drawn === null || drawn.has(j)));
      }),
      selectors,
    };
  }
  if (rows.every(row => row.every(point => point.y !== null))) {
    return { rows, selectors: indices.map(i => pathOf(ctx.root, i)) };
  }
  warnOnce(
    chart,
    'gaps',
    'A line or area series has missing values and no markers, so its points cannot be '
    + 'highlighted. Set markers.size above 0 to highlight them.',
  );
  return { rows };
}

/**
 * The points of line-like series, one row per series.
 *
 * @param chart   - The chart
 * @param indices - The series
 * @returns `LinePoint[][]`, nulls included
 */
function lineRows(chart: ApexChartsInstance, indices: number[]): LinePoint[][] {
  return indices.map((i) => {
    const name = seriesName(chart, i);
    return seriesValues(chart, i).map((raw, j) => ({ x: xOrSlot(chart, i, j), y: toNumber(raw), z: name }));
  });
}

/**
 * Builds a line or step layer.
 *
 * @param ctx     - The conversion context
 * @param indices - The series drawn with this kind of curve
 * @param step    - The step direction, for a stepped curve
 * @returns The layer, or null when no series has points
 */
function lineLayer(ctx: Context, indices: number[], step?: StepDirection): MaidrLayer | null {
  const { rows, selectors } = lineFamily(ctx, indices, lineRows(ctx.chart, indices), linePathSelector);
  if (rows.every(row => row.length === 0)) {
    return null;
  }
  return {
    id: nextLayerId(ctx),
    type: step ? TraceType.STEP : TraceType.LINE,
    ...(indices.length === 1 ? { name: seriesName(ctx.chart, indices[0]) } : {}),
    ...(step ? { stepDirection: step } : {}),
    axes: { x: positionalXAxis(ctx, rows), y: axis(yLabelOf(ctx, indices)) },
    ...(selectors ? { selectors } : {}),
    data: rows,
  };
}

/**
 * Builds an area, stacked area or 100% stacked area layer.
 *
 * Each point carries the band's own value, never the edge it is drawn at:
 * MAIDR stacks the bands itself. A 100% stacked chart carries each band's
 * share of its category, which is what the chart draws.
 *
 * @param ctx     - The conversion context
 * @param indices - The area series
 * @returns The layer, or null when no series has points
 */
function areaLayer(ctx: Context, indices: number[]): MaidrLayer | null {
  const { chart } = ctx;
  const stacked = Boolean(chart.w.config.chart.stacked) && indices.length > 1;
  const normalized = stacked && chart.w.config.chart.stackType === '100%';
  const type = normalized ? TraceType.NORMALIZED_AREA : stacked ? TraceType.STACKED_AREA : TraceType.AREA;

  let all = lineRows(chart, indices);
  if (normalized) {
    const scaled = shares(all.map(row => row.map(point => point.y ?? Number.NaN)));
    all = all.map((row, s) => row.map((point, j) => ({
      ...point,
      y: point.y === null ? null : scaled[s][j],
    })));
  }

  const pathOf = chart.w.config.stroke?.show === false
    ? (root: string, i: number): string => `${seriesGroupSelector(root, i)} path.apexcharts-area`
    : areaPathSelector;
  const { rows, selectors } = lineFamily(ctx, indices, all, pathOf);
  if (rows.every(row => row.length === 0)) {
    return null;
  }

  const steps = new Set(indices.map(i => stepOf(chart, i)));
  const step = steps.size === 1 ? [...steps][0] : undefined;
  return {
    id: nextLayerId(ctx),
    type,
    ...(indices.length === 1 ? { name: seriesName(chart, indices[0]) } : {}),
    ...(step ? { stepDirection: step } : {}),
    axes: { x: positionalXAxis(ctx, rows), y: axis(yLabelOf(ctx, indices)) },
    ...(selectors ? { selectors } : {}),
    data: rows,
  };
}

/**
 * Builds a scatter layer for one scatter or bubble series.
 *
 * @param ctx - The conversion context
 * @param i   - The series' index
 * @returns The layer, or null when the series has no points
 */
function scatterLayer(ctx: Context, i: number): MaidrLayer | null {
  const { chart } = ctx;
  const selector = markerSelector(ctx.root, i);
  const drawn = drawnIndices(ctx, selector);
  const data: ScatterPoint[] = [];
  seriesValues(chart, i).forEach((raw, j) => {
    const y = toNumber(raw);
    const x = xAt(chart, i, j);
    // A point ApexCharts drew no marker for is not in the chart: a null, or
    // one of more points than a category axis has slots for.
    if (y === null || x === '' || (drawn !== null && !drawn.has(j))) {
      return;
    }
    // A category axis gives a name; the point keeps its slot as the number
    // and the name alongside it.
    data.push(typeof x === 'number' ? { x, y } : { x: j, y, xLabel: x });
  });
  if (data.length === 0) {
    return null;
  }
  return {
    id: nextLayerId(ctx),
    type: TraceType.SCATTER,
    name: seriesName(chart, i),
    axes: { x: positionalXAxis(ctx, [data]), y: axis(yLabelOf(ctx, [i])) },
    selectors: selector,
    data,
  };
}

/**
 * Builds a candlestick layer for one series.
 *
 * Each candle is split into a body and two wicks first (see `split.ts`),
 * since ApexCharts draws all three as one outline.
 *
 * @param ctx - The conversion context
 * @param i   - The series' index
 * @returns The layer, or null when the series has no complete candle
 */
function candlestickLayer(ctx: Context, i: number): MaidrLayer | null {
  const { chart } = ctx;
  const g = chart.w.globals;
  const group = groupOf(ctx, i);
  // Horizontal candles are never split, so there are no parts to point at.
  const horizontal = isHorizontal(chart);
  if (group) {
    if (horizontal) {
      warnOnce(chart, 'candle-horizontal', 'Horizontal candlesticks cannot be highlighted.');
    } else if (splitCandles(group).length > 0) {
      warnOnce(chart, 'candle-split', 'Some candles could not be split into body and wicks; they are not highlighted.');
    }
  }

  const close = g.seriesCandleC?.[i] ?? [];
  const categories = categoriesOf(chart, i, close.length);
  const data: CandlestickPoint[] = [];
  const body: string[] = [];
  const wickHigh: string[] = [];
  const wickLow: string[] = [];
  close.forEach((rawClose, j) => {
    const open = toNumber(g.seriesCandleO?.[i]?.[j]);
    const high = toNumber(g.seriesCandleH?.[i]?.[j]);
    const low = toNumber(g.seriesCandleL?.[i]?.[j]);
    const closeValue = toNumber(rawClose);
    if (high === null || low === null || closeValue === null) {
      return;
    }
    data.push({
      value: String(categories[j]),
      ...(open !== null ? { open } : {}),
      high,
      low,
      close: closeValue,
      volatility: high - low,
    });
    body.push(partSelector(ctx.root, i, j, 'body'));
    wickHigh.push(partSelector(ctx.root, i, j, 'wick-high'));
    wickLow.push(partSelector(ctx.root, i, j, 'wick-low'));
  });
  if (data.length === 0) {
    return null;
  }
  return {
    id: nextLayerId(ctx),
    type: TraceType.CANDLESTICK,
    name: seriesName(chart, i),
    axes: { x: axis(ctx.labels.x), y: axis(yLabelOf(ctx, [i])) },
    ...(horizontal ? {} : { selectors: { body, wickHigh, wickLow } }),
    data,
  };
}

/**
 * Finds the scatter series drawn over a box plot as its outliers.
 *
 * ApexCharts has no outlier field: its box plot examples draw them as a
 * `scatter` series on the same categories. A scatter series is read that way
 * only when every one of its points falls on a box and outside that box's
 * whiskers; otherwise it stays a scatter layer of its own.
 *
 * @param ctx     - The conversion context
 * @param box     - The box plot series
 * @param visible - Every drawn series
 * @returns The outlier series and each box's outliers, or null
 */
function foldOutliers(
  ctx: Context,
  box: number,
  visible: number[],
): { series: number[]; byBox: Map<number, BoxOutliers> } | null {
  const { chart } = ctx;
  const g = chart.w.globals;
  const boxCount = g.seriesCandleC?.[box]?.length ?? 0;
  const labels = categoriesOf(chart, box, boxCount).map(String);
  const byBox = new Map<number, BoxOutliers>();
  const series: number[] = [];

  for (const s of visible) {
    if (seriesType(chart, s) !== 'scatter') {
      continue;
    }
    const found: { j: number; value: number; selector: string; lower: boolean }[] = [];
    const drawn = drawnIndices(ctx, markerSelector(ctx.root, s));
    const fits = seriesValues(chart, s).every((raw, k) => {
      const value = toNumber(raw);
      // ApexCharts draws a scatter over categories only up to one point per
      // category slot; a value it did not draw is not in the chart.
      if (value === null || (drawn !== null && !drawn.has(k))) {
        return true;
      }
      const written = authoredX(chart, s, k);
      const position = toNumber(g.seriesX?.[s]?.[k]);
      const j = typeof written === 'string'
        ? labels.indexOf(written)
        : position !== null ? position - 1 : -1;
      const min = toNumber(g.seriesCandleO?.[box]?.[j]);
      const max = toNumber(g.seriesCandleC?.[box]?.[j]);
      if (j < 0 || j >= boxCount || min === null || max === null || (value >= min && value <= max)) {
        return false;
      }
      found.push({ j, value, selector: markerAtSelector(ctx.root, s, k), lower: value < min });
      return true;
    });
    if (!fits || found.length === 0) {
      continue;
    }
    series.push(s);
    for (const outlier of found) {
      const entry = byBox.get(outlier.j) ?? { lower: [], upper: [] };
      (outlier.lower ? entry.lower : entry.upper).push({ value: outlier.value, selector: outlier.selector });
      byBox.set(outlier.j, entry);
    }
  }
  if (series.length === 0) {
    return null;
  }
  for (const entry of byBox.values()) {
    entry.lower.sort((a, b) => a.value - b.value);
    entry.upper.sort((a, b) => a.value - b.value);
  }
  return { series, byBox };
}

/**
 * Builds a box layer for one box plot series.
 *
 * ApexCharts keeps a box's five numbers in its candlestick fields, and not
 * in the order their names suggest: `seriesCandleO` is the minimum, `H` q1,
 * `M` the median, `L` q3 and `C` the maximum. Each box is split into its
 * quartile body, median, quartile edges and whisker caps first (see
 * `split.ts`).
 *
 * @param ctx      - The conversion context
 * @param i        - The series' index
 * @param outliers - Outliers found in a scatter series over the boxes
 * @returns The layer, or null when the series has no complete box
 */
function boxLayer(ctx: Context, i: number, outliers?: Map<number, BoxOutliers>): MaidrLayer | null {
  const { chart } = ctx;
  const g = chart.w.globals;
  const horizontal = isHorizontal(chart);
  const group = groupOf(ctx, i);
  if (group && splitBoxes(group, horizontal).length > 0) {
    warnOnce(chart, 'box-split', 'Some boxes could not be split into quartiles and whiskers; they are not highlighted.');
  }

  const maxes = g.seriesCandleC?.[i] ?? [];
  const categories = categoriesOf(chart, i, maxes.length);
  const data: BoxPoint[] = [];
  const selectors: BoxSelector[] = [];
  maxes.forEach((rawMax, j) => {
    const min = toNumber(g.seriesCandleO?.[i]?.[j]);
    const q1 = toNumber(g.seriesCandleH?.[i]?.[j]);
    const q2 = toNumber(g.seriesCandleM?.[i]?.[j]);
    const q3 = toNumber(g.seriesCandleL?.[i]?.[j]);
    const max = toNumber(rawMax);
    if (min === null || q1 === null || q2 === null || q3 === null || max === null) {
      return;
    }
    const own = outliers?.get(j) ?? { lower: [], upper: [] };
    data.push({
      z: String(categories[j]),
      lowerOutliers: own.lower.map(o => o.value),
      min,
      q1,
      q2,
      q3,
      max,
      upperOutliers: own.upper.map(o => o.value),
    });
    selectors.push({
      lowerOutliers: own.lower.map(o => o.selector),
      min: partSelector(ctx.root, i, j, 'min'),
      iq: partSelector(ctx.root, i, j, 'iq'),
      q1: partSelector(ctx.root, i, j, 'q1'),
      q2: partSelector(ctx.root, i, j, 'q2'),
      q3: partSelector(ctx.root, i, j, 'q3'),
      max: partSelector(ctx.root, i, j, 'max'),
      upperOutliers: own.upper.map(o => o.selector),
    });
  });
  if (data.length === 0) {
    return null;
  }
  return {
    id: nextLayerId(ctx),
    type: TraceType.BOX,
    name: seriesName(chart, i),
    ...(horizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: { x: axis(ctx.labels.x), y: axis(horizontal ? ctx.labels.y : yLabelOf(ctx, [i])) },
    selectors,
    data,
  };
}

/**
 * Builds a gantt layer from a chart's range bar series.
 *
 * An ApexCharts series is a group of intervals (a person, a team) spread
 * over the lanes on the category axis, while a MAIDR gantt is organised by
 * lane. So the intervals are regrouped lane by lane, in the order the chart
 * lists the lanes, each lane's intervals by start; the selector list follows
 * the same order. When several series share the chart, each interval is
 * labelled with its series' name. On a datetime axis the positions are
 * restated in days, hours, minutes or seconds, so each task's length is
 * announced in that unit while its start and end still read as dates.
 *
 * @param ctx     - The conversion context
 * @param indices - The range bar series
 * @returns The layer, or null when there is no interval
 */
function ganttLayer(ctx: Context, indices: number[]): MaidrLayer | null {
  const { chart } = ctx;
  const g = chart.w.globals;
  const horizontal = isHorizontal(chart);
  const datetime = isDatetime(chart);

  const lanes: string[] = (g.labels ?? []).map(labelText);
  const byLane = new Map<string, { point: GanttPoint; selector: string }[]>();
  for (const lane of lanes) {
    byLane.set(lane, []);
  }

  for (const i of indices) {
    const starts = g.seriesRangeStart?.[i] ?? [];
    starts.forEach((rawStart, j) => {
      const start = toNumber(rawStart);
      const end = toNumber(g.seriesRangeEnd?.[i]?.[j]);
      const written = authoredX(chart, i, j);
      const lane = typeof written === 'string' ? written : labelText(g.seriesX?.[i]?.[j]);
      if (start === null || end === null || lane === '') {
        return;
      }
      if (!byLane.has(lane)) {
        byLane.set(lane, []);
        lanes.push(lane);
      }
      byLane.get(lane)?.push({
        point: {
          x: lane,
          start,
          end,
          ...(indices.length > 1 ? { label: seriesName(chart, i) } : {}),
        },
        selector: rangeBarSelector(ctx.root, i, j),
      });
    });
  }

  const rows = lanes.map(lane => [...(byLane.get(lane) ?? [])].sort((a, b) => a.point.start - b.point.start));
  const selectors = rows.flat().map(entry => entry.selector);
  if (selectors.length === 0) {
    return null;
  }

  // A datetime axis measures in milliseconds, and a task announced as lasting
  // 950400000 has not been announced. So the positions are restated in the
  // coarsest unit the shortest task fills, and the axis format turns them
  // back into the dates they name.
  const scale = datetime ? ganttScale(rows.flat().map(entry => entry.point)) : undefined;
  const points = rows.map(row => row.map(({ point }) => scale
    ? { ...point, start: point.start / scale.ms, end: point.end / scale.ms }
    : point));
  const stamps = rows.flat().flatMap(entry => [entry.point.start, entry.point.end]);
  const timeFormat = datetime ? scaledDateFormat(chart, stamps, scale?.ms ?? 1) : undefined;
  const timeAxis = axis(horizontal ? ctx.labels.x : ctx.labels.y, timeFormat);
  const laneAxis = axis(horizontal ? ctx.labels.y : ctx.labels.x);
  const data: GanttData = {
    points,
    lanes,
    ...(scale ? { unit: scale.unit } : {}),
  };
  return {
    id: nextLayerId(ctx),
    type: TraceType.GANTT,
    orientation: horizontal ? Orientation.HORIZONTAL : Orientation.VERTICAL,
    axes: horizontal ? { x: timeAxis, y: laneAxis } : { x: laneAxis, y: timeAxis },
    selectors,
    data,
  };
}

/**
 * The units a datetime schedule is announced in, coarsest first, with the
 * milliseconds in one of each.
 */
const GANTT_UNITS: { unit: string; ms: number }[] = [
  { unit: 'days', ms: 86_400_000 },
  { unit: 'hours', ms: 3_600_000 },
  { unit: 'minutes', ms: 60_000 },
  { unit: 'seconds', ms: 1000 },
];

/**
 * The unit a datetime schedule is announced in: the coarsest one the
 * shortest task lasts at least one of. Zero-length milestones are left out,
 * since they would drive every schedule down to milliseconds.
 *
 * @param points - The intervals, in epoch milliseconds
 * @returns The unit, or undefined when no task lasts a second
 */
function ganttScale(points: GanttPoint[]): { unit: string; ms: number } | undefined {
  const lengths = points.map(p => p.end - p.start).filter(length => Number.isFinite(length) && length > 0);
  if (lengths.length === 0) {
    return undefined;
  }
  const shortest = Math.min(...lengths);
  return GANTT_UNITS.find(candidate => shortest >= candidate.ms);
}

/**
 * The axis format for datetime positions stated in a coarser unit: the value
 * is scaled back to milliseconds and formatted as the date it names.
 *
 * @param chart      - The chart, for its UTC setting
 * @param timestamps - The positions, in epoch milliseconds
 * @param ms         - The milliseconds in one unit of the scaled positions
 * @returns The format
 */
function scaledDateFormat(chart: ApexChartsInstance, timestamps: number[], ms: number): AxisFormat {
  if (ms === 1) {
    return dateFormat(chart, timestamps);
  }
  const options = JSON.stringify(dateOptions(chart, timestamps));
  return { function: `return new Date(value * ${ms}).toLocaleString('en-US', ${options});` };
}

/**
 * The flat values and labels of a chart whose series are its slices.
 *
 * A slice hidden through the legend is left out: ApexCharts keeps drawing it
 * at zero, but it is not part of the chart the legend now shows, and a zero
 * read out for it would say the slice holds nothing.
 *
 * @param chart - A pie, donut, polar area or radial bar chart
 * @returns One entry per shown slice, in drawn order, with its index
 */
function slices(chart: ApexChartsInstance): { j: number; label: string; value: number | null }[] {
  const g = chart.w.globals;
  const hidden = new Set(g.collapsedSeriesIndices ?? []);
  const values = g.series as unknown[];
  return values
    .map((raw, j) => ({
      j,
      label: labelText(g.labels?.[j]) || `Slice ${j + 1}`,
      value: toNumber(raw),
    }))
    .filter(slice => !hidden.has(slice.j));
}

/**
 * The selector for the slices {@link slices} returns: every slice when none
 * is hidden, otherwise the shown ones by index.
 *
 * @param ctx   - The conversion context
 * @param shown - The shown slices
 * @returns The selector
 */
function slicesSelector(ctx: Context, shown: { j: number }[]): string {
  const all = (ctx.chart.w.globals.series as unknown[]).length;
  return shown.length === all ? pieSelector(ctx.root) : pieSelector(ctx.root, shown.map(slice => slice.j));
}

/**
 * Builds a pie layer for a pie or donut chart.
 *
 * Every shown slice stays in the data, a zero one included: ApexCharts still
 * draws a path for it, and the selector has to match exactly one element per
 * slice. A slice hidden through the legend is left out.
 *
 * @param ctx - The conversion context
 * @returns The layer
 */
function pieLayer(ctx: Context): MaidrLayer {
  const { chart } = ctx;
  const shown = slices(chart);
  const data: PiePoint[] = shown.map(slice => ({ x: slice.label, y: slice.value ?? 0 }));
  const start = chart.w.config.plotOptions?.pie?.startAngle;
  return {
    id: nextLayerId(ctx),
    type: TraceType.PIE,
    // ApexCharts measures `startAngle` clockwise from 12 o'clock and always
    // lays the slices out clockwise, which is the grammar's own convention.
    ...pieGeometry(isAngle(start) ? start : 0, true),
    axes: { x: axis(ctx.labels.x), y: axis(ctx.labels.y) },
    selectors: slicesSelector(ctx, shown),
    data,
  };
}

/**
 * Builds a polar area layer: one series whose spokes are the slices.
 *
 * @param ctx - The conversion context
 * @returns The layer
 */
function polarAreaLayer(ctx: Context): MaidrLayer {
  const shown = slices(ctx.chart);
  const row: LinePoint[] = shown.map(slice => ({ x: slice.label, y: slice.value }));
  return {
    id: nextLayerId(ctx),
    type: TraceType.POLAR_AREA,
    axes: { x: axis(ctx.labels.x), y: axis(ctx.labels.y) },
    selectors: [slicesSelector(ctx, shown)],
    data: [row],
  };
}

/**
 * Builds one gauge layer per ring of a radial bar chart.
 *
 * ApexCharts draws each ring as a percentage, so each dial runs 0 to 100.
 *
 * @param ctx - The conversion context
 * @returns The layers
 */
function gaugeLayers(ctx: Context): MaidrLayer[] {
  const layers: MaidrLayer[] = [];
  slices(ctx.chart).forEach((slice) => {
    if (slice.value === null) {
      return;
    }
    const data: GaugePoint = { value: slice.value, min: 0, max: 100, label: slice.label };
    layers.push({
      id: nextLayerId(ctx),
      type: TraceType.GAUGE,
      name: slice.label,
      axes: { x: axis(ctx.labels.x ?? 'Measure'), y: axis(ctx.labels.y) },
      selectors: gaugeSelector(ctx.root, slice.j),
      data,
    });
  });
  return layers;
}

/**
 * Builds the heat map layer.
 *
 * Each series is a row. ApexCharts draws the first series at the bottom
 * (at the top on a reversed y axis) and places each cell by its index, not
 * its `x`, with the column labels taken from the first series. The data
 * runs top row first, as the grammar asks; the selector grid is indexed by
 * the model's row, which runs from the bottom.
 *
 * @param ctx - The conversion context
 * @returns The layer, or null when no row is drawn
 */
function heatmapLayer(ctx: Context): MaidrLayer | null {
  const { chart } = ctx;
  const visible = visibleSeries(chart);
  if (visible.length === 0) {
    return null;
  }
  const count = Math.max(chart.w.globals.labels?.length ?? 0, ...visible.map(i => seriesValues(chart, i).length));
  const columns = categoriesOf(chart, visible[0], count).map(String);
  const topFirst = firstYAxis(chart)?.reversed ? visible : [...visible].reverse();

  const data: HeatmapData = {
    x: columns,
    y: topFirst.map(i => seriesName(chart, i)),
    points: topFirst.map((i) => {
      const values = seriesValues(chart, i);
      return range(count).map(j => toNumber(values[j]));
    }),
  };
  // One query per row rather than one per cell: this runs on every redraw.
  const selectors = [...topFirst].reverse().map((i) => {
    const drawn = drawnIndices(ctx, `${ctx.root} rect.apexcharts-heatmap-rect[i="${i}"][j]`);
    return range(count).map(j => (drawn === null || drawn.has(j) ? heatCellSelector(ctx.root, i, j) : null));
  });

  return {
    id: nextLayerId(ctx),
    type: TraceType.HEATMAP,
    axes: { x: axis(ctx.labels.x), y: axis(ctx.labels.y), z: axis(ctx.labels.z) },
    selectors,
    data,
  };
}

/**
 * Builds the treemap layer.
 *
 * Each tile is a leaf. With several series, each series is a parent the
 * leaves sit under. Leaf names are read from the options as written, since
 * ApexCharts keeps only the first series' names in its state.
 *
 * @param ctx - The conversion context
 * @returns The layer, or null when there is no tile
 */
function treemapLayer(ctx: Context): MaidrLayer | null {
  const { chart } = ctx;
  const visible = visibleSeries(chart);
  const data: TreemapPoint[] = [];
  const selectors: string[] = [];
  for (const i of visible) {
    const parent = seriesName(chart, i);
    seriesValues(chart, i).forEach((raw, j) => {
      const value = toNumber(raw);
      if (value === null) {
        return;
      }
      const written = authoredX(chart, i, j);
      const name = typeof written === 'string' || typeof written === 'number'
        ? String(written)
        : labelText(chart.w.globals.categoryLabels?.[j]) || `Item ${j + 1}`;
      data.push({ x: name, y: value, ...(visible.length > 1 ? { path: [parent] } : {}) });
      selectors.push(treemapSelector(ctx.root, i, j));
    });
  }
  if (data.length === 0) {
    return null;
  }
  return {
    id: nextLayerId(ctx),
    type: TraceType.TREEMAP,
    axes: { x: axis(ctx.labels.x), y: axis(ctx.labels.y) },
    selectors,
    data,
  };
}

/**
 * Builds the radar layer, one row per series.
 *
 * Radar outlines repeat their first vertex, so the path cannot be read point
 * by point; every spoke has a marker instead, a null one included.
 *
 * @param ctx - The conversion context
 * @returns The layer, or null when no series is drawn
 */
function radarLayer(ctx: Context): MaidrLayer | null {
  const { chart } = ctx;
  const visible = visibleSeries(chart);
  if (visible.length === 0) {
    return null;
  }
  const labels = chart.w.globals.labels ?? [];
  const data: LinePoint[][] = visible.map((i) => {
    const name = seriesName(chart, i);
    return seriesValues(chart, i).map((raw, j) => ({
      x: labelText(labels[j]) || String(j + 1),
      y: toNumber(raw),
      z: name,
    }));
  });
  return {
    id: nextLayerId(ctx),
    type: TraceType.RADAR,
    ...(visible.length === 1 ? { name: seriesName(chart, visible[0]) } : {}),
    axes: { x: axis(ctx.labels.x), y: axis(ctx.labels.y) },
    selectors: visible.map(i => radarMarkerSelector(ctx.root, i)),
    data,
  };
}
