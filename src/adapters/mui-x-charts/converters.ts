import type {
  BarPoint,
  FlowPoint,
  GaugePoint,
  HeatmapData,
  LinePoint,
  Maidr as MaidrData,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
} from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import type {
  MuiAxisConfig,
  MuiChartKind,
  MuiChartProps,
  MuiChartsAdapterConfig,
  MuiColorMap,
  MuiRadarMetric,
  MuiSankeySeries,
  MuiSeriesConfig,
} from './types';
import {
  percentileBandPoints,
  readPercentileBandOptions,
  warnUnreadBand,
  warnUnreadMedian,
} from '@adapters/shared/percentileBandOption';
import { isAngle, pieGeometry } from '@adapters/shared/pieGeometry';
import { drawsPrCurves } from '@adapters/shared/prCurveAxes';
import { Orientation, TraceType } from '@type/grammar';
import { Children, cloneElement, isValidElement } from 'react';
import {
  areaSeriesSelector,
  barCellSelector,
  barSeriesSelector,
  funnelSeriesSelector,
  gaugeValueSelector,
  heatmapCellSelector,
  lineSeriesSelector,
  pieSeriesSelector,
  radarSeriesSelector,
  sankeyLinkSelector,
  scatterSeriesSelector,
} from './selectors';

/**
 * The MUI X chart element found among a wrapper's children, with the kind its
 * component name gives when the name survived the build.
 */
export interface MuiChartElement {
  props: MuiChartProps;
  /** `undefined` when the component's name does not say which chart it is. */
  kind?: MuiChartKind;
}

/**
 * The chart kind a component name says, `BarChart` and its `Pro` and
 * `Premium` variants alike.
 */
const KIND_BY_NAME: Record<string, MuiChartKind> = {
  BarChart: 'bar',
  LineChart: 'line',
  ScatterChart: 'scatter',
  PieChart: 'pie',
  SparkLineChart: 'sparkline',
  Gauge: 'gauge',
  GaugeContainer: 'gauge',
  RadarChart: 'radar',
  Heatmap: 'heatmap',
  FunnelChart: 'funnel',
  SankeyChart: 'sankey',
};

/** Messages already written to the console, so a re-render does not repeat them. */
const warned = new Set<string>();

/**
 * Warns once per chart about something the adapter cannot read faithfully.
 *
 * The chart's MAIDR id leads the message, so a page with several MUI charts
 * says which one needs attention, and a re-render repeats nothing.
 *
 * @param chartId - The MAIDR id of the chart the warning is about
 * @param message - What is lost and what to do about it
 */
export function warnOnce(chartId: string, message: string): void {
  const text = `[MAIDR] MUI X Charts, chart "${chartId}": ${message}`;
  if (warned.has(text))
    return;
  warned.add(text);
  console.warn(text);
}

/**
 * Reads the chart kind off a React element's component, if its name says.
 *
 * MUI declares each chart as `React.forwardRef(function BarChart(...))`, so
 * the name lives on the forwardRef object's `render` function, and on
 * `displayName` in development builds. A consumer's minifier may rename the
 * function; the kind then comes from the rendered SVG instead.
 */
function kindFromType(type: unknown): MuiChartKind | undefined {
  if (type === null || (typeof type !== 'object' && typeof type !== 'function'))
    return undefined;
  const obj = type as { displayName?: unknown; name?: unknown; render?: { displayName?: unknown; name?: unknown } };
  const names = [obj.displayName, obj.name, obj.render?.displayName, obj.render?.name];
  for (const name of names) {
    if (typeof name !== 'string')
      continue;
    const base = name.replace(/(Pro|Premium)$/, '');
    if (base in KIND_BY_NAME)
      return KIND_BY_NAME[base];
  }
  return undefined;
}

/**
 * Whether an element's props are an MUI X chart's, and how sure that is.
 *
 * - `2`: a chart by its props alone -- a `series` array, or a sankey's
 *   `series` object with `links` -- or by its component's name
 * - `1`: a sparkline's `data` array or a gauge's `value`, which a minified
 *   component could still be; taken only when nothing surer is in the tree
 * - `0`: not a chart
 */
function chartConfidence(props: Record<string, unknown>, kind: MuiChartKind | undefined): 0 | 1 | 2 {
  if (kind !== undefined || Array.isArray(props.series))
    return 2;
  const series = props.series as MuiSankeySeries | undefined;
  if (series && typeof series === 'object' && Array.isArray(series.data?.links))
    return 2;
  const childless = props.children === undefined;
  if (childless && Array.isArray(props.data))
    return 1;
  // A `<GaugeContainer>` composes its dial from children, so a gauge's
  // `value` counts with children too when the dial's range is written out.
  const gaugeShaped = typeof props.value === 'number' || props.value === null;
  if (gaugeShaped && (childless || 'valueMin' in props || 'valueMax' in props))
    return 1;
  return 0;
}

/**
 * Finds the MUI X chart element in `children`, searched depth-first through
 * plain wrapper elements. A chart recognised by its `series` or its name wins
 * over a sparkline- or gauge-shaped element found earlier in the tree.
 *
 * @param children - The wrapper component's children
 * @returns The chart's props and, when its name says, its kind
 */
export function findMuiChartElement(children: ReactNode): MuiChartElement | undefined {
  let fallback: MuiChartElement | undefined;
  const visit = (nodes: ReactNode): MuiChartElement | undefined => {
    for (const child of Children.toArray(nodes)) {
      if (!isValidElement(child))
        continue;
      const element = child as ReactElement<Record<string, unknown>>;
      const props = element.props ?? {};
      const kind = kindFromType(element.type);
      const confidence = chartConfidence(props, kind);
      if (confidence === 2)
        return { props: props as MuiChartProps, kind };
      if (confidence === 1 && fallback === undefined)
        fallback = { props: props as MuiChartProps, kind };
      if (props.children !== undefined) {
        const nested = visit(props.children as ReactNode);
        if (nested)
          return nested;
      }
    }
    return undefined;
  };
  return visit(children) ?? fallback;
}

/**
 * `children` with MUI X's own keyboard navigation turned off on the chart
 * element, unless the consumer set `disableKeyboardNavigation` themselves.
 *
 * MUI X v9 makes every chart a tab stop that moves its own focus ring and
 * speaks its own announcements on the arrow keys. Inside MAIDR's plot that is
 * a second, competing reading of the same chart: two tab stops, and the arrow
 * keys driving both. MAIDR's navigation is the one this wrapper exists for.
 *
 * @param children - The wrapper component's children
 * @returns The same tree, with the chart element cloned where needed
 */
export function withMuiKeyboardNavigationDisabled(children: ReactNode): ReactNode {
  const chart = findMuiChartElement(children);
  let done = false;
  const visit = (nodes: ReactNode): ReactNode => Children.map(nodes, (child) => {
    if (done || !isValidElement(child))
      return child;
    const element = child as ReactElement<Record<string, unknown>>;
    const props = element.props ?? {};
    if (chart !== undefined && props === chart.props) {
      done = true;
      // A gauge has no keyboard navigation and no such prop, and a sparkline
      // (MUI X 9.14) takes the prop without passing it on: either way it
      // would reach the DOM as an unknown attribute and change nothing.
      const takesProp = chart.kind === undefined
        ? props.series !== undefined
        : chart.kind !== 'gauge' && chart.kind !== 'sparkline';
      return props.disableKeyboardNavigation === undefined && takesProp
        ? cloneElement(element, { disableKeyboardNavigation: true })
        : element;
    }
    if (props.children === undefined)
      return element;
    const nested = visit(props.children as ReactNode);
    return done ? cloneElement(element, undefined, nested) : element;
  });
  const result = visit(children);
  // `Children.map` flattens a single child into a one-element array; hand a
  // single child back as it came.
  return Array.isArray(result) && !Array.isArray(children) && result.length === 1 ? result[0] : result;
}

/**
 * The id MUI gives a series, which is what it stamps on the series' marks as
 * `data-series`: the consumer's own `id`, or `auto-generated-id-<index>` where
 * the index is the series' position in the chart's `series` array.
 */
export function muiSeriesId(series: MuiSeriesConfig, index: number): string {
  return series.id !== undefined && series.id !== null ? String(series.id) : `auto-generated-id-${index}`;
}

/**
 * A chart's series as an array: every chart but a sankey keeps them in one.
 */
function seriesList(props: MuiChartProps): readonly MuiSeriesConfig[] {
  return Array.isArray(props.series) ? props.series : [];
}

/**
 * The name a series is announced and listed in the legend by.
 */
function seriesLabel(series: MuiSeriesConfig, index: number): string {
  const { label } = series;
  if (typeof label === 'function') {
    try {
      const text = label('legend');
      if (typeof text === 'string' && text !== '')
        return text;
    } catch {
      // A label callback that throws outside MUI's own render names nothing.
    }
  } else if (typeof label === 'string' && label !== '') {
    return label;
  }
  return `Series ${index + 1}`;
}

/**
 * A finite number, or `null` for anything MUI would leave undrawn.
 */
function toValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * A dataset cell as MUI reads it for a `dataKey`: a number, or nothing. MUI
 * leaves a string such as `'4'` undrawn (and warns), so it is not a reading.
 */
function datasetValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Calls a consumer's `valueGetter` on one row, reading nothing from a getter
 * that throws.
 */
function callGetter(getter: (row: never) => unknown, row: unknown): unknown {
  try {
    return getter(row as never);
  } catch {
    return undefined;
  }
}

/**
 * A bar series' values, in the order MUI's bar processor looks for them:
 * `valueGetter` over the dataset, then its `dataKey` column, then `data`.
 */
function barSeriesValues(series: MuiSeriesConfig, dataset: MuiChartProps['dataset']): (number | null)[] {
  if (series.valueGetter && Array.isArray(dataset))
    return dataset.map(row => toValue(callGetter(series.valueGetter as (row: never) => unknown, row)));
  if (series.dataKey && Array.isArray(dataset))
    return dataset.map(row => datasetValue(row?.[series.dataKey as string]));
  return Array.isArray(series.data) ? series.data.map(toValue) : [];
}

/**
 * A line series' values, in the order MUI's line processor looks for them:
 * its own `data`, then `valueGetter` over the dataset, then its `dataKey`.
 */
function lineSeriesValues(series: MuiSeriesConfig, dataset: MuiChartProps['dataset']): (number | null)[] {
  if (Array.isArray(series.data))
    return series.data.map(toValue);
  if (series.valueGetter && Array.isArray(dataset))
    return dataset.map(row => toValue(callGetter(series.valueGetter as (row: never) => unknown, row)));
  if (series.dataKey && Array.isArray(dataset))
    return dataset.map(row => datasetValue(row?.[series.dataKey as string]));
  return [];
}

/**
 * An axis' values: its own `data`, or its `dataKey` column of the dataset.
 */
function axisValues(axis: MuiAxisConfig | undefined, dataset: MuiChartProps['dataset']): readonly unknown[] | undefined {
  if (!axis)
    return undefined;
  if (Array.isArray(axis.data))
    return axis.data;
  if (axis.dataKey && Array.isArray(dataset))
    return dataset.map(row => row?.[axis.dataKey as string]);
  return undefined;
}

/** An axis bound as a number, dates included; `undefined` when not set. */
function axisBound(value: unknown): number | undefined {
  if (value instanceof Date)
    return value.getTime();
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * A `Date` in the shortest ISO form that loses nothing: the day alone when it
 * falls on a UTC midnight, the full timestamp otherwise.
 */
function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime()))
    return String(date);
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
}

/**
 * How a position on an axis is announced.
 *
 * The axis' own `valueFormatter` is preferred, since it is what the chart
 * prints on its ticks; numbers otherwise stay numbers so a numeric x axis
 * keeps sounding as one.
 */
function formatAxisValue(value: unknown, axis: MuiAxisConfig | undefined): string | number {
  if (axis?.valueFormatter) {
    try {
      const text = (axis.valueFormatter as (v: unknown, c: unknown) => unknown)(value, { location: 'tick' });
      if (typeof text === 'string' && text !== '')
        return text;
    } catch {
      // Fall through to the raw value: a formatter that needs MUI's own
      // context (a scale, a tick count) cannot be called outside a render.
    }
  }
  if (value instanceof Date)
    return formatDate(value);
  if (typeof value === 'number')
    return value;
  return value === null || value === undefined ? '' : String(value);
}

/** The label of an axis, if the chart set one. */
function axisLabel(axis: MuiAxisConfig | undefined): string | undefined {
  return typeof axis?.label === 'string' && axis.label !== '' ? axis.label : undefined;
}

/** The `axes` of a layer, from the chart's first x and y axis. */
function layerAxes(props: MuiChartProps): MaidrLayer['axes'] {
  const x = axisLabel(props.xAxis?.[0]);
  const y = axisLabel(props.yAxis?.[0]);
  return {
    ...(x ? { x: { label: x } } : {}),
    ...(y ? { y: { label: y } } : {}),
  };
}

/**
 * Says so when the chart draws its marks in a way the selectors cannot name.
 *
 * `renderer="svg-batch"` (and, for a scatter, `"svg-progressive"`) draws a
 * series as batched `<path>`s with no element per bar or marker, so there is
 * nothing to outline. Audio, text and braille are unaffected.
 */
function warnOnBatchRenderer(kind: MuiChartKind, props: MuiChartProps, chartId: string): void {
  if (props.renderer === undefined || props.renderer === 'svg-single')
    return;
  warnOnce(
    chartId,
    `a ${kind} chart with renderer="${props.renderer}" draws no element per mark, so MAIDR `
    + 'cannot outline the one being read. Audio, text and braille are unaffected; '
    + 'use the default renderer="svg-single" for highlighting.',
  );
}

/**
 * The layers and legend of one converted chart.
 */
export interface MuiConvertedChart {
  layers: MaidrLayer[];
  legend?: string[];
}

interface SeriesEntry {
  series: MuiSeriesConfig;
  id: string;
  label: string;
  values: (number | null)[];
}

/**
 * Series grouped by how MUI draws them together: series sharing a `stack` id
 * form one group, every other series is a group of its own. Groups keep the
 * order their first series appears in.
 */
function groupByStack(entries: SeriesEntry[]): SeriesEntry[][] {
  const groups = new Map<string, SeriesEntry[]>();
  entries.forEach((entry, index) => {
    const key = entry.series.stack !== undefined && entry.series.stack !== null
      ? `stack:${entry.series.stack}`
      : `solo:${index}`;
    const group = groups.get(key);
    if (group)
      group.push(entry);
    else
      groups.set(key, [entry]);
  });
  return [...groups.values()];
}

/**
 * Which bars of a stack group MUI draws, `[series][category]`.
 *
 * A bar with no value is never drawn. With an explicit `min`/`max` on the
 * value axis, a bar lying wholly outside it is culled as well -- MUI renders
 * no element for it -- so the grid's n-th-drawn-bar selectors must skip it
 * too. The bar spans from its stack base to base plus value; bases follow
 * MUI's default `'diverging'` offset (positives on positives, negatives on
 * negatives) or `'none'`. An `'expand'` stack is drawn in shares, which the
 * axis bounds are not written in, so it is taken as drawn.
 */
function drawnBars(group: SeriesEntry[], categories: number, valueAxis: MuiAxisConfig | undefined): boolean[][] {
  const min = axisBound(valueAxis?.min);
  const max = axisBound(valueAxis?.max);
  const offset = group.find(entry => entry.series.stackOffset !== undefined)?.series.stackOffset ?? 'diverging';
  const bounded = (min !== undefined || max !== undefined) && offset !== 'expand';
  const positive = Array.from<number>({ length: categories }).fill(0);
  const negative = Array.from<number>({ length: categories }).fill(0);

  return group.map(entry => Array.from({ length: categories }, (_, i) => {
    const value = entry.values[i];
    if (value === null || value === undefined)
      return false;
    let base: number;
    if (group.length === 1) {
      base = 0;
    } else if (offset === 'none') {
      base = positive[i];
      positive[i] += value;
    } else if (value >= 0) {
      base = positive[i];
      positive[i] += value;
    } else {
      base = negative[i];
      negative[i] += value;
    }
    if (!bounded)
      return true;
    const low = Math.min(base, base + value);
    const high = Math.max(base, base + value);
    return !((max !== undefined && low > max) || (min !== undefined && high < min));
  }));
}

/**
 * Converts a `<BarChart>`.
 *
 * - one series → `bar`
 * - several series, none stacked → `dodged_bar`
 * - series sharing a `stack` → `stacked_bar` (`stacked_normalized_bar` when
 *   the stack's `stackOffset` is `'expand'`)
 *
 * A chart mixing stacks with unstacked series, or holding two stacks, has no
 * single MAIDR equivalent; each stack group becomes its own layer.
 *
 * `layout="horizontal"` moves the categories to the y axis. The payload is
 * then written the way the core reads a horizontal bar -- `x` the magnitude,
 * `y` the category -- and MUI's axes already name the horizontal and vertical
 * axis, so their labels need no swapping.
 */
function convertBar(props: MuiChartProps, scope: string): MuiConvertedChart {
  // MUI's own rule: the chart's `layout` decides, and only when it is left
  // unset does a series' `layout` turn the chart on its side.
  const horizontal = props.layout === 'horizontal'
    || (props.layout === undefined && seriesList(props).some(series => series.layout === 'horizontal'));
  const xAxis = props.xAxis?.[0];
  const yAxis = props.yAxis?.[0];
  const bandAxis = horizontal ? yAxis : xAxis;
  const valueAxis = horizontal ? xAxis : yAxis;
  const entries: SeriesEntry[] = seriesList(props).map((series, index) => ({
    series,
    id: muiSeriesId(series, index),
    label: seriesLabel(series, index),
    values: barSeriesValues(series, props.dataset),
  }));
  const rawCategories = axisValues(bandAxis, props.dataset);
  const count = rawCategories?.length ?? Math.max(0, ...entries.map(entry => entry.values.length));
  // Without band data MUI numbers the categories from 0, and so does its axis.
  const categories = Array.from({ length: count }, (_, i) =>
    rawCategories ? formatAxisValue(rawCategories[i], bandAxis) : i);

  const orientation = horizontal ? { orientation: Orientation.HORIZONTAL } : {};
  const axes = layerAxes(props);
  const point = (category: string | number, value: number): BarPoint =>
    horizontal ? { x: value, y: category } : { x: category, y: value };

  /**
   * One series as a single-row bar layer. A bar MUI does not draw is not a
   * point, so every remaining point has exactly one rect, in order.
   */
  const barLayer = (entry: SeriesEntry, layerId: string, title?: string): MaidrLayer => {
    const [drawn] = drawnBars([entry], count, valueAxis);
    return {
      id: layerId,
      type: TraceType.BAR,
      ...(title ? { title } : {}),
      ...orientation,
      axes,
      selectors: barSeriesSelector(scope, entry.id),
      data: categories.flatMap((category, i) =>
        drawn[i] ? [point(category, entry.values[i] as number)] : []),
    };
  };

  /**
   * Several series as one grid layer. Every category keeps its cell, so the
   * rows stay aligned. A bar with no value is announced as a gap (`NaN`, which
   * the bar family reads as a missing reading) and a bar MUI did not draw has
   * a `null` selector cell, which the grammar reads as "no element here".
   */
  const gridLayer = (group: SeriesEntry[], type: TraceType, layerId: string, title?: string): MaidrLayer => {
    // Side by side, every bar starts at zero; only a stack builds on the
    // series before it.
    const drawn = type === TraceType.DODGED
      ? group.map(entry => drawnBars([entry], count, valueAxis)[0])
      : drawnBars(group, count, valueAxis);
    const data: SegmentedPoint[][] = [];
    const selectors: (string | null)[][] = [];
    group.forEach((entry, row) => {
      let position = 0;
      data.push(categories.map((category, i) =>
        ({ ...point(category, entry.values[i] ?? Number.NaN), z: entry.label })));
      selectors.push(categories.map((_, i) => {
        if (!drawn[row][i])
          return null;
        const selector = barCellSelector(scope, entry.id, position);
        position += 1;
        return selector;
      }));
    });
    return {
      id: layerId,
      type,
      ...(title ? { title } : {}),
      ...orientation,
      axes,
      selectors,
      data,
    };
  };

  const groups = groupByStack(entries);
  const legend = entries.length > 1 ? entries.map(entry => entry.label) : undefined;

  if (entries.length === 0)
    return { layers: [] };
  if (groups.every(group => group.length === 1)) {
    if (entries.length === 1)
      return { layers: [barLayer(entries[0], '0')] };
    return { layers: [gridLayer(entries, TraceType.DODGED, '0')], legend };
  }

  const titled = groups.length > 1;
  const layers = groups.map((group, index) => {
    const layerId = String(index);
    if (group.length === 1)
      return barLayer(group[0], layerId, titled ? group[0].label : undefined);
    const normalized = group.some(entry => entry.series.stackOffset === 'expand');
    const title = titled ? group.map(entry => entry.label).join(', ') : undefined;
    return gridLayer(group, normalized ? TraceType.NORMALIZED : TraceType.STACKED, layerId, title);
  });
  return { layers, legend };
}

/**
 * Where a d3 step curve jumps, in the grammar's terms: `stepAfter` holds each
 * value until the next x (`hv`), `stepBefore` jumps first (`vh`), and `step`
 * jumps halfway (`mid`). `undefined` for any curve that is not a staircase.
 */
function stepDirection(curve: string | undefined): StepDirection | undefined {
  switch (curve) {
    case 'stepAfter':
      return 'hv';
    case 'stepBefore':
      return 'vh';
    case 'step':
      return 'mid';
    default:
      return undefined;
  }
}

/**
 * Converts a `<LineChart>`.
 *
 * Plain series share one `line` layer and unstacked `area` series one `area`
 * layer; series sharing a `stack` become a `stacked_area` layer (normalised
 * when the stack's `stackOffset` is `'expand'`), whether or not they are
 * filled, since MUI draws a stacked line at the running total either way. A
 * plain series drawn with a step `curve` is a `step` layer, one per
 * direction, since its path has a corner between every two samples.
 *
 * Every series is highlighted through its line path, never its fill: the fill
 * runs down to the baseline and back, so its vertices are not the samples.
 */
function convertLine(
  props: MuiChartProps,
  scope: string,
  percentileBands?: MuiChartsAdapterConfig['percentileBands'],
): MuiConvertedChart {
  const xAxis = props.xAxis?.[0];
  const all: SeriesEntry[] = seriesList(props).map((series, index) => ({
    series,
    id: muiSeriesId(series, index),
    label: seriesLabel(series, index),
    values: lineSeriesValues(series, props.dataset),
  }));
  const rawX = axisValues(xAxis, props.dataset);
  const axes = layerAxes(props);
  const fans = fanLayers(all, rawX, xAxis, axes, scope, percentileBands);
  const entries = all.filter(entry => !fans.absorbed.has(entry));

  const points = (entry: SeriesEntry, stacked: boolean): LinePoint[] => {
    const length = rawX ? Math.min(rawX.length, entry.values.length) : entry.values.length;
    return Array.from({ length }, (_, i) => {
      const value = entry.values[i];
      return {
        x: rawX ? formatAxisValue(rawX[i], xAxis) : i,
        // A stack adds a missing value in as nothing; a lone line has a gap.
        y: stacked ? (value ?? 0) : value,
        z: entry.label,
      };
    });
  };

  interface Bucket { type: TraceType; entries: SeriesEntry[]; step?: StepDirection }
  const buckets = new Map<string, Bucket>();
  for (const entry of entries) {
    const { stack, area, stackOffset, curve } = entry.series;
    const step = stepDirection(curve);
    let key: string;
    let type: TraceType;
    if (stack !== undefined && stack !== null) {
      key = `stack:${stack}`;
      type = stackOffset === 'expand' ? TraceType.NORMALIZED_AREA : TraceType.STACKED_AREA;
    } else if (area) {
      key = 'area';
      type = TraceType.AREA;
    } else if (step) {
      key = `step:${step}`;
      type = TraceType.STEP;
    } else {
      key = 'line';
      type = TraceType.LINE;
    }
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.entries.push(entry);
      if (type === TraceType.NORMALIZED_AREA)
        bucket.type = type;
    } else {
      buckets.set(key, { type, entries: [entry], ...(type === TraceType.STEP ? { step } : {}) });
    }
  }

  const titled = buckets.size + fans.layers.length > 1;
  const lines = [...buckets.values()].map((bucket, index): MaidrLayer => {
    const stacked = bucket.type === TraceType.STACKED_AREA || bucket.type === TraceType.NORMALIZED_AREA;
    const data = bucket.entries.map(entry => points(entry, stacked));
    // A precision-recall curve is drawn as an ordinary line, and the axis
    // labels are the only thing on an MUI X chart that says so.
    const prCurve = (bucket.type === TraceType.LINE || bucket.type === TraceType.STEP)
      && drawsPrCurves(axes?.x?.label, axes?.y?.label, data);
    return {
      id: String(index),
      type: prCurve ? TraceType.PR_CURVE : bucket.type,
      ...(titled ? { title: bucket.entries.map(entry => entry.label).join(', ') } : {}),
      ...(bucket.step && !prCurve ? { stepDirection: bucket.step } : {}),
      axes,
      selectors: bucket.entries.map(entry => lineSeriesSelector(scope, entry.id)),
      data,
    };
  });
  const layers = [...fans.layers, ...lines].map((layer, index) => ({ ...layer, id: String(index) }));
  const legend = all.length > 1 ? all.map(entry => entry.label) : undefined;
  return { layers, legend };
}

/**
 * A `<LineChart>`'s declared fan charts, each as one `percentile_band` layer.
 *
 * The median is a series drawn as a plain line; each band an `area` series
 * on top of a stack of two or more, whose fill MUI draws between the stack
 * below it and its own top. The band's lower edge is that running total and
 * its upper edge the total with its own value added -- a missing value adding
 * nothing, as MUI stacks it -- and every series of its stack is the band
 * rather than a series of its own. A band naming nothing, not filled, not on
 * top of a stack, or already read is reported and left out; a median that is
 * not a plain line is reported and the chart is read as before.
 *
 * Highlighted as a fan is: each band's fill, outermost first, then the
 * median's line.
 *
 * @param entries - Every series of the chart
 * @param rawX - The x axis' values, when it has them
 * @param xAxis - The x axis
 * @param axes - The layer axes
 * @param scope - Selector prefix naming the chart's container
 * @param option - The caller's `percentileBands`
 * @returns The fan layers, and the series they absorbed
 */
function fanLayers(
  entries: SeriesEntry[],
  rawX: readonly unknown[] | undefined,
  xAxis: MuiAxisConfig | undefined,
  axes: MaidrLayer['axes'],
  scope: string,
  option: MuiChartsAdapterConfig['percentileBands'],
): { layers: MaidrLayer[]; absorbed: Set<SeriesEntry> } {
  const absorbed = new Set<SeriesEntry>();
  const layers: MaidrLayer[] = [];
  const named = (name: string): SeriesEntry | undefined =>
    entries.find(entry => entry.id === name) ?? entries.find(entry => entry.label === name);
  const stackOf = (entry: SeriesEntry): SeriesEntry[] =>
    entries.filter(one => one.series.stack !== undefined && one.series.stack === entry.series.stack);

  for (const plan of readPercentileBandOptions(option, 'MUI X Charts')) {
    const median = named(plan.median);
    if (!median || median.series.stack !== undefined || median.series.area || absorbed.has(median)) {
      warnUnreadMedian(
        'MUI X Charts',
        plan,
        !median ? 'names no series of this chart' : absorbed.has(median) ? 'another fan chart already reads' : 'is not drawn as a plain line',
      );
      continue;
    }
    absorbed.add(median);
    const length = rawX ? Math.min(rawX.length, median.values.length) : median.values.length;
    const xs = Array.from({ length }, (_, i) => (rawX ? formatAxisValue(rawX[i], xAxis) : i));
    const medians = xs.map((x, i) => ({ x, value: median.values[i] }));

    const selectors: string[] = [];
    const bands = plan.bands.flatMap((band) => {
      const entry = named(band.series);
      const stack = entry ? stackOf(entry) : [];
      const why = !entry
        ? 'names no series of this chart'
        : !entry.series.area
            ? 'is not drawn with area: true'
            : stack.length < 2 || stack[stack.length - 1] !== entry
              ? 'is not the top of a stack of two or more series, so its fill does not run between two edges'
              : stack.some(one => absorbed.has(one)) ? 'another band or median already reads' : undefined;
      if (!entry || why) {
        warnUnreadBand('MUI X Charts', plan, band.series, why ?? '');
        return [];
      }
      stack.forEach(one => absorbed.add(one));
      selectors.push(areaSeriesSelector(scope, entry.id));
      const below = stack.slice(0, -1);
      return [{
        lower: band.lower,
        upper: band.upper,
        edgesAt: (i: number): readonly [number | null, number | null] => {
          const floor = below.reduce((total, one) => total + (one.values[i] ?? 0), 0);
          const own = entry.values[i];
          return own === null || own === undefined ? [null, null] : [Math.min(floor, floor + own), Math.max(floor, floor + own)];
        },
      }];
    });

    layers.push({
      id: '',
      type: TraceType.PERCENTILE_BAND,
      title: plan.title ?? median.label,
      ...(plan.name ? { name: plan.name } : {}),
      axes,
      selectors: [...selectors, lineSeriesSelector(scope, median.id)],
      data: percentileBandPoints(medians, bands),
    });
  }
  return { layers, absorbed };
}

/**
 * One scatter series' points, in the order MUI's scatter processor looks for
 * them: `valueGetter` over the dataset, then its `datasetKeys`, then `data`.
 */
function scatterRawPoints(series: MuiSeriesConfig, dataset: MuiChartProps['dataset']): { x: unknown; y: unknown }[] {
  const fromDatum = (d: unknown): { x: unknown; y: unknown } => {
    const datum = (d ?? {}) as Record<string, unknown>;
    return { x: datum.x, y: datum.y };
  };
  if (series.valueGetter && Array.isArray(dataset))
    return dataset.map(row => fromDatum(callGetter(series.valueGetter as (row: never) => unknown, row)));
  if (series.datasetKeys && Array.isArray(dataset)) {
    const { x, y } = series.datasetKeys;
    if (typeof x !== 'string' || typeof y !== 'string')
      return [];
    return dataset.map(row => ({ x: row?.[x], y: row?.[y] }));
  }
  return Array.isArray(series.data) ? (series.data as unknown[]).map(fromDatum) : [];
}

/**
 * Converts a `<ScatterChart>`: one `point` layer per series, since each
 * series is its own cloud of points.
 *
 * MUI draws no marker for a point outside an explicit axis `min`/`max`, so
 * such a point is left out: the reader hears what the chart shows, and every
 * point announced has a marker to outline.
 */
function convertScatter(props: MuiChartProps, scope: string): MuiConvertedChart {
  const axes = layerAxes(props);
  const xMin = axisBound(props.xAxis?.[0]?.min);
  const xMax = axisBound(props.xAxis?.[0]?.max);
  const yMin = axisBound(props.yAxis?.[0]?.min);
  const yMax = axisBound(props.yAxis?.[0]?.max);
  const inside = (value: number, min?: number, max?: number): boolean =>
    (min === undefined || value >= min) && (max === undefined || value <= max);
  const all = seriesList(props);
  const titled = all.length > 1;

  const layers = all.map((series, index): MaidrLayer => {
    const data: ScatterPoint[] = scatterRawPoints(series, props.dataset).flatMap(({ x, y }) => {
      const px = toValue(x instanceof Date ? x.getTime() : x);
      const py = toValue(y instanceof Date ? y.getTime() : y);
      if (px === null || py === null || !inside(px, xMin, xMax) || !inside(py, yMin, yMax))
        return [];
      return [{ x: px, y: py }];
    });
    return {
      id: String(index),
      type: TraceType.SCATTER,
      ...(titled ? { title: seriesLabel(series, index) } : {}),
      axes,
      selectors: scatterSeriesSelector(scope, muiSeriesId(series, index)),
      data,
    };
  });
  const legend = titled ? all.map(seriesLabel) : undefined;
  return { layers, legend };
}

/**
 * The comparator MUI sorts a pie's slices with, or `null` to keep data order.
 */
function pieComparator(sorting: MuiSeriesConfig['sortingValues']): ((a: number, b: number) => number) | null {
  if (typeof sorting === 'function')
    return sorting;
  if (sorting === 'asc')
    return (a, b) => a - b;
  if (sorting === 'desc')
    return (a, b) => b - a;
  return null;
}

/**
 * Converts a `<PieChart>`: one `pie` layer per series, so a nested pie (one
 * ring per series) reads ring by ring.
 *
 * MUI measures `startAngle` and `endAngle` in degrees clockwise from 12
 * o'clock -- the grammar's own convention -- and draws from `startAngle ?? 0`
 * to `endAngle ?? 360`. An end before the start runs counterclockwise. The
 * grammar has no sweep, so a pie that does not go all the way round is laid
 * out by the reader as if it did.
 *
 * A pie with `sortingValues` draws its slices round the dial in value order
 * while its arcs stay in data order in the document. The payload is written
 * in dial order, which is what the walk, the clock positions and the pan
 * follow, and it carries no selectors: the one string a pie layer reads pairs
 * arcs in document order, which is no longer the payload's.
 */
function convertPie(props: MuiChartProps, scope: string, chartId: string): MuiConvertedChart {
  const all = seriesList(props);
  const titled = all.length > 1;

  const layers = all.map((series, index): MaidrLayer => {
    const items = Array.isArray(series.data) ? (series.data as unknown[]) : [];
    let data: PiePoint[] = items.map((item, i) => {
      const datum = (item ?? {}) as Record<string, unknown>;
      let label: unknown = datum.label;
      if (typeof label === 'function') {
        try {
          label = (label as (location: string) => unknown)('legend');
        } catch {
          label = undefined;
        }
      }
      const name = typeof label === 'string' && label !== ''
        ? label
        : String(datum.id ?? `Slice ${i + 1}`);
      return { x: name, y: toValue(datum.value) ?? 0 };
    });

    const comparator = pieComparator(series.sortingValues);
    if (comparator) {
      // `Array.prototype.sort` is stable, as d3's `pie` relies on too.
      data = data
        .map((slice, i) => ({ slice, i }))
        .sort((a, b) => comparator(a.slice.y, b.slice.y) || a.i - b.i)
        .map(({ slice }) => slice);
      warnOnce(
        chartId,
        'a pie with sortingValues draws its slices in a different order from its arcs in the '
        + 'document, so MAIDR reads it in the drawn order without outlining the slice.',
      );
    }

    const start = isAngle(series.startAngle) ? series.startAngle : 0;
    const end = isAngle(series.endAngle) ? series.endAngle : 360;
    return {
      id: String(index),
      type: TraceType.PIE,
      ...(titled ? { title: seriesLabel(series, index) } : {}),
      ...pieGeometry(start, end >= start),
      // A pie has no axes to read labels off; name what the two positions
      // mean on a pie rather than let the core announce "X" and "Y".
      axes: { x: { label: 'Category' }, y: { label: 'Value' } },
      ...(comparator ? {} : { selectors: pieSeriesSelector(scope, muiSeriesId(series, index)) }),
      data,
    };
  });
  return { layers };
}

/**
 * A `<SparkLineChart>` as the bar or line chart it draws: its one `data`
 * array is one series -- MUI gives it the id `auto-generated-id-0` -- and its
 * `xAxis`/`yAxis` are single axis objects rather than arrays.
 *
 * @param props - The sparkline's props
 * @param plotType - `'bar'` or `'line'`, when the drawing already said which
 * @returns The kind and props of the equivalent chart
 */
function sparklineAsChart(
  props: MuiChartProps,
  plotType?: 'bar' | 'line',
): { kind: 'bar' | 'line'; props: MuiChartProps } {
  const kind = plotType ?? (props.plotType === 'bar' ? 'bar' : 'line');
  const axis = (value: unknown): readonly MuiAxisConfig[] | undefined => {
    if (value === undefined || value === null)
      return undefined;
    return (Array.isArray(value) ? value : [value]) as MuiAxisConfig[];
  };
  const series: MuiSeriesConfig = {
    data: Array.isArray(props.data) ? props.data : [],
    ...(props.area ? { area: true } : {}),
    ...(typeof props.curve === 'string' ? { curve: props.curve } : {}),
  };
  return {
    kind,
    props: {
      series: [series],
      xAxis: axis(props.xAxis),
      yAxis: axis(props.yAxis),
      ...(props.renderer ? { renderer: props.renderer } : {}),
    },
  };
}

/**
 * Converts a `<Gauge>`: one measure on a dial from `valueMin` (0) to
 * `valueMax` (100), outlined by the arc it fills. A gauge with no value
 * reads nothing.
 */
function convertGauge(props: MuiChartProps, scope: string): MuiConvertedChart {
  const value = toValue(props.value);
  if (value === null)
    return { layers: [] };
  const point: GaugePoint = {
    value,
    min: toValue(props.valueMin) ?? 0,
    max: toValue(props.valueMax) ?? 100,
  };
  return {
    layers: [{
      id: '0',
      type: TraceType.GAUGE,
      selectors: gaugeValueSelector(scope),
      data: point,
    }],
  };
}

/**
 * Converts a `<RadarChart>`: one `radar` layer whose rows are the series and
 * whose columns are the spokes, named after `radar.metrics`. Each series is
 * outlined by its polygon, one vertex per spoke.
 */
function convertRadar(props: MuiChartProps, scope: string): MuiConvertedChart {
  const metrics = (props.radar?.metrics ?? []).map((metric, i) =>
    typeof metric === 'string'
      ? metric
      : (metric as MuiRadarMetric | undefined)?.name ?? `Metric ${i + 1}`);
  const all = seriesList(props);
  const rows: LinePoint[][] = all.map((series, index) => {
    const label = seriesLabel(series, index);
    const values = Array.isArray(series.data) ? series.data : [];
    return metrics.map((name, i) => ({ x: name, y: toValue(values[i]), z: label }));
  });
  if (rows.length === 0 || metrics.length === 0)
    return { layers: [] };
  return {
    layers: [{
      id: '0',
      type: TraceType.RADAR,
      selectors: all.map((series, index) => radarSeriesSelector(scope, muiSeriesId(series, index))),
      data: rows,
    }],
    legend: all.length > 1 ? all.map(seriesLabel) : undefined,
  };
}

/** An axis' values, turned round when the axis is drawn reversed. */
function drawnOrder<T>(values: readonly T[], axis: MuiAxisConfig | undefined): T[] {
  return axis?.reverse ? [...values].reverse() : [...values];
}

/**
 * Whether MUI draws a heatmap cell holding `value`: it draws a cell exactly
 * when the colour axis gives the value a colour.
 *
 * Every MUI colour scale answers `unknownColor ?? null` for a value it does
 * not cover: a missing or non-numeric value on a continuous or piecewise
 * map, and a value outside an ordinal map's `values` (its colour indices,
 * without them). A `zAxis` with no colour map gives nothing a colour.
 *
 * @param value - The cell's value as written
 * @param colorMap - The first `zAxis`' colour map, or `null` when the chart
 *                   gave a `zAxis` without one
 * @returns True when MUI draws the cell
 */
function heatmapCellDrawn(value: unknown, colorMap: MuiColorMap | null): boolean {
  if (colorMap === null)
    return false;
  const hasUnknown = typeof colorMap.unknownColor === 'string' && colorMap.unknownColor !== '';
  if (colorMap.type === 'ordinal') {
    const domain = colorMap.values ?? (colorMap.colors ?? []).map((_, index) => index);
    return domain.includes(value) || hasUnknown;
  }
  return toValue(value) !== null || hasUnknown;
}

/**
 * A heatmap axis' categories: its own `data`, or -- as MUI fills in an axis
 * without it -- the indices up to the largest one the entries use.
 */
function heatmapAxisValues(axis: MuiAxisConfig | undefined, entries: unknown[][], position: 0 | 1): readonly unknown[] {
  if (Array.isArray(axis?.data))
    return axis.data;
  const largest = Math.max(-1, ...entries.map(entry => Number(entry[position])).filter(Number.isFinite));
  return Array.from({ length: largest + 1 }, (_, index) => index);
}

/**
 * Converts a Pro `<Heatmap>`.
 *
 * MUI draws only the first series, one cell per `[xIndex, yIndex, value]`
 * entry that its colour axis gives a colour (see `heatmapCellDrawn`), in
 * data order, with the first y category at the top. The payload is the
 * grammar's top-first grid. A cell the data leaves out, or leaves without a
 * value, is a gap; a drawn cell is outlined, whatever its value.
 */
function convertHeatmap(props: MuiChartProps, scope: string): MuiConvertedChart {
  const xAxis = props.xAxis?.[0];
  const yAxis = props.yAxis?.[0];
  const first = seriesList(props)[0];
  const entries = (Array.isArray(first?.data) ? first.data : [])
    .filter((entry): entry is unknown[] => Array.isArray(entry));
  const xRaw = heatmapAxisValues(xAxis, entries, 0);
  const yRaw = heatmapAxisValues(yAxis, entries, 1);
  if (xRaw.length === 0 || yRaw.length === 0)
    return { layers: [] };
  // MUI's default colour axis is a continuous map when the chart gives none.
  const colorMap: MuiColorMap | null = props.zAxis === undefined
    ? { type: 'continuous' }
    : props.zAxis[0]?.colorMap ?? null;

  // Positions of each category on screen: left to right, top to bottom.
  const columns = drawnOrder(xRaw.map((_, i) => i), xAxis);
  const rows = drawnOrder(yRaw.map((_, i) => i), yAxis);
  const columnAt = new Map(columns.map((dataIndex, position) => [dataIndex, position]));
  const rowAt = new Map(rows.map((dataIndex, position) => [dataIndex, position]));

  const points: (number | null)[][] = rows.map(() => columns.map(() => null));
  const cells: (string | null)[][] = rows.map(() => columns.map(() => null));
  let drawn = 0;
  for (const [xi, yi, raw] of entries) {
    const column = columnAt.get(Number(xi));
    const row = rowAt.get(Number(yi));
    if (column === undefined || row === undefined)
      continue;
    points[row][column] = toValue(raw);
    if (heatmapCellDrawn(raw, colorMap)) {
      cells[row][column] = heatmapCellSelector(scope, drawn);
      drawn += 1;
    }
  }

  const data: HeatmapData = {
    x: columns.map(i => String(formatAxisValue(xRaw[i], xAxis))),
    y: rows.map(i => String(formatAxisValue(yRaw[i], yAxis))),
    points,
  };
  return {
    layers: [{
      id: '0',
      type: TraceType.HEATMAP,
      axes: layerAxes(props),
      // The grammar's selector grid runs bottom row first.
      selectors: [...cells].reverse(),
      data,
    }],
  };
}

/**
 * Converts a Pro `<FunnelChart>`: one `funnel` layer per series, its stages
 * in data order.
 *
 * MUI's default funnel stacks its stages down the page and draws each value
 * as a width, so the magnitude runs horizontally and the layer is `horz`
 * (the value in `x`). A `layout: 'horizontal'` series is the transpose.
 */
function convertFunnel(props: MuiChartProps, scope: string): MuiConvertedChart {
  const all = seriesList(props);
  const across = all.some(series => series.layout === 'horizontal');
  const titled = all.length > 1;
  const layers = all.map((series, index): MaidrLayer => {
    const items = Array.isArray(series.data) ? (series.data as unknown[]) : [];
    const categories = props.categoryAxis?.categories;
    const data: BarPoint[] = items.map((item, i) => {
      const datum = (item ?? {}) as Record<string, unknown>;
      let label: unknown = datum.label;
      if (typeof label === 'function') {
        try {
          label = (label as (location: string) => unknown)('legend');
        } catch {
          label = undefined;
        }
      }
      // The stage's own label, else the category axis' name for it -- which
      // is what MUI prints beside the section -- else its id.
      let stage = `Stage ${i + 1}`;
      if (typeof label === 'string' && label !== '')
        stage = label;
      else if (categories?.[i] !== undefined && categories[i] !== null)
        stage = String(categories[i]);
      else if (datum.id !== undefined && datum.id !== null)
        stage = String(datum.id);
      // MUI draws a stage with no value as a section of no width; it is read
      // as the zero it is drawn as.
      const value = toValue(datum.value) ?? 0;
      return across ? { x: stage, y: value } : { x: value, y: stage };
    });
    return {
      id: String(index),
      type: TraceType.FUNNEL,
      ...(titled ? { title: seriesLabel(series, index) } : {}),
      ...(across ? {} : { orientation: Orientation.HORIZONTAL }),
      axes: across
        ? { x: { label: 'Stage' }, y: { label: 'Value' } }
        : { x: { label: 'Value' }, y: { label: 'Stage' } },
      selectors: funnelSeriesSelector(scope, muiSeriesId(series, index)),
      data,
    };
  });
  return { layers };
}

/**
 * Converts a Pro `<SankeyChart>`, whose one series is an object: a `sankey`
 * layer of its links, each announced by its nodes' labels and outlined by
 * its own ribbon. A link without a finite value draws nothing to read.
 */
function convertSankey(props: MuiChartProps, scope: string, chartId: string): MuiConvertedChart {
  const series = (Array.isArray(props.series) ? undefined : props.series) as MuiSankeySeries | undefined;
  const nodes = series?.data?.nodes ?? [];
  const links = series?.data?.links ?? [];
  // The flow payload names nodes rather than identifying them, and MUI keys
  // them by id: two nodes sharing a label would merge into one node of the
  // reading. A shared label is told apart by its id.
  const labelCount = new Map<string, number>();
  for (const node of nodes) {
    if (node?.label)
      labelCount.set(node.label, (labelCount.get(node.label) ?? 0) + 1);
  }
  const names = new Map(nodes.filter(Boolean).map((node) => {
    const id = String(node.id);
    const label = node.label ?? id;
    return [id, (labelCount.get(label) ?? 0) > 1 ? `${label} (${id})` : label];
  }));
  const name = (id: string | number): string => names.get(String(id)) ?? String(id);

  const flows: FlowPoint[] = [];
  const selectors: string[] = [];
  const pairs = new Set<string>();
  let repeated = false;
  for (const link of links) {
    const value = toValue(link?.value);
    if (!link || value === null)
      continue;
    const pair = JSON.stringify([String(link.source), String(link.target)]);
    repeated = repeated || pairs.has(pair);
    pairs.add(pair);
    flows.push({ source: name(link.source), target: name(link.target), value });
    selectors.push(sankeyLinkSelector(scope, String(link.source), String(link.target)));
  }
  if (flows.length === 0)
    return { layers: [] };
  if (repeated) {
    warnOnce(
      chartId,
      'a sankey with two links between the same pair of nodes draws two ribbons that no selector '
      + 'can tell apart, so MAIDR reads every flow without outlining them.',
    );
  }
  return {
    layers: [{
      id: '0',
      type: TraceType.SANKEY,
      ...(series?.label ? { title: series.label } : {}),
      axes: {},
      // One selector per flow, each naming exactly one ribbon; with a
      // repeated pair a selector names two and the trace would decline the
      // whole list, so none is given.
      ...(repeated ? {} : { selectors }),
      data: flows,
    }],
  };
}

/**
 * Converts the props of one MUI X chart into MAIDR layers.
 *
 * A chart whose series declare a `type` other than `kind` -- the composition
 * API (`<ChartsContainer>` with bar and line plots together) -- is not read:
 * each series would be taken for the wrong mark. It converts to no layers,
 * with a console warning, rather than to a misleading reading.
 *
 * @param kind - Which chart the props belong to
 * @param props - The props the chart element was given
 * @param scope - Selector prefix naming the chart's container, e.g.
 *                `"#chart "` (trailing space included), or `""` for none
 * @returns The layers and, for multi-series charts, the legend
 */
export function convertMuiChart(
  kind: MuiChartKind,
  props: MuiChartProps,
  scope: string,
  chartId = 'chart',
  percentileBands?: MuiChartsAdapterConfig['percentileBands'],
): MuiConvertedChart {
  // A sparkline draws a line or bar plot but is configured by one `data`
  // array; read off its drawing, its kind says `line` or `bar` instead.
  const sparkline = kind === 'sparkline'
    || ((kind === 'bar' || kind === 'line') && !Array.isArray(props.series) && Array.isArray(props.data));
  if (sparkline) {
    const chart = sparklineAsChart(props, kind === 'sparkline' ? undefined : kind);
    return convertMuiChart(chart.kind, chart.props, scope, chartId);
  }

  const mixed = seriesList(props).some(series => series.type !== undefined && series.type !== kind);
  if (mixed) {
    warnOnce(
      chartId,
      'a chart whose series mix types (the ChartsContainer composition API) is not supported yet; '
      + 'it is left unread.',
    );
    return { layers: [] };
  }
  warnOnBatchRenderer(kind, props, chartId);
  switch (kind) {
    case 'bar':
      return convertBar(props, scope);
    case 'line':
      return convertLine(props, scope, percentileBands);
    case 'scatter':
      return convertScatter(props, scope);
    case 'pie':
      return convertPie(props, scope, chartId);
    case 'gauge':
      return convertGauge(props, scope);
    case 'radar':
      return convertRadar(props, scope);
    case 'heatmap':
      return convertHeatmap(props, scope);
    case 'funnel':
      return convertFunnel(props, scope);
    case 'sankey':
      return convertSankey(props, scope, chartId);
  }
}

/**
 * Builds the complete MAIDR payload for one MUI X chart.
 *
 * @param meta - Chart id, title, subtitle and caption
 * @param kind - Which chart the props belong to, or `undefined` if unknown
 * @param props - The props the chart element was given, or `undefined`
 * @param scope - Selector prefix naming the chart's container
 * @returns MAIDR data with a single subplot
 */
export function convertMuiChartsToMaidr(
  meta: Pick<MaidrData, 'id' | 'title' | 'subtitle' | 'caption'>,
  kind: MuiChartKind | undefined,
  props: MuiChartProps | undefined,
  scope: string,
  percentileBands?: MuiChartsAdapterConfig['percentileBands'],
): MaidrData {
  const { id, title, subtitle, caption } = meta;
  const converted = kind && props ? convertMuiChart(kind, props, scope, id, percentileBands) : { layers: [] };
  const subplot: MaidrSubplot = { layers: converted.layers };
  if (converted.legend)
    subplot.legend = converted.legend;
  return { id, title, subtitle, caption, subplots: [[subplot]] };
}
